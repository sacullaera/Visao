// ===== CONFIG =====
const EQUIPE_N1  = ["LUCAS VIEIRA AREAL","CLEIDSON DE JESUS SILVA"];
const MESES_PT   = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MESES_ABR  = ["Janeiro","Feveiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// ===== ESTADO =====
let state = {
  tab: "pendencias",
  subtab: "mensal",
  rawRows: {},
  processado: null,
  tecnico: "LUCAS VIEIRA AREAL"
};

document.getElementById("data-geracao").textContent = new Date().toLocaleDateString("pt-BR");

// ===== PARSE =====
function parseCSV(text){
  const lines = text.split(/\r?\n/);
  function splitLine(line){
    const r=[]; let c="", q=false;
    for(const ch of line){ if(ch==='"'){q=!q;}else if(ch===';'&&!q){r.push(c);c="";}else c+=ch; }
    r.push(c); return r;
  }
  const headers = splitLine(lines[0]).map(h=>h.replace(/^\uFEFF/,"").replace(/^"|"$/g,"").trim());
  const rows=[];
  for(let i=1;i<lines.length;i++){
    if(!lines[i].trim()) continue;
    const vals=splitLine(lines[i]).map(v=>v.replace(/^"|"$/g,"").trim());
    const row={}; headers.forEach((h,j)=>row[h]=vals[j]||""); rows.push(row);
  }
  return rows;
}

function splitBR(val){ return (val||"").split(/<br>/i).map(x=>x.trim()).filter(Boolean); }

function parseData(val){
  const s=(val||"").trim().substring(0,10);
  const m=s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? new Date(+m[3],+m[2]-1,+m[1]) : null;
}

// Última interação geral do chamado
function getRefData(row){
  let d=parseData(row["Data da solução"]); if(d) return d;
  const dac=splitBR(row["Acompanhamentos - Data"]).map(parseData).filter(Boolean);
  if(dac.length) return new Date(Math.max(...dac));
  const dta=splitBR(row["Tarefas - Data"]).map(parseData).filter(Boolean);
  if(dta.length) return new Date(Math.max(...dta));
  return null;
}

// Última interação de um técnico específico no chamado
function getRefDataTecnico(row, tecnico){
  const autoresAcomp = splitBR(row["Acompanhamentos - Autor"]||"");
  const datasAcomp   = splitBR(row["Acompanhamentos - Data"]||"");
  const autoresTask  = splitBR(row["Tarefas - Autor"]||"");
  const datasTask    = splitBR(row["Tarefas - Data"]||"");

  const candidatas = [];

  autoresAcomp.forEach((a,i) => {
    if(a.toUpperCase().includes(tecnico) && datasAcomp[i]){
      const d = parseData(datasAcomp[i]); if(d) candidatas.push(d);
    }
  });
  autoresTask.forEach((a,i) => {
    if(a.toUpperCase().includes(tecnico) && datasTask[i]){
      const d = parseData(datasTask[i]); if(d) candidatas.push(d);
    }
  });

  // Também verifica atribuição
  const atrib=(row["Atribuído - Técnico"]||"").toUpperCase();
  if(atrib.includes(tecnico)){
    const d=getRefData(row); if(d) candidatas.push(d);
  }

  return candidatas.length ? new Date(Math.max(...candidatas)) : null;
}

function atuouN1(row, tecnico){
  if(tecnico==="EQUIPE") return EQUIPE_N1.some(n=>atuouN1(row,n));
  const atores=new Set();
  splitBR(row["Tarefas - Autor"]||"").forEach(a=>atores.add(a.toUpperCase()));
  splitBR(row["Acompanhamentos - Autor"]||"").forEach(a=>atores.add(a.toUpperCase()));
  const atrib=(row["Atribuído - Técnico"]||"").toUpperCase().trim();
  if(EQUIPE_N1.some(n=>atrib.includes(n))) atores.add(atrib);
  return [...atores].some(a=>a.includes(tecnico));
}

// ===== SEMANAS ÚTEIS =====
function isoWeek(d){
  const jan4=new Date(d.getFullYear(),0,4);
  return Math.ceil((((d-jan4)/86400000)+jan4.getDay()+1)/7);
}
function semanasUteisMes(ano,mes){
  const result={};
  let d=new Date(ano,mes-1,1);
  const fim=new Date(ano,mes,0);
  while(d<=fim){
    if(d.getDay()>=1&&d.getDay()<=5){
      const iso=isoWeek(d);
      const key=`${ano}-W${String(iso).padStart(2,"0")}`;
      if(!result[key]) result[key]=[];
      result[key].push(new Date(d));
    }
    d=new Date(d.getTime()+86400000);
  }
  return Object.entries(result).sort((a,b)=>a[0].localeCompare(b[0])).map(([key,dias])=>({
    key, inicio:dias[0], fim:dias[dias.length-1]
  }));
}
function formatSemLabel(ini,fim){
  const di=ini.getDate(), mi=MESES_PT[ini.getMonth()];
  const df=fim.getDate(), mf=MESES_PT[fim.getMonth()];
  return mi===mf ? `${di} a ${df} de ${mi}` : `${di} de ${mi} a ${df} de ${mf}`;
}
function formatMesLabel(k){ const [y,m]=k.split("-"); return `${MESES_ABR[+m-1]}/${String(y).slice(2)}`; }

// ===== NOTIFICAÇÃO =====
function fecharNotif(){ document.getElementById("notif").classList.remove("visible"); }
function mostrarNotif(arquivos){
  document.getElementById("notif-texto").textContent =
    `Carga feita com sucesso dos arquivos: ${arquivos.join(", ")}`;
  document.getElementById("notif").classList.add("visible");
}

// ===== CARREGAR =====
function loadCSVs(input){
  const files=[...input.files]; if(!files.length) return;
  const nomes=files.map(f=>f.name);
  let loaded=0;
  files.forEach(f=>{
    const reader=new FileReader();
    reader.onload=e=>{
      parseCSV(e.target.result).forEach(r=>{
        const rid=r["ID"].replace(/\s/g,"").trim();
        if(rid&&!state.rawRows[rid]) state.rawRows[rid]=r;
      });
      loaded++;
      if(loaded===files.length){ mostrarNotif(nomes); processar(); render(); }
    };
    reader.readAsText(f,"UTF-8");
  });
}

// ===== PROCESSAR =====
function processar(){
  // Indexar por técnico + mês/semana (atuados) e por data geral (pendências)
  const atuadosMensal={}, atuadosSemanal={};

  Object.entries(state.rawRows).forEach(([rid,r])=>{

    // --- ATUADOS: data por técnico ---
    EQUIPE_N1.forEach(tecnico=>{
      if(!atuouN1(r,tecnico)) return;
      const dt=getRefDataTecnico(r,tecnico); if(!dt) return;
      const mk=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
      const isoT=isoWeek(dt);
      const sk=`${dt.getFullYear()}-W${String(isoT).padStart(2,"0")}`;
      if(!atuadosMensal[tecnico]) atuadosMensal[tecnico]={};
      if(!atuadosMensal[tecnico][mk]) atuadosMensal[tecnico][mk]=[];
      atuadosMensal[tecnico][mk].push([rid,r]);
      if(!atuadosSemanal[tecnico]) atuadosSemanal[tecnico]={};
      if(!atuadosSemanal[tecnico][mk]) atuadosSemanal[tecnico][mk]={};
      if(!atuadosSemanal[tecnico][mk][sk]) atuadosSemanal[tecnico][mk][sk]=[];
      atuadosSemanal[tecnico][mk][sk].push([rid,r]);
    });
  });

  state.processado={atuadosMensal, atuadosSemanal};
  atualizarSeletores();
}

function mesesDisponiveis(){
  if(!state.processado) return [];
  const tec=state.tecnico;
  if(tec==="EQUIPE"){
    const s=new Set();
    EQUIPE_N1.forEach(n=>Object.keys(state.processado.atuadosMensal[n]||{}).forEach(k=>s.add(k)));
    return [...s].sort();
  }
  return Object.keys(state.processado.atuadosMensal[tec]||{}).sort();
}

function atualizarSeletores(){
  const selMes=document.getElementById("sel-mes");
  const meses=mesesDisponiveis();
  selMes.innerHTML='<option value="">Selecione o mês...</option>'+
    meses.map(k=>`<option value="${k}">${formatMesLabel(k)}</option>`).join("");
  if(meses.length){ selMes.value=meses[meses.length-1]; onMesChange(); }
  else render();
}

function onMesChange(){
  const mesKey=document.getElementById("sel-mes").value;
  const selSem=document.getElementById("sel-semana");
  const wrapSem=document.getElementById("filtro-semana-wrap");
  const semAnterior=selSem.value;

  if(state.tab==="atuados"&&state.subtab==="semanal"){
    wrapSem.style.display="flex";
    if(!mesKey){ selSem.disabled=true; selSem.innerHTML='<option value="">Selecione a semana...</option>'; render(); return; }
    const [ano,mes]=mesKey.split("-").map(Number);
    const semanas=semanasUteisMes(ano,mes);
    let disponiveis={};
    const tec=state.tecnico;
    if(tec==="EQUIPE") EQUIPE_N1.forEach(n=>{ const d=(state.processado.atuadosSemanal[n]||{})[mesKey]||{}; Object.keys(d).forEach(k=>disponiveis[k]=true); });
    else disponiveis=(state.processado.atuadosSemanal[tec]||{})[mesKey]||{};
    selSem.innerHTML='<option value="">Selecione a semana...</option>'+
      semanas.filter(s=>disponiveis[s.key]).map(s=>`<option value="${s.key}">${formatSemLabel(s.inicio,s.fim)}</option>`).join("");
    selSem.disabled=false;
    const optAnterior=[...selSem.options].find(o=>o.value===semAnterior);
    if(optAnterior) selSem.value=semAnterior;
    else if(selSem.options.length>1) selSem.selectedIndex=selSem.options.length-1;
  } else {
    wrapSem.style.display="none";
  }
  render();
}

// ===== ABAS =====
function setTab(tab){
  state.tab=tab;
  document.querySelectorAll(".tab").forEach((t,i)=>t.classList.toggle("active",["pendencias","atuados"][i]===tab));

  const wrapPeriodo=document.getElementById("filtro-periodo-wrap");
  const subtabsEl=document.getElementById("subtabs");
  const wrapSem=document.getElementById("filtro-semana-wrap");

  if(tab==="pendencias"){
    wrapPeriodo.style.display="none";
    wrapSem.style.display="none";
    subtabsEl.style.display="none";
  } else {
    wrapPeriodo.style.display="flex";
    subtabsEl.style.display="flex";
  }

  if(state.processado) atualizarSeletores();
  else render();
}

function setSubtab(sub){
  state.subtab=sub;
  document.querySelectorAll(".subtab").forEach((t,i)=>t.classList.toggle("active",["mensal","semanal"][i]===sub));
  onMesChange();
}

// ===== TÉCNICO =====
function setTecnico(t,idx){
  state.tecnico=t;
  document.querySelectorAll(".tecnico-btn").forEach((b,i)=>b.classList.toggle("active",i===idx));
  if(state.processado) atualizarSeletores();
}

// ===== RESUMO =====
function calcResumo(items){
  let total=items.length, fechados=0, pendentes=0, esc_n2n3=0, ag_ap=0, ag_tec=0, ag_req=0, resol_n1=0;
  const atua={};
  EQUIPE_N1.forEach(n=>atua[n]=0);
  items.forEach(([rid,r])=>{
    const st=r["Status"].trim();
    if(st==="Fechado"||st==="Solucionado") fechados++; else pendentes++;
    const etags=(r["Plug-ins - Etiquetas"]||"").toUpperCase();
    if(etags.includes("ESCALONADO N2/N3")) esc_n2n3++;
    if(etags.includes("AGUARDANDO APROVAÇÃO")) ag_ap++;
    if(etags.includes("AGUARDANDO TERCEIRO")) ag_tec++;
    if(etags.includes("AGUARDANDO REQUERENTE")) ag_req++;
    if((st==="Fechado"||st==="Solucionado")&&!etags.includes("ESCALONADO N2/N3")) resol_n1++;
    EQUIPE_N1.forEach(n=>{ if(atuouN1(r,n)) atua[n]++; });
  });
  const statusMap={};
  items.forEach(([,r])=>{ const s=r["Status"].trim(); statusMap[s]=(statusMap[s]||0)+1; });
  return {total,fechados,pendentes,esc_n2n3,ag_ap,ag_tec,ag_req,resol_n1,atua,statusMap};
}

// ===== CHARTS =====
let charts={};
function destroyCharts(){ Object.values(charts).forEach(c=>c.destroy()); charts={}; }
function criarGrafico(id,tipo,labels,datasets,opts={}){
  const ctx=document.getElementById(id); if(!ctx) return;
  charts[id]=new Chart(ctx,{type:tipo,data:{labels,datasets},options:{
    responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:opts.legend!==false,position:"bottom",labels:{font:{size:11},boxWidth:14}}},
    scales:(tipo==="pie"||tipo==="doughnut")?{}:{
      y:{beginAtZero:true,grid:{color:"#EEF1F8"},ticks:{font:{size:11}}},
      x:{grid:{display:false},ticks:{font:{size:11}}}
    },...opts
  }});
}

// ===== HTML DOS BLOCOS =====
function htmlKPIsPendencias(r){
  return `
    <div class="nota-info">ℹ Esta tela mostra o estado atual da fila — todos os chamados com status "Pendente", independente do período de abertura.</div>
    <div class="kpi-grid">
      <div class="kpi-card vermelho"><div class="kpi-valor">${r.total}</div><div class="kpi-label">Total pendente</div><div class="kpi-sub">Chamados em aberto</div></div>
      <div class="kpi-card"><div class="kpi-valor">${r.esc_n2n3}</div><div class="kpi-label">Escalonados N2/N3</div><div class="kpi-sub">Aguardando equipe técnica</div></div>
      <div class="kpi-card amarelo"><div class="kpi-valor">${r.ag_ap}</div><div class="kpi-label">Aguardando Aprovação</div><div class="kpi-sub">Autorização DDS para dados sensíveis</div></div>
      <div class="kpi-card laranja"><div class="kpi-valor">${r.ag_tec}</div><div class="kpi-label">Aguardando Terceiro</div><div class="kpi-sub">Orientação da coordenação DDS</div></div>
      <div class="kpi-card"><div class="kpi-valor">${r.ag_req}</div><div class="kpi-label">Aguardando requerente</div><div class="kpi-sub">Pendente de retorno do usuário</div></div>
    </div>`;
}

function htmlKPIsAtuados(r, periodoLabel){
  const pct=r.total>0?Math.round(r.resol_n1/r.total*100):0;
  return `
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-valor">${r.total}</div><div class="kpi-label">Total atuado</div><div class="kpi-sub">${periodoLabel}</div></div>
      <div class="kpi-card verde"><div class="kpi-valor">${r.resol_n1}</div><div class="kpi-label">Resolvidos pelo N1</div><div class="kpi-sub">${pct}% do total</div></div>
      <div class="kpi-card"><div class="kpi-valor">${r.esc_n2n3}</div><div class="kpi-label">Escalonados N2/N3</div><div class="kpi-sub">Aguardando equipe técnica</div></div>
      <div class="kpi-card amarelo"><div class="kpi-valor">${r.ag_ap}</div><div class="kpi-label">Aguardando Aprovação</div><div class="kpi-sub">Autorização DDS para dados sensíveis</div></div>
      <div class="kpi-card laranja"><div class="kpi-valor">${r.ag_tec}</div><div class="kpi-label">Aguardando Terceiro</div><div class="kpi-sub">Orientação da coordenação DDS</div></div>
      <div class="kpi-card"><div class="kpi-valor">${r.ag_req}</div><div class="kpi-label">Aguardando requerente</div><div class="kpi-sub">Pendente de retorno</div></div>
    </div>`;
}



function htmlChartsBase(r){
  const stEntries=Object.entries(r.statusMap);
  return `
    <div class="charts-grid">
      <div class="chart-card"><div class="chart-title">Distribuição de status</div><div class="chart-wrap"><canvas id="chart-status"></canvas></div></div>
      <div class="chart-card"><div class="chart-title">Fluxo de chamados</div><div class="chart-wrap"><canvas id="chart-fluxo"></canvas></div></div>
    </div>`;
}

function htmlChartsPendencias(){
  return `
    <div class="charts-grid">
      <div class="chart-card full"><div class="chart-title">Fluxo de chamados</div><div class="chart-wrap"><canvas id="chart-fluxo"></canvas></div></div>
      </div>`;
}

function htmlAnalistas(r){
  return `
    <div class="nota">ℹ A soma dos indicadores individuais pode ser maior que o total — chamados com atuação de ambos os analistas são contabilizados para cada um individualmente.</div>
    <div class="analistas-grid">
      <div class="analista-card">
        <div class="analista-nome">Lucas Vieira Areal</div>
        <div class="analista-stats">
          <div class="analista-stat"><div class="analista-stat-val">${r.atua["LUCAS VIEIRA AREAL"]||0}</div><div class="analista-stat-label">Chamados com atuação</div></div>
          <div class="analista-stat"><div class="analista-stat-val">${r.total>0?Math.round((r.atua["LUCAS VIEIRA AREAL"]||0)/r.total*100):0}%</div><div class="analista-stat-label">Participação</div></div>
        </div>
      </div>
      <div class="analista-card verde-top">
        <div class="analista-nome">Cleidson de Jesus Silva</div>
        <div class="analista-stats">
          <div class="analista-stat"><div class="analista-stat-val">${r.atua["CLEIDSON DE JESUS SILVA"]||0}</div><div class="analista-stat-label">Chamados com atuação</div></div>
          <div class="analista-stat"><div class="analista-stat-val">${r.total>0?Math.round((r.atua["CLEIDSON DE JESUS SILVA"]||0)/r.total*100):0}%</div><div class="analista-stat-label">Participação</div></div>
        </div>
      </div>
    </div>`;
}

function renderCharts(r){
  const stEntries=Object.entries(r.statusMap);
  criarGrafico("chart-status","doughnut",
    stEntries.map(([k])=>k),
    [{data:stEntries.map(([,v])=>v),backgroundColor:["#2E5FA3","#2E7D32","#F9A825","#C62828"],borderWidth:2,borderColor:"#fff"}],
    {legend:true}
  );
  criarGrafico("chart-fluxo","bar",
    ["Resolvidos N1","Escalonados N2/N3","Ag. Aprovação","Ag. Terceiro","Ag. Requerente"],
    [{data:[r.resol_n1,r.esc_n2n3,r.ag_ap,r.ag_tec,r.ag_req],
      backgroundColor:["#2E7D32","#2E5FA3","#F9A825","#E65100","#90A4AE"],
      borderRadius:6,borderSkipped:false,label:"Chamados"}],
    {legend:false}
  );
}

function renderChartsPendencias(r){
  criarGrafico("chart-fluxo", "bar",
    ["Escalonados N2/N3", "Ag. Aprovação", "Ag. Terceiro", "Ag. Requerente"],
    [{data:[r.esc_n2n3,r.ag_ap,r.ag_tec,r.ag_req],
      backgroundColor:["#2E5FA3", "#F9A825","#E65100","#90a4ae"],
      borderRadius:6,borderSkipped:false,label:"Chamados"}],
      {legend:false}
  );
}

// ===== RENDER PRINCIPAL =====
function render(){
  if(!state.processado){ return; }
  destroyCharts();

  // === TELA 1: PENDÊNCIAS ===
  if(state.tab==="pendencias"){
    const tec=state.tecnico;
    let items=Object.entries(state.rawRows).filter(([,r])=>{
      if(r["Status"].trim()!=="Pendente") return false;
      const atrib=(r["Atribuído - Técnico"]||"").toUpperCase().trim();
      if(tec==="EQUIPE") return EQUIPE_N1.some(n=>atrib.includes(n));
      return atrib.includes(tec);
    });
    const r=calcResumo(items);
    document.getElementById("content").innerHTML=htmlKPIsPendencias(r)+htmlChartsPendencias();
    renderChartsPendencias(r);
    return;
  }

  // === TELA 2: ATUADOS ===
  if(state.tab==="atuados"){
    const mesKey=document.getElementById("sel-mes").value; if(!mesKey) return;
    const tec=state.tecnico;
    let items=[], periodoLabel="";

    if(state.subtab==="mensal"){
      periodoLabel=formatMesLabel(mesKey);
      if(tec==="EQUIPE"){
        const ids=new Set();
        EQUIPE_N1.forEach(n=>((state.processado.atuadosMensal[n]||{})[mesKey]||[]).forEach(([rid,r])=>{if(!ids.has(rid)){ids.add(rid);items.push([rid,r]);}}));
      } else {
        items=(state.processado.atuadosMensal[tec]||{})[mesKey]||[];
      }
    } else {
      const semKey=document.getElementById("sel-semana").value; if(!semKey) return;
      const [ano,mes]=mesKey.split("-").map(Number);
      const sems=semanasUteisMes(ano,mes);
      const sem=sems.find(s=>s.key===semKey);
      periodoLabel=sem?formatSemLabel(sem.inicio,sem.fim):semKey;
      if(tec==="EQUIPE"){
        const ids=new Set();
        EQUIPE_N1.forEach(n=>{
          const d=((state.processado.atuadosSemanal[n]||{})[mesKey]||{})[semKey]||[];
          d.forEach(([rid,r])=>{if(!ids.has(rid)){ids.add(rid);items.push([rid,r]);}});
        });
      } else {
        items=((state.processado.atuadosSemanal[tec]||{})[mesKey]||{})[semKey]||[];
      }
    }

    const r=calcResumo(items);
    const mostrarAnalistas=tec==="EQUIPE";
    document.getElementById("content").innerHTML=
      htmlKPIsAtuados(r,periodoLabel)+htmlChartsBase(r)+(mostrarAnalistas?htmlAnalistas(r):"");
    renderCharts(r);
    return;
  }

}
