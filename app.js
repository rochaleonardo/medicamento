"use strict";

const APP_VERSION = "1.2.0";
const DB_NAME = "MeuAcompanhamento";
const DB_VERSION = 2;
const FALLBACK_KEY = "meuAcompanhamentoDados";
const LEGACY_DB_NAME = "MeuAcompanhamento" + [65,116,111,109,111,120,101,116,105,110,97].map(code=>String.fromCharCode(code)).join("");
const INDICATORS = [
  ["attention","Atenção sustentada","Quanto você conseguiu manter a atenção em uma tarefa sem se distrair?"],
  ["startTasks","Iniciar tarefas","Quanto você conseguiu iniciar tarefas, inclusive aquelas que considera chatas ou pouco interessantes?"],
  ["finishTasks","Concluir tarefas","Quanto você conseguiu terminar aquilo que começou?"],
  ["memory","Esquecimentos","Como esteve sua capacidade de lembrar compromissos, objetos e tarefas?"],
  ["organization","Organização","Como esteve sua capacidade de organizar tarefas, compromissos e prioridades?"],
  ["thoughtDistraction","Distração por pensamentos","Quanto você conseguiu permanecer no que estava fazendo sem ser levado por outros pensamentos?"],
  ["conversations","Conversas","Quanto você conseguiu acompanhar uma conversa sem perder partes importantes?"],
  ["procrastination","Procrastinação","Quanto você conseguiu realizar tarefas sem adiá-las desnecessariamente?"]
];
const EFFECTS = [
  ["insomnia","Insônia"],["sleepiness","Sonolência"],["nausea","Náusea"],["dryMouth","Boca seca"],
  ["appetite","Diminuição do apetite"],["headache","Dor de cabeça"],["dizziness","Tontura"],
  ["tingling","Formigamento"],["palpitations","Palpitação"],["anxiety","Ansiedade/agitação"],
  ["sweating","Sudorese"],["constipation","Constipação"]
];
const INTENSITY = ["Ausente","Muito leve","Leve","Moderado","Forte","Muito forte"];
const COLORS = ["#0f766e","#0891b2","#b45309","#7c3aed","#be185d","#2563eb","#65a30d","#dc2626","#64748b","#14b8a6"];
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let db;
let storageMode = "indexeddb";
let fallbackMemory = {profile:[], settings:[], records:[], snapshots:[]};
let state = { profile:null, settings:{}, records:[], baselineId:null };
let pendingWorker = null;
let deferredInstallPrompt = null;

document.addEventListener("DOMContentLoaded", init);

async function init(){
  buildDynamicFields();
  bindEvents();
  $("#app-version").textContent = APP_VERSION;
  try{
    db = await openDB();
    await migrateLegacyDatabase();
    await loadState();
    if(state.profile){ showView("dashboard"); } else { setDefaultDates(); showView("setup"); }
    registerServiceWorker();
  }catch(error){
    console.error(error);
    storageMode = "fallback";
    await loadState();
    if(state.profile){ showView("dashboard"); } else { setDefaultDates(); showView("setup"); }
    showToast("Aplicativo aberto em modo local compatível com este navegador.");
  }
}

async function migrateLegacyDatabase(){
  if(storageMode!=="indexeddb" || !("databases" in indexedDB)) return;
  try{
    const existingProfile = await dbGetAll("profile");
    const existingRecords = await dbGetAll("records");
    if(existingProfile.length || existingRecords.length) return;
    const databases = await indexedDB.databases();
    if(!databases.some(item=>item.name===LEGACY_DB_NAME)) return;
    const legacy = await new Promise((resolve,reject)=>{
      const request=indexedDB.open(LEGACY_DB_NAME);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    for(const storeName of ["profile","settings","records"]){
      if(!legacy.objectStoreNames.contains(storeName)) continue;
      const items = await new Promise((resolve,reject)=>{
        const request=legacy.transaction(storeName,"readonly").objectStore(storeName).getAll();
        request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error);
      });
      for(const item of items) await dbPut(storeName,item);
    }
    legacy.close();
  }catch(error){ console.warn("Não foi possível migrar dados da versão anterior.",error); }
}

function openDB(){
  if(!("indexedDB" in window)){
    storageMode = "fallback";
    return Promise.resolve(null);
  }
  return new Promise((resolve,reject)=>{
    let request;
    try{ request = indexedDB.open(DB_NAME, DB_VERSION); }
    catch(error){ storageMode="fallback"; resolve(null); return; }
    request.onupgradeneeded = event => {
      const database = event.target.result;
      if(!database.objectStoreNames.contains("profile")) database.createObjectStore("profile",{keyPath:"id"});
      if(!database.objectStoreNames.contains("settings")) database.createObjectStore("settings",{keyPath:"key"});
      if(!database.objectStoreNames.contains("records")){
        const store = database.createObjectStore("records",{keyPath:"id"});
        store.createIndex("createdAt","createdAt");
      }
      if(!database.objectStoreNames.contains("snapshots")){
        const store = database.createObjectStore("snapshots",{keyPath:"id"});
        store.createIndex("createdAt","createdAt");
      }
    };
    request.onsuccess = ()=>resolve(request.result);
    request.onerror = ()=>{ storageMode="fallback"; resolve(null); };
    request.onblocked = ()=>{ storageMode="fallback"; resolve(null); };
  });
}

function idbRequest(storeName, mode, operation){
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(storeName,mode);
    const store = tx.objectStore(storeName);
    let request;
    try{ request = operation(store); }catch(error){ reject(error); return; }
    request.onsuccess = ()=>resolve(request.result);
    request.onerror = ()=>reject(request.error);
  });
}
function readFallback(){
  try{
    const saved = localStorage.getItem(FALLBACK_KEY);
    if(saved) fallbackMemory = {...fallbackMemory,...JSON.parse(saved)};
  }catch(error){ console.warn("Armazenamento local restrito; usando memória temporária.",error); }
  return fallbackMemory;
}
function writeFallback(data){
  fallbackMemory = data;
  try{ localStorage.setItem(FALLBACK_KEY,JSON.stringify(data)); }
  catch(error){ console.warn("Não foi possível persistir no armazenamento alternativo.",error); }
}
const dbGetAll = store => storageMode==="indexeddb" ? idbRequest(store,"readonly",s=>s.getAll()) : Promise.resolve([...(readFallback()[store]||[])]);
const dbPut = (store,value) => {
  if(storageMode==="indexeddb") return idbRequest(store,"readwrite",s=>s.put(value));
  const data=readFallback(),key=store==="settings"?"key":"id",items=[...(data[store]||[])],index=items.findIndex(item=>item[key]===value[key]);
  if(index>=0)items[index]=value;else items.push(value);data[store]=items;writeFallback(data);return Promise.resolve(value[key]);
};
const dbDelete = (store,keyValue) => {
  if(storageMode==="indexeddb") return idbRequest(store,"readwrite",s=>s.delete(keyValue));
  const data=readFallback(),key=store==="settings"?"key":"id";data[store]=(data[store]||[]).filter(item=>item[key]!==keyValue);writeFallback(data);return Promise.resolve();
};
const dbClear = store => {
  if(storageMode==="indexeddb") return idbRequest(store,"readwrite",s=>s.clear());
  const data=readFallback();data[store]=[];writeFallback(data);return Promise.resolve();
};

async function loadState(){
  const [profiles,settings,records] = await Promise.all([dbGetAll("profile"),dbGetAll("settings"),dbGetAll("records")]);
  state.profile = profiles.find(p=>p.id==="main") || null;
  state.settings = Object.fromEntries(settings.map(item=>[item.key,item.value]));
  state.records = records.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  state.baselineId = state.settings.baselineId || state.records.find(r=>r.isBaseline)?.id || null;
}

function buildBackupPayload(date=new Date()){
  return {version:1,appVersion:APP_VERSION,backupDate:date.toISOString(),profile:state.profile,settings:{...state.settings},records:[...state.records],baselineId:state.baselineId};
}

async function createInternalSnapshot(reason){
  if(!state.profile) return;
  const now=new Date();
  const snapshot={id:createId(),createdAt:now.toISOString(),reason,data:buildBackupPayload(now)};
  await dbPut("snapshots",snapshot);
  const snapshots=(await dbGetAll("snapshots")).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  for(const old of snapshots.slice(5)) await dbDelete("snapshots",old.id);
}

function backupStatus(){
  const interval=Number(state.settings.backupInterval||7);
  const last=state.settings.lastExternalBackupAt||null;
  const reference=last||state.profile?.createdAt||(state.profile?.startDate?parseLocalDate(state.profile.startDate).toISOString():new Date().toISOString());
  const elapsed=Math.max(0,Math.floor((Date.now()-new Date(reference).getTime())/86400000));
  return {interval,last,elapsed,overdue:elapsed>=interval};
}

async function markExternalBackup(){
  const now=new Date().toISOString();
  await saveSetting("lastExternalBackupAt",now);
  await createInternalSnapshot("Backup externo realizado");
  if(!$("#backup-view").classList.contains("hidden")) await renderBackup(); else renderBackupStatus();
  renderDashboardBackupAlert();
}

function buildDynamicFields(){
  $("#indicator-list").innerHTML = INDICATORS.map((item,index)=>`<article class="question-card"><div><div class="question-number">Indicador ${index+1} de 8</div><h2>${escapeHtml(item[1])}</h2><p>${escapeHtml(item[2])}</p></div><output class="range-value" id="${item[0]}-value" for="${item[0]}">5</output><label class="range-wrap" aria-label="${escapeHtml(item[1])}: de zero a dez"><span>0</span><input id="${item[0]}" name="${item[0]}" type="range" min="0" max="10" step="1" value="5"><span>10</span></label></article>`).join("");
  $("#effects-list").innerHTML = EFFECTS.map(item=>`<div class="effect-row"><label><input type="checkbox" class="effect-check" data-effect="${item[0]}"><span>${escapeHtml(item[1])}</span></label><select class="effect-level" data-effect="${item[0]}" aria-label="Intensidade de ${escapeHtml(item[1])}" disabled>${INTENSITY.slice(1).map((name,i)=>`<option value="${i+1}">${i+1} — ${name}</option>`).join("")}</select></div>`).join("");
  $("#metric-toggles").innerHTML = [["average","Média geral"],...INDICATORS.map(i=>[i[0],i[1]]),["sleepQuality","Qualidade do sono"]].map((m,i)=>`<label><input class="metric-toggle" type="checkbox" value="${m[0]}" ${i===0?"checked":""}><span>${escapeHtml(m[1])}</span></label>`).join("");
  $("#effect-select").innerHTML = EFFECTS.map(e=>`<option value="${e[0]}">${escapeHtml(e[1])}</option>`).join("");
}

function bindEvents(){
  document.addEventListener("click",event=>{
    const go = event.target.closest("[data-go]");
    if(go){ event.preventDefault(); showView(go.dataset.go); }
  });
  $("#brand-home").addEventListener("click",()=>state.profile && showView("dashboard"));
  $("#setup-form").addEventListener("submit",saveInitialProfile);
  $("#settings-form").addEventListener("submit",saveSettings);
  $("#evaluation-form").addEventListener("submit",saveRecord);
  INDICATORS.forEach(i=>$("#"+i[0]).addEventListener("input",e=>$("#"+i[0]+"-value").textContent=e.target.value));
  $("#sleep-quality").addEventListener("input",e=>$("#sleep-quality-value").textContent=e.target.value);
  $$(".effect-check").forEach(box=>box.addEventListener("change",e=>{
    const select = $(`.effect-level[data-effect="${e.target.dataset.effect}"]`);
    select.disabled = !e.target.checked;
    if(e.target.checked && !select.value) select.value="1";
  }));
  $("#history-list").addEventListener("click",handleHistoryAction);
  $$(".metric-toggle").forEach(input=>input.addEventListener("change",renderEvolutionChart));
  $("#effect-select").addEventListener("change",renderEffectsChart);
  window.addEventListener("resize",debounce(()=>{ if(!$("#evolution-view").classList.contains("hidden")){renderEvolutionChart();renderEffectsChart();}},180));
  $("#export-csv").addEventListener("click",exportCSV);
  $("#export-json").addEventListener("click",()=>exportJSON(true));
  $("#share-json").addEventListener("click",shareJSON);
  $("#export-all").addEventListener("click",()=>exportJSON(true));
  $("#import-json").addEventListener("change",importJSON);
  $$("input[name='backupInterval']").forEach(input=>input.addEventListener("change",changeBackupInterval));
  $("#internal-snapshots").addEventListener("click",restoreInternalSnapshot);
  $("#delete-all").addEventListener("click",confirmDeleteAll);
  $("#install-btn").addEventListener("click",installApp);
  $("#update-app").addEventListener("click",()=>pendingWorker?.postMessage({type:"SKIP_WAITING"}));
  window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredInstallPrompt=event;$("#install-btn").classList.remove("hidden");});
  window.addEventListener("appinstalled",()=>{$("#install-btn").classList.add("hidden");deferredInstallPrompt=null;showToast("Aplicativo instalado.");});
  window.addEventListener("hashchange",()=>{ const route=location.hash.replace("#",""); if(route && state.profile) showView(route,false); });
}

function setDefaultDates(){ $("#setup-start-date").value = localDateInput(new Date()); }

async function saveInitialProfile(event){
  event.preventDefault();
  const profile = readProfileForm("setup");
  profile.id="main"; profile.createdAt=new Date().toISOString();
  await dbPut("profile",profile); state.profile=profile;
  await createInternalSnapshot("Configuração inicial");
  showToast("Acompanhamento configurado."); showView("dashboard");
}

function readProfileForm(prefix){
  return {
    name:$(`#${prefix}-name`).value.trim(), startDate:$(`#${prefix}-start-date`).value,
    medication:$(`#${prefix}-medication`).value.trim(), activeIngredient:$(`#${prefix}-active`).value.trim(),
    dose:Number($(`#${prefix}-dose`).value), otherMedications:$(`#${prefix}-other-meds`).value.trim(),
    notes:$(`#${prefix}-notes`).value.trim(), updatedAt:new Date().toISOString()
  };
}

async function saveSettings(event){
  event.preventDefault(); const updated=readProfileForm("settings");
  state.profile={...state.profile,...updated,id:"main"}; await dbPut("profile",state.profile);
  await createInternalSnapshot("Perfil ou tratamento alterado");
  showToast("Configurações salvas."); renderDashboard();
}

function showView(name,updateHash=true){
  if(!state.profile && name!=="setup") name="setup";
  const valid=["setup","dashboard","evaluation","history","evolution","comparison","backup","settings"];
  if(!valid.includes(name)) name=state.profile?"dashboard":"setup";
  $$(".view").forEach(v=>v.classList.add("hidden"));
  $(`#${name}-view`).classList.remove("hidden");
  $("#bottom-nav").classList.toggle("hidden",name==="setup");
  $$("#bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.go===name));
  if(updateHash && location.hash!=="#"+name) history.pushState(null,"","#"+name);
  if(name==="dashboard") renderDashboard();
  if(name==="evaluation") prepareEvaluation();
  if(name==="history") renderHistory();
  if(name==="evolution") renderEvolution();
  if(name==="comparison") renderComparison();
  if(name==="backup") renderBackup();
  if(name==="settings") fillSettings();
  window.scrollTo({top:0,behavior:"smooth"});
  setTimeout(()=>$("#main-content").focus({preventScroll:true}),0);
}

function renderDashboard(){
  const profile=state.profile; if(!profile)return;
  $("#dashboard-name").textContent=profile.name || "bem-vindo";
  $("#dashboard-treatment").textContent=`${profile.medication} — ${formatDose(profile.dose)}`;
  $("#dashboard-start").textContent=formatDate(profile.startDate);
  $("#dashboard-day").textContent=`Dia ${dayOfTreatment(new Date())}`;
  const latest=state.records[state.records.length-1];
  $("#dashboard-last").textContent=latest?`${formatDate(latest.date)} · média ${formatNumber(latest.average)}`:"Ainda não realizada";
  const box=$("#dashboard-summary");
  if(!state.records.length) box.innerHTML="<strong>Comece pelo seu marco inicial.</strong> A primeira avaliação será sugerida como referência para as próximas.";
  else if(state.baselineId){ const baseline=state.records.find(r=>r.id===state.baselineId); box.innerHTML=baseline?`Você tem <strong>${state.records.length} ${state.records.length===1?"registro":"registros"}</strong>. Marco inicial em ${formatDate(baseline.date)}.`:""; }
  else box.innerHTML=`Você tem <strong>${state.records.length} registros</strong>. Ainda não há marco inicial definido.`;
  renderDashboardBackupAlert();
}

function renderDashboardBackupAlert(){
  const alert=$("#dashboard-backup-alert");
  if(!alert||!state.profile)return;
  const status=backupStatus();
  alert.classList.toggle("hidden",!status.overdue);
  if(status.overdue) alert.innerHTML=`<strong>Backup externo atrasado</strong><p>Já se passaram ${status.elapsed} dia(s) desde a última referência de backup. <button class="button button-secondary compact" data-go="backup" type="button">Fazer backup agora</button></p>`;
}

function prepareEvaluation(record=null){
  if(!record) resetEvaluationForm();
  if(record){ fillEvaluation(record); return; }
  $("#evaluation-kicker").textContent="Nova avaliação"; $("#evaluation-title").textContent="Como você esteve?";
  $("#record-medication").value=state.profile.medication; $("#record-dose").value=state.profile.dose;
  if(!state.records.length && !state.baselineId) $("#is-baseline").checked=true;
}

function resetEvaluationForm(){
  $("#evaluation-form").reset(); $("#record-id").value="";
  INDICATORS.forEach(i=>{$("#"+i[0]).value=5;$("#"+i[0]+"-value").textContent="5";});
  $("#sleep-quality").value=5;$("#sleep-quality-value").textContent="5";
  $$(".effect-level").forEach(s=>s.disabled=true);
}

function collectRecord(){
  const existingId=$("#record-id").value;
  const existing=state.records.find(r=>r.id===existingId);
  const scores=Object.fromEntries(INDICATORS.map(i=>[i[0],Number($("#"+i[0]).value)]));
  const effects={};
  EFFECTS.forEach(e=>{ const checked=$(`.effect-check[data-effect="${e[0]}"]`).checked; effects[e[0]]=checked?Number($(`.effect-level[data-effect="${e[0]}"]`).value):0; });
  const now=new Date();
  const sleepEntered=$("#sleep-start").value||$("#sleep-end").value||$("#awakenings").value||$("#sleep-notes").value.trim();
  return {
    id:existingId||createId(),createdAt:existing?.createdAt||now.toISOString(),updatedAt:now.toISOString(),
    date:existing?.date||localDateInput(now),time:existing?.time||now.toTimeString().slice(0,5),day:existing?.day||dayOfTreatment(now),
    medication:$("#record-medication").value.trim(),dose:Number($("#record-dose").value),medicationTime:$("#medication-time").value,
    tookDose:document.querySelector('input[name="tookDose"]:checked')?.value||"nao_informado",
    scores,average:average(Object.values(scores)),concreteExample:$("#concrete-example").value.trim(),effects,
    otherEffect:$("#other-effect").value.trim(),effectsNotes:$("#effects-notes").value.trim(),
    sleep:{start:$("#sleep-start").value,end:$("#sleep-end").value,awakenings:$("#awakenings").value===""?null:Number($("#awakenings").value),quality:sleepEntered?Number($("#sleep-quality").value):null,notes:$("#sleep-notes").value.trim()},
    isBaseline:$("#is-baseline").checked
  };
}

async function saveRecord(event){
  event.preventDefault(); const wasEditing=Boolean($("#record-id").value); const record=collectRecord();
  if(record.isBaseline && state.baselineId && state.baselineId!==record.id){
    const confirmed=await modalConfirm("Substituir marco inicial?","Já existe um marco inicial. O registro anterior continuará no histórico, mas deixará de ser a referência.","Substituir");
    if(!confirmed)return;
    const old=state.records.find(r=>r.id===state.baselineId); if(old){old.isBaseline=false;await dbPut("records",old);}
  }
  if(record.isBaseline){ state.baselineId=record.id; await saveSetting("baselineId",record.id); }
  else if(state.baselineId===record.id){
    const confirmed=await modalConfirm("Remover marco inicial?","Este registro deixará de ser usado como referência nas comparações.","Remover");
    if(!confirmed){record.isBaseline=true;} else {state.baselineId=null;await saveSetting("baselineId",null);}
  }
  await dbPut("records",record); const index=state.records.findIndex(r=>r.id===record.id);
  if(index>=0)state.records[index]=record;else state.records.push(record);
  state.records.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  await createInternalSnapshot(wasEditing?"Avaliação editada":"Avaliação criada");
  resetEvaluationForm(); showToast("Avaliação salva neste dispositivo."); showView("history");
}

async function saveSetting(key,value){state.settings[key]=value;await dbPut("settings",{key,value});}

function fillEvaluation(record){
  resetEvaluationForm(); $("#record-id").value=record.id; $("#evaluation-kicker").textContent="Editar registro"; $("#evaluation-title").textContent=formatDate(record.date);
  INDICATORS.forEach(i=>{$("#"+i[0]).value=record.scores[i[0]];$("#"+i[0]+"-value").textContent=record.scores[i[0]];});
  $("#concrete-example").value=record.concreteExample||""; $("#other-effect").value=record.otherEffect||""; $("#effects-notes").value=record.effectsNotes||"";
  EFFECTS.forEach(e=>{const level=Number(record.effects?.[e[0]]||0), box=$(`.effect-check[data-effect="${e[0]}"]`), select=$(`.effect-level[data-effect="${e[0]}"]`);box.checked=level>0;select.disabled=level===0;if(level)select.value=level;});
  $("#sleep-start").value=record.sleep?.start||"";$("#sleep-end").value=record.sleep?.end||"";$("#awakenings").value=record.sleep?.awakenings??"";$("#sleep-quality").value=record.sleep?.quality??5;$("#sleep-quality-value").textContent=record.sleep?.quality??5;$("#sleep-notes").value=record.sleep?.notes||"";
  $("#record-medication").value=record.medication;$("#record-dose").value=record.dose;$("#medication-time").value=record.medicationTime||"";
  const doseRadio=document.querySelector(`input[name="tookDose"][value="${record.tookDose||"nao_informado"}"]`);if(doseRadio)doseRadio.checked=true;
  $("#is-baseline").checked=record.id===state.baselineId;
}

function renderHistory(){
  const list=$("#history-list");
  if(!state.records.length){list.innerHTML=`<div class="card empty-state"><strong>Nenhuma avaliação registrada</strong><p>Faça sua primeira avaliação para começar a acompanhar mudanças ao longo do tempo.</p><button class="button button-primary" data-go="evaluation">Fazer avaliação</button></div>`;return;}
  list.innerHTML=[...state.records].reverse().map(r=>{
    const effectText=effectSummary(r); const sleep=r.sleep?.quality!==null&&r.sleep?.quality!==undefined?`Sono: ${r.sleep.quality}/10`:"";
    return `<article class="card record-card"><div><h2>${formatDate(r.date)} ${r.id===state.baselineId?'<span class="baseline-tag">Marco inicial</span>':""}</h2><div class="record-meta"><span>Dia ${r.day}</span><span>${escapeHtml(r.medication)} — ${formatDose(r.dose)}</span><span>Média: ${formatNumber(r.average)} / 10</span></div><p class="record-effects">${[sleep,effectText].filter(Boolean).join(" · ")||"Nenhum efeito ou dado de sono registrado."}</p></div><div class="record-actions"><button class="button button-secondary" data-action="view" data-id="${r.id}">Ver</button><button class="button button-secondary" data-action="edit" data-id="${r.id}">Editar</button><button class="button button-ghost" data-action="delete" data-id="${r.id}">Excluir</button></div></article>`;
  }).join("");
}

async function handleHistoryAction(event){
  const button=event.target.closest("[data-action]");if(!button)return;
  const record=state.records.find(r=>r.id===button.dataset.id);if(!record)return;
  if(button.dataset.action==="edit"){showView("evaluation");fillEvaluation(record);}
  if(button.dataset.action==="view") showRecordModal(record);
  if(button.dataset.action==="delete"){
    const ok=await modalConfirm("Excluir registro?","Tem certeza de que deseja excluir este registro? Esta ação não poderá ser desfeita.","Excluir",true);if(!ok)return;
    await dbDelete("records",record.id);state.records=state.records.filter(r=>r.id!==record.id);
    if(state.baselineId===record.id){state.baselineId=null;await saveSetting("baselineId",null);}
    await createInternalSnapshot("Avaliação excluída");renderHistory();showToast("Registro excluído.");
  }
}

function showRecordModal(r){
  const rows=INDICATORS.map(i=>`<tr><td>${escapeHtml(i[1])}</td><td>${r.scores[i[0]]}/10</td></tr>`).join("");
  const effects=EFFECTS.filter(e=>r.effects?.[e[0]]>0).map(e=>`${e[1]}: ${INTENSITY[r.effects[e[0]]]}`).join("; ")||"Nenhum";
  showModal(`${formatDate(r.date)} · Dia ${r.day}`,`<p><strong>${escapeHtml(r.medication)} — ${formatDose(r.dose)}</strong></p><div class="comparison-table-wrap"><table class="comparison-table"><tbody>${rows}<tr><td><strong>Média</strong></td><td><strong>${formatNumber(r.average)}</strong></td></tr></tbody></table></div><p><strong>Exemplo:</strong> ${escapeHtml(r.concreteExample||"Não informado")}</p><p><strong>Efeitos e sensações:</strong> ${escapeHtml(effects)}</p><p><strong>Observações:</strong> ${escapeHtml(r.effectsNotes||"Não informado")}</p>`,[{label:"Fechar",className:"button-secondary"}]);
}

function renderEvolution(){
  const baseline=state.records.find(r=>r.id===state.baselineId),current=state.records[state.records.length-1];
  const initial=baseline?.average,currentAvg=current?.average,delta=initial!=null&&currentAvg!=null?currentAvg-initial:null;
  $("#evolution-stats").innerHTML=[["Média inicial",initial],["Média atual",currentAvg],["Variação desde o marco",delta]].map((s,i)=>`<div class="card stat-card"><span>${s[0]}</span><strong>${s[1]==null?"—":`${i===2&&s[1]>0?"+":""}${formatNumber(s[1])}${i===2?" ponto(s)":" / 10"}`}</strong></div>`).join("");
  renderEvolutionChart();renderEffectsChart();
}

function renderEvolutionChart(){
  const selected=$$(".metric-toggle:checked").map(i=>i.value);
  const labels=[["average","Média geral"],...INDICATORS.map(i=>[i[0],i[1]]),["sleepQuality","Qualidade do sono"]];
  const series=selected.map((key,index)=>({label:labels.find(l=>l[0]===key)?.[1]||key,color:COLORS[index%COLORS.length],values:state.records.map(r=>key==="average"?r.average:key==="sleepQuality"?r.sleep?.quality:r.scores?.[key])}));
  const empty=$("#evolution-empty"),canvas=$("#evolution-chart");
  if(!state.records.length||!selected.length){canvas.classList.add("hidden");empty.classList.remove("hidden");empty.innerHTML="<strong>Dados insuficientes</strong><p>Registre avaliações e selecione ao menos um indicador.</p>";$("#chart-legend").innerHTML="";return;}
  canvas.classList.remove("hidden");empty.classList.add("hidden");drawLineChart(canvas,state.records.map(r=>`Dia ${r.day}`),series,10,state.records.findIndex(r=>r.id===state.baselineId));
  $("#chart-legend").innerHTML=series.map(s=>`<span class="legend-item"><i class="legend-dot" style="background:${s.color}"></i>${escapeHtml(s.label)}</span>`).join("");
}

function renderEffectsChart(){
  const key=$("#effect-select").value||EFFECTS[0][0],effect=EFFECTS.find(e=>e[0]===key),values=state.records.map(r=>r.effects?.[key]||0);
  const canvas=$("#effects-chart"),empty=$("#effects-empty");
  if(!state.records.length){canvas.classList.add("hidden");empty.classList.remove("hidden");empty.innerHTML="<strong>Sem registros</strong><p>As sensações aparecerão aqui após as avaliações.</p>";$("#effects-timeline").innerHTML="";return;}
  canvas.classList.remove("hidden");empty.classList.add("hidden");drawLineChart(canvas,state.records.map(r=>`Dia ${r.day}`),[{label:effect[1],color:"#b45309",values}],5,state.records.findIndex(r=>r.id===state.baselineId));
  $("#effects-timeline").innerHTML=state.records.map((r,i)=>`<span class="timeline-pill">Dia ${r.day}: <strong>${values[i]}/5</strong></span>`).join("");
}

function drawLineChart(canvas,labels,series,maxY,baselineIndex){
  const ratio=Math.min(devicePixelRatio||1,2),cssW=Math.max(canvas.parentElement.clientWidth,320),cssH=parseInt(getComputedStyle(canvas).height)||340;
  canvas.width=cssW*ratio;canvas.height=cssH*ratio;const ctx=canvas.getContext("2d");ctx.scale(ratio,ratio);
  const pad={l:42,r:18,t:20,b:48},w=cssW-pad.l-pad.r,h=cssH-pad.t-pad.b;
  ctx.clearRect(0,0,cssW,cssH);ctx.font="12px system-ui";ctx.lineWidth=1;
  for(let y=0;y<=maxY;y+=(maxY===10?2:1)){const py=pad.t+h-(y/maxY)*h;ctx.strokeStyle="rgba(100,130,135,.22)";ctx.beginPath();ctx.moveTo(pad.l,py);ctx.lineTo(cssW-pad.r,py);ctx.stroke();ctx.fillStyle=getCss("--muted");ctx.textAlign="right";ctx.fillText(y,pad.l-9,py+4);}
  const x=i=>labels.length===1?pad.l+w/2:pad.l+(i/(labels.length-1))*w;
  if(baselineIndex>=0){ctx.fillStyle="rgba(15,118,110,.07)";ctx.fillRect(x(baselineIndex)-10,pad.t,20,h);}
  series.forEach(s=>{ctx.strokeStyle=s.color;ctx.lineWidth=2.5;ctx.beginPath();let started=false;s.values.forEach((v,i)=>{if(v==null)return;const px=x(i),py=pad.t+h-(Number(v)/maxY)*h;if(!started){ctx.moveTo(px,py);started=true}else ctx.lineTo(px,py)});ctx.stroke();s.values.forEach((v,i)=>{if(v==null)return;const px=x(i),py=pad.t+h-(Number(v)/maxY)*h;ctx.fillStyle=s.color;ctx.beginPath();ctx.arc(px,py,4,0,Math.PI*2);ctx.fill();if(i===baselineIndex){ctx.strokeStyle=getCss("--card");ctx.lineWidth=3;ctx.stroke();ctx.strokeStyle=s.color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(px,py,8,0,Math.PI*2);ctx.stroke();}});});
  const step=Math.max(1,Math.ceil(labels.length/6));ctx.fillStyle=getCss("--muted");ctx.textAlign="center";ctx.font="11px system-ui";labels.forEach((label,i)=>{if(i%step===0||i===labels.length-1)ctx.fillText(label,x(i),cssH-20);});
}

function renderComparison(){
  const box=$("#comparison-content"),baseline=state.records.find(r=>r.id===state.baselineId),current=state.records[state.records.length-1];
  if(!baseline||!current){box.innerHTML=`<div class="card empty-state"><strong>Comparação indisponível</strong><p>Defina um marco inicial e mantenha ao menos um registro para visualizar a comparação.</p><button class="button button-primary" data-go="history">Abrir histórico</button></div>`;return;}
  const rows=INDICATORS.map(i=>{const a=baseline.scores[i[0]],b=current.scores[i[0]],d=b-a;return `<tr><td>${escapeHtml(i[1])}</td><td>${a}</td><td>${b}</td><td class="${d>0?"delta-positive":d<0?"delta-negative":""}">${d>0?"+":""}${d}</td></tr>`}).join("");
  const avgDelta=current.average-baseline.average;
  box.innerHTML=`<div class="card section-card"><div class="comparison-table-wrap"><table class="comparison-table"><thead><tr><th>Indicador</th><th>Inicial<br><small>${formatDate(baseline.date)}</small></th><th>Atual<br><small>${formatDate(current.date)}</small></th><th>Diferença</th></tr></thead><tbody>${rows}<tr><td><strong>Média geral</strong></td><td><strong>${formatNumber(baseline.average)}</strong></td><td><strong>${formatNumber(current.average)}</strong></td><td class="${avgDelta>0?"delta-positive":avgDelta<0?"delta-negative":""}"><strong>${avgDelta>0?"+":""}${formatNumber(avgDelta)}</strong></td></tr></tbody></table></div><div class="comparison-note">Seus registros mostram uma mudança de <strong>${avgDelta>0?"+":""}${formatNumber(avgDelta)} ponto(s)</strong> na média desde o marco inicial. Essa diferença descreve apenas seus registros e não determina, isoladamente, uma resposta clínica ao medicamento.</div></div>`;
}

function fillSettings(){
  const p=state.profile;[["name",p.name],["start-date",p.startDate],["medication",p.medication],["active",p.activeIngredient],["dose",p.dose],["other-meds",p.otherMedications],["notes",p.notes]].forEach(([id,v])=>$("#settings-"+id).value=v??"");
}

function exportCSV(){
  if(!state.records.length){showToast("Ainda não há registros para exportar.",true);return;}
  const effectKeys=Object.fromEntries(EFFECTS);
  const headers=["Data","Hora","Dia_do_acompanhamento","Medicamento","Dose","Horario_medicamento","Tomou_dose","Atencao","Iniciar_tarefas","Concluir_tarefas","Esquecimentos","Organizacao","Distracao_pensamentos","Conversas","Procrastinacao","Media","Qualidade_sono","Horario_dormiu","Horario_acordou","Despertares","Insonia","Sonolencia","Nausea","Boca_seca","Apetite","Dor_cabeca","Tontura","Formigamento","Palpitacao","Ansiedade_agitacao","Sudorese","Constipacao","Outros","Exemplo_concreto","Observacoes","Observacoes_sono","Marco_inicial"];
  const rows=state.records.map(r=>[r.date,r.time,r.day,r.medication,r.dose,r.medicationTime,r.tookDose,r.scores.attention,r.scores.startTasks,r.scores.finishTasks,r.scores.memory,r.scores.organization,r.scores.thoughtDistraction,r.scores.conversations,r.scores.procrastination,formatNumber(r.average),r.sleep?.quality??"",r.sleep?.start||"",r.sleep?.end||"",r.sleep?.awakenings??"",r.effects.insomnia,r.effects.sleepiness,r.effects.nausea,r.effects.dryMouth,r.effects.appetite,r.effects.headache,r.effects.dizziness,r.effects.tingling,r.effects.palpitations,r.effects.anxiety,r.effects.sweating,r.effects.constipation,r.otherEffect,r.concreteExample,r.effectsNotes,r.sleep?.notes||"",r.id===state.baselineId?"Sim":"Não"]);
  const csv="\uFEFF"+[headers,...rows].map(row=>row.map(csvCell).join(";")).join("\r\n");
  downloadBlob(csv,`acompanhamento_${localDateInput(new Date())}.csv`,"text/csv;charset=utf-8");showToast("CSV exportado.");
}
function csvCell(value){const text=String(value??"").replace(/"/g,'""');return /[;"\r\n]/.test(text)?`"${text}"`:text;}

function makeBackupFile(){
  const content=JSON.stringify(buildBackupPayload(),null,2);
  const filename=`acompanhamento_backup_${localDateInput(new Date())}.json`;
  const file=typeof File==="function"?new File([content],filename,{type:"application/json"}):null;
  return {content,filename,file};
}

async function exportJSON(markAsExternal=false){
  const backup=makeBackupFile();
  downloadBlob(backup.content,backup.filename,"application/json");
  if(markAsExternal) await markExternalBackup();
  showToast("Backup JSON criado.");
}

async function shareJSON(){
  const backup=makeBackupFile();
  if(backup.file && navigator.share && (!navigator.canShare || navigator.canShare({files:[backup.file]}))){
    try{
      await navigator.share({title:"Backup - Meu Acompanhamento",text:"Backup dos meus registros do aplicativo Meu Acompanhamento.",files:[backup.file]});
      await markExternalBackup();showToast("Backup compartilhado.");return;
    }catch(error){
      if(error?.name==="AbortError")return;
      console.warn("Compartilhamento indisponível; usando download.",error);
    }
  }
  await exportJSON(true);
  showToast("O compartilhamento não está disponível neste navegador; o arquivo foi baixado.");
}

async function renderBackup(){
  renderBackupStatus();
  const interval=String(state.settings.backupInterval||7);
  const option=document.querySelector(`input[name="backupInterval"][value="${interval}"]`);
  if(option)option.checked=true;
  const snapshots=(await dbGetAll("snapshots")).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const list=$("#internal-snapshots");
  if(!snapshots.length){list.innerHTML='<div class="empty-state"><strong>Nenhuma cópia interna</strong><p>A primeira cópia será criada automaticamente após uma alteração.</p></div>';return;}
  list.innerHTML=snapshots.map(item=>`<div class="snapshot-item"><div><strong>${formatDateTime(item.createdAt)}</strong><small>${escapeHtml(item.reason||"Alteração registrada")} · ${item.data?.records?.length||0} registro(s)</small></div><button class="button button-secondary compact" data-snapshot-id="${item.id}" type="button">Restaurar esta cópia</button></div>`).join("");
}

function renderBackupStatus(){
  const box=$("#backup-status");if(!box||!state.profile)return;
  const status=backupStatus();
  box.classList.toggle("is-current",!status.overdue);
  const last=status.last?formatDateTime(status.last):"Nunca realizado";
  if(status.overdue){
    box.innerHTML=`<strong>Backup externo atrasado</strong><p>Último backup externo: ${last}. O lembrete está configurado para cada ${status.interval} dias.</p><button class="button button-primary compact" id="status-backup-now" type="button">Fazer backup agora</button>`;
    $("#status-backup-now").addEventListener("click",()=>exportJSON(true));
  }else{
    box.innerHTML=`<strong>Backup externo em dia</strong><p>Último backup externo: ${last}. Próximo lembrete após ${status.interval} dias.</p>`;
  }
}

async function changeBackupInterval(event){
  const days=Number(event.target.value);
  await saveSetting("backupInterval",days);
  await createInternalSnapshot(`Lembrete de backup alterado para ${days} dias`);
  await renderBackup();renderDashboardBackupAlert();
  showToast(`Lembrete configurado para cada ${days} dias.`);
}

async function restoreInternalSnapshot(event){
  const button=event.target.closest("[data-snapshot-id]");if(!button)return;
  const snapshots=await dbGetAll("snapshots"),snapshot=snapshots.find(item=>item.id===button.dataset.snapshotId);
  if(!snapshot)return;
  const ok=await modalConfirm("Restaurar cópia interna?",`Os dados atuais serão substituídos pela cópia de ${formatDateTime(snapshot.createdAt)}.`,"Restaurar");
  if(!ok)return;
  await applyBackupData(snapshot.data);
  await createInternalSnapshot("Cópia interna restaurada");
  showToast("Cópia interna restaurada.");showView("dashboard");
}

async function applyBackupData(data){
  validateBackup(data);
  await Promise.all([dbClear("records"),dbClear("profile"),dbClear("settings")]);
  state.profile=data.profile?{...data.profile,id:"main"}:null;
  state.records=dedupeRecords(data.records).map(normaliseRecord).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  state.settings={...(data.settings||{})};
  state.baselineId=data.baselineId||state.settings.baselineId||state.records.find(r=>r.isBaseline)?.id||null;
  if(state.profile)await dbPut("profile",state.profile);
  for(const record of state.records)await dbPut("records",record);
  for(const [key,value] of Object.entries(state.settings))await dbPut("settings",{key,value});
  await saveSetting("baselineId",state.baselineId);
}

async function importJSON(event){
  const file=event.target.files[0];event.target.value="";if(!file)return;
  let data;try{data=JSON.parse(await file.text());validateBackup(data);}catch(error){showToast(`Backup inválido: ${error.message}`,true);return;}
  const choice=await modalChoice("Backup validado",`<p>Foram encontrados <strong>${data.records.length} registro(s)</strong>.</p><p>Deseja substituir os registros atuais ou mesclar os registros, evitando duplicatas?</p>`,[{value:"merge",label:"Mesclar",className:"button-primary"},{value:"replace",label:"Substituir",className:"button-secondary"},{value:null,label:"Cancelar",className:"button-ghost"}]);
  if(!choice)return;
  if(choice==="replace"){await Promise.all([dbClear("records"),dbClear("profile"),dbClear("settings")]);state.records=[];}
  const merged=choice==="merge"?dedupeRecords([...state.records,...data.records]):dedupeRecords(data.records);
  if(data.profile){state.profile={...data.profile,id:"main"};await dbPut("profile",state.profile);}
  for(const record of merged)await dbPut("records",normaliseRecord(record));
  state.records=merged.map(normaliseRecord).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  state.settings={...(choice==="merge"?state.settings:{}),...(data.settings||{})};state.baselineId=data.baselineId||state.settings.baselineId||state.records.find(r=>r.isBaseline)?.id||null;
  for(const [key,value] of Object.entries(state.settings))await dbPut("settings",{key,value});
  await saveSetting("baselineId",state.baselineId);
  await createInternalSnapshot("Backup JSON restaurado");
  showToast(`${state.records.length} registro(s) disponível(is) após a restauração.`);showView("dashboard");
}

function validateBackup(data){
  if(!data||typeof data!=="object")throw new Error("estrutura não reconhecida");
  if(data.version!==1)throw new Error("versão de formato não suportada");
  if(!Array.isArray(data.records))throw new Error("lista de registros ausente");
  data.records.forEach((r,i)=>{if(!r.id||!r.date||!r.scores||INDICATORS.some(item=>!Number.isFinite(Number(r.scores[item[0]]))))throw new Error(`registro ${i+1} incompleto`);});
}
function normaliseRecord(r){const scores=Object.fromEntries(INDICATORS.map(i=>[i[0],clamp(Number(r.scores[i[0]]),0,10)]));return {...r,scores,average:average(Object.values(scores)),effects:Object.fromEntries(EFFECTS.map(e=>[e[0],clamp(Number(r.effects?.[e[0]]||0),0,5)]))};}
function dedupeRecords(records){const map=new Map();records.forEach(r=>{const key=r.id||`${r.date}|${r.time}|${r.medication}`;const prev=map.get(key);if(!prev||new Date(r.updatedAt||r.createdAt)>new Date(prev.updatedAt||prev.createdAt))map.set(key,r);});return [...map.values()];}

async function confirmDeleteAll(){
  const first=await modalConfirm("Apagar todos os dados?","Esta ação não poderá ser desfeita. Faça um backup antes de continuar.","Continuar",true);if(!first)return;
  const second=await modalChoice("Confirmação final",`<p>Digite <strong>APAGAR</strong> para remover definitivamente todos os dados deste dispositivo.</p><label>Confirmação<input id="delete-confirm-text" autocomplete="off"></label>`,[{value:"confirm",label:"Apagar definitivamente",className:"button-danger"},{value:null,label:"Cancelar",className:"button-secondary"}],()=>$("#delete-confirm-text").value.trim().toUpperCase()==="APAGAR");
  if(second!=="confirm"){if(second)showToast("Digite APAGAR para confirmar.",true);return;}
  await Promise.all([dbClear("records"),dbClear("profile"),dbClear("settings"),dbClear("snapshots")]);state={profile:null,settings:{},records:[],baselineId:null};resetEvaluationForm();setDefaultDates();showToast("Todos os dados foram apagados.");showView("setup");
}

function registerServiceWorker(){
  if(!("serviceWorker" in navigator)||location.protocol==="file:")return;
  navigator.serviceWorker.register("service-worker.js").then(reg=>{
    if(reg.waiting)showUpdate(reg.waiting);
    reg.addEventListener("updatefound",()=>{const worker=reg.installing;worker.addEventListener("statechange",()=>{if(worker.state==="installed"&&navigator.serviceWorker.controller)showUpdate(worker);});});
  }).catch(error=>console.warn("Service worker indisponível",error));
  navigator.serviceWorker.addEventListener("controllerchange",()=>location.reload());
}
function showUpdate(worker){pendingWorker=worker;$("#update-banner").classList.remove("hidden");}
async function installApp(){if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$("#install-btn").classList.add("hidden");}

function showModal(title,body,actions){
  $("#modal-title").textContent=title;$("#modal-body").innerHTML=body;const actionBox=$("#modal-actions");actionBox.innerHTML="";
  actions.forEach(a=>{const b=document.createElement("button");b.type="button";b.className=`button ${a.className||"button-secondary"}`;b.textContent=a.label;b.addEventListener("click",()=>{closeModal();a.onClick?.();});actionBox.appendChild(b);});
  $("#modal-backdrop").classList.remove("hidden");setTimeout(()=>actionBox.querySelector("button")?.focus(),0);
}
function closeModal(){$("#modal-backdrop").classList.add("hidden");}
function modalConfirm(title,message,confirmLabel,danger=false){return new Promise(resolve=>showModal(title,`<p>${escapeHtml(message)}</p>`,[{label:"Cancelar",className:"button-secondary",onClick:()=>resolve(false)},{label:confirmLabel,className:danger?"button-danger":"button-primary",onClick:()=>resolve(true)}]));}
function modalChoice(title,body,choices,validator){return new Promise(resolve=>{showModal(title,body,choices.map(c=>({...c,onClick:()=>{if(validator&&!validator()){showToast("Confira a confirmação solicitada.",true);resolve("invalid");}else resolve(c.value);}})));});}

function dayOfTreatment(date){const start=parseLocalDate(state.profile?.startDate||localDateInput(date));const current=new Date(date.getFullYear(),date.getMonth(),date.getDate());return Math.max(1,Math.floor((current-start)/86400000)+1);}
function parseLocalDate(value){const [y,m,d]=String(value).split("-").map(Number);return new Date(y,m-1,d);}
function localDateInput(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;}
function formatDate(value){if(!value)return"—";return new Intl.DateTimeFormat("pt-BR").format(parseLocalDate(value));}
function formatDateTime(value){if(!value)return"—";return new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value));}
function formatNumber(value){return new Intl.NumberFormat("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1}).format(Number(value));}
function formatDose(value){return `${new Intl.NumberFormat("pt-BR",{maximumFractionDigits:1}).format(Number(value))} mg`;}
function average(values){return values.reduce((sum,v)=>sum+Number(v),0)/values.length;}
function effectSummary(r){return EFFECTS.filter(e=>r.effects?.[e[0]]>0).map(e=>`${e[1]}: ${INTENSITY[r.effects[e[0]]].toLowerCase()}`).join(" · ");}
function escapeHtml(value){return String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
function downloadBlob(content,filename,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function showToast(message,error=false){const el=$("#toast");el.textContent=message;el.style.background=error?"#8f251e":"#16343d";el.classList.add("show");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>el.classList.remove("show"),3500);}
function clamp(value,min,max){return Math.min(max,Math.max(min,value));}
function createId(){
  if(window.crypto && typeof window.crypto.randomUUID==="function") return window.crypto.randomUUID();
  return "registro-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10);
}
function getCss(name){return getComputedStyle(document.documentElement).getPropertyValue(name).trim();}
function debounce(fn,wait){let timer;return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),wait);};}
