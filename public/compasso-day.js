/* Planejador do dia: uma só composição para o Início e o modo Dia da Agenda.
   Usa os dados e ações existentes (UI.calSel, agendaItems, doneOn, toggles, formulários). */
let dayOpen=null,dayFlip=null;
const dayCap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const dayCount=(n,one,many)=>`<span class="n">${n}</span> ${n===1?one:many}`;
const dayMin=tm=>/^\d\d:\d\d/.test(tm||'')?(+tm.slice(0,2))*60+(+tm.slice(3,5)):null;
const dayNow=()=>{const d=new Date();return d.getHours()*60+d.getMinutes()};
const dayIn=min=>min<60?`${min} min`:`${Math.floor(min/60)} h${min%60?` ${min%60}`:''}`;
function dayName(k){
 const d=daysBetween(today(),k);
 return d===0?'Hoje':d===1?'Amanhã':d===-1?'Ontem':dayCap(DOWF[pd(k).getDay()]);
}
function dayData(k){
 const isToday=k===today(),items=agendaItems(k);
 const late=isToday?S.tasks.filter(x=>!x.done&&x.due&&x.due<k):[];
 const lateIds=new Set(late.map(x=>x.id));
 const byPrio=(a,b)=>(a.prio||2)-(b.prio||2)||String(a.dueTime||'99').localeCompare(String(b.dueTime||'99'));
 const open=S.tasks.filter(x=>!x.done&&!lateIds.has(x.id)&&calendarOn(x,k,true)).sort(byPrio);
 const done=S.tasks.filter(x=>x.done&&(calendarOn(x,k,true)||(isToday&&String(x.doneAt||'').slice(0,10)===k)));
 const ghosts=k>=today()?taskGhosts(k):[];
 late.sort((a,b)=>a.due.localeCompare(b.due)||byPrio(a,b));
 const habits=k>today()?activeHabits().filter(x=>x.freq!=='weekly'&&hStart(x)<=k&&isSched(x,k)):isToday?dueToday():activeHabits().filter(x=>hStart(x)<=k&&(x.freq==='weekly'||isSched(x,k)||doneOn(x.id,k)));
 return {isToday,items,late,open,done,ghosts,habits};
}
function dayNext(items){
 const now=dayNow(),timed=items.map(x=>({x,a:dayMin(x.tm),b:dayMin(x.end)})).filter(i=>i.a!=null);
 const cur=timed.find(i=>i.a<=now&&(i.b!=null?now<i.b:now<i.a+1));
 if(cur)return {x:cur.x,text:`Agora: ${cur.x.title}`};
 const next=timed.find(i=>i.a>now);
 return next?{x:next.x,text:`Próximo: ${next.x.title} · às ${next.x.tm}, em ${dayIn(next.a-now)}`}:null;
}
function dayStrip(k){
 const mon=monOf(pd(k)),tk=today();
 const days=[...Array(7)].map((_,i)=>{
  const d=addD(mon,i),key=dk(d);
  const dots=[...gcalFor(key).map(()=>'var(--c1)'),...S.events.filter(e=>calendarOn(e,key)).map(e=>cv(catOf(e.cat).c)),...S.workouts.filter(w=>calendarOn(w,key)).map(w=>cv(WT[w.type].c)),...plannedOn(key).map(p=>cv(WT[p.type].c)),...S.tasks.filter(x=>calendarOn(x,key,true)&&!x.done).map(x=>cv(catOf(x.cat).c))].slice(0,4);
  return `<button class="dp-day ${key===tk?'is-today':''}" data-act="day-sel" data-k="${key}" aria-pressed="${key===k}" aria-label="${dayCap(DOWF[d.getDay()])}, ${fmtD(key)}${key===tk?', hoje':''}"><span class="dp-dow">${key===tk?'hoje':DOW[i]}</span><b>${d.getDate()}</b><span class="dp-dots">${dots.map(c=>`<i style="background:${c}"></i>`).join('')}</span></button>`;
 }).join('');
 return `<div class="dp-strip"><button class="iconbtn" aria-label="Semana anterior" data-act="day-week" data-d="-1">${ic('left')}</button><div class="dp-days" role="group" aria-label="Dias da semana">${days}</div><button class="iconbtn" aria-label="Próxima semana" data-act="day-week" data-d="1">${ic('right')}</button></div>`;
}
function dayNotice(){
 const cs=calStatus();if(cs.cls!=='err')return '';
 return `<div class="dp-notice" title="${esc(cs.t)}"><i class="dot err"></i><span>Google Calendar sem conexão</span>${gNeedsAuth()?'<button class="btn small" data-act="g-connect">Reconectar</button>':'<button class="btn small" data-act="settings">Ajustes</button>'}</div>`;
}
function dayFacts(rows,actions=''){
 return `<div class="dp-detail" data-key="detail">${rows.filter(Boolean).map(r=>`<div class="dp-fact">${r}</div>`).join('')}${actions?`<div class="dp-acts">${actions}</div>`:''}</div>`;
}
function dayItem(x,k,nowMark){
 const o=`i:${x.act||'g'}:${x.id||x.tm+x.title}`,open=dayOpen===o,min=dayMin(x.tm),now=dayNow();
 const past=k<today()||(k===today()&&min!=null&&(dayMin(x.end)??min+1)<=now);
 const ev=x.act==='event-edit'?S.events.find(e=>e.id===x.id):null,w=x.act==='w-edit'?S.workouts.find(e=>e.id===x.id):null;
 let detail='';
 if(open){
  const action=x.link?`<a class="btn small" href="${esc(x.link)}" target="_blank" rel="noopener">Abrir no Google</a>`:x.plan?`<button class="btn small" data-act="plan-log" data-id="${x.id}" data-k="${k}">Registrar treino</button>`:`<button class="btn small" data-act="${x.act}" data-id="${x.id}">${ic('edit')}Editar</button>`;
  detail=dayFacts([x.end?`${esc(x.tm)} até ${esc(x.end)}`:'',ev?.notes?esc(ev.notes):'',w?wSummary(w):''],action);
 }
 return `${nowMark?`<div class="dp-now" data-key="now"><span>${pad(Math.floor(now/60))}:${pad(now%60)}</span><i></i></div>`:''}<div class="it ${past?'past':''} ${x.plan?'is-plan':''}" data-key="${esc(o)}"><span class="tm">${esc(x.tm==='dia'?'o dia':x.tm)}</span><span class="bar" style="--cc:${x.cc}"></span><div class="dp-rowb"><button class="t" data-act="day-open" data-o="${esc(o)}" aria-expanded="${open}">${tn(x.title)}</button><div class="src">${esc(x.src)}</div>${detail}</div></div>`;
}
function dayTask(x,k){
 const o='t:'+x.id,open=dayOpen===o,g=goalOf(x.goalId);
 const detail=open?dayFacts([x.notes?esc(x.notes):'',x.dueTime?`Horário: ${esc(x.dueTime)}`:'',hasRec(x.rec)?`↻ ${esc(recLabel(x.rec))}`:'',g?`◎ ${esc(g.title)}`:''],`<button class="btn small" data-act="task-edit" data-id="${x.id}">${ic('edit')}Editar</button>`):'';
 return `<div class="row ${x.done?'done':''}" data-key="t:${x.id}" ${dragAttr(x)}><button class="check" role="checkbox" aria-checked="${!!x.done}" aria-label="Concluir ${esc(x.title)}" data-act="task-toggle" data-id="${x.id}">${CHECK}</button><div class="dp-rowb"><button class="t" data-act="day-open" data-o="${o}" aria-expanded="${open}">${tn(x.title)}</button><div class="dp-sub">${catChip(x.cat)}${hasRec(x.rec)?'<span class="recic">↻</span>':''}${g?'<span class="goalic">◎</span>':''}${x.notes?'<span>nota</span>':''}</div>${detail}</div><div class="dp-side">${x.prio==1?'<span class="prio p1" title="Prioridade alta">▲</span>':''}${dueBtn(x)}</div></div>`;
}
function dayHabit(x,k){
 const o='h:'+x.id,open=dayOpen===o,d=doneOn(x.id,k),s=streak(x),g=goalOf(x.goalId),c=consistency(x);
 const freq=x.freq==='weekly'?`${x.target||1}x por semana · ${weekCount(x,monOf(pd(k)))} nesta semana`:x.freq==='sched'?recLabel(x.rec):'todo dia';
 const detail=open?dayFacts([esc(freq),s.n?`Sequência: <span class="n">${s.n}</span> ${esc(s.unit)}`:'',c!=null?`<span class="n">${Math.round(c*100)}%</span> nos últimos 30 dias`:'',x.autoW?'Marcado sozinho pelos treinos':'',g?`◎ ${esc(g.title)}`:''],`<button class="btn small" data-act="habit-edit" data-id="${x.id}">${ic('edit')}Editar</button>`):'';
 return `<div class="row" data-key="h:${x.id}"><button class="check round" style="--accent:${hColor(x)};--accent-ink:var(--on-hab)" role="checkbox" aria-checked="${d}" aria-label="${esc(x.name)}" data-act="habit-toggle" data-id="${x.id}" data-k="${k}">${CHECK}</button><div class="dp-rowb"><button class="t hl-t" data-act="day-open" data-o="${o}" aria-expanded="${open}">${tn(x.name)}</button>${x.freq==='weekly'?`<div class="dp-sub"><span>${tn(`${weekCount(x,monOf(pd(k)))}/${x.target||1} na semana`)}</span></div>`:''}${detail}</div></div>`;
}
function daySection(title,n,body,add=''){
 return `<section class="dp-sec"><div class="dp-sec-h"><h3>${title}${n?` <span class="mono">${n}</span>`:''}</h3>${add}</div>${body}</section>`;
}
function dayPlanner(k,opt={}){
 const D=dayData(k),sd=pd(k),tk=today();
 const pending=D.late.length+D.open.length,hDone=k<=tk?D.habits.filter(x=>doneOn(x.id,k)).length:0,hLeft=D.habits.length-hDone;
 const next=D.isToday?dayNext(D.items):null;
 const parts=[D.items.length?dayCount(D.items.length,'compromisso','compromissos'):'',pending?`${dayCount(pending,'tarefa','tarefas')}${D.late.length?`, <em>${D.late.length} ${D.late.length===1?'atrasada':'atrasadas'}</em>`:''}`:'',hLeft?dayCount(hLeft,k>tk?'hábito previsto':'hábito a marcar',k>tk?'hábitos previstos':'hábitos a marcar'):''].filter(Boolean);
 const allDone=!pending&&!hLeft&&(D.done.length||hDone);
 const summary=allDone&&k<=tk?'Tudo feito neste dia.':parts.length?parts.join(' · '):'Dia livre.';
 const timed=D.items.filter(x=>dayMin(x.tm)!=null),now=dayNow();
 const firstFuture=D.isToday&&timed.length?D.items.findIndex(x=>{const m=dayMin(x.tm);return m!=null&&m>now}):-1;
 const showNow=D.isToday&&timed.length?(firstFuture<0?D.items.findLastIndex(x=>dayMin(x.tm)!=null)+1:firstFuture):-1;
 const agenda=D.items.length?`<div class="dp-list">${D.items.map((x,i)=>dayItem(x,k,i===showNow)).join('')}${showNow===D.items.length?`<div class="dp-now" data-key="now"><span>${pad(Math.floor(now/60))}:${pad(now%60)}</span><i></i></div>`:''}</div>`:`<p class="dp-empty">Nenhum compromisso${D.isToday?' hoje':' neste dia'}.</p>`;
 const label=(key,cls,text,n)=>n?`<div class="group-h ${cls}" data-key="l:${key}">${text} <span class="mono">${n}</span>${key==='late'?lateBtn(n):''}</div>`:'';
 const tasks=D.late.length+D.open.length+D.done.length+D.ghosts.length?`<div class="dp-list">${label('late','late',D.late.length===1?'Atrasada':'Atrasadas',D.late.length)}${D.late.map(x=>dayTask(x,k)).join('')}${label('day','',D.isToday?'Para hoje':'Neste dia',D.late.length?D.open.length:0)}${D.open.map(x=>dayTask(x,k)).join('')}${D.ghosts.map(x=>`<div class="row dp-ghost" data-key="g:${x.id}"><span class="recic" aria-hidden="true">↻</span><div class="dp-rowb"><button class="t" data-act="task-edit" data-id="${x.id}">${tn(x.title)}</button><div class="dp-sub"><span>repetição prevista</span></div></div></div>`).join('')}${label('done','','Feitas',D.done.length)}${D.done.map(x=>dayTask(x,k)).join('')}</div>`:`<p class="dp-empty">Nenhuma tarefa ${D.isToday?'para hoje':'neste dia'}.</p>`;
 const habits=D.habits.length?(k>tk?`<div class="dp-list">${D.habits.map(x=>`<div class="row dp-planned" data-key="h:${x.id}"><i style="background:${hColor(x)}"></i><span>${tn(x.name)}</span></div>`).join('')}</div>`:`<div class="dp-list">${D.habits.map(x=>dayHabit(x,k)).join('')}</div>`):'';
 return `<section class="card agenda dp" aria-label="Plano do dia">
  ${dayStrip(k)}
  <div class="dp-head"><div class="dp-id" aria-live="polite"><h2>${dayName(k)}</h2>${D.isToday||opt.inAgenda?'':`<span class="dp-date">${tn(`${sd.getDate()} de ${MESF[sd.getMonth()].toLowerCase()}`)}</span>`}${daysBetween(tk,k)>1?`<span class="due due-${dueLvl(k)}">${tn(`em ${daysBetween(tk,k)} dias`)}</span>`:''}</div>
   <div class="actions">${D.isToday?'':'<button class="btn small" data-act="day-today">Voltar para hoje</button>'}${opt.inAgenda?'':`<button class="btn ghost small" data-act="day-agenda">Abrir na agenda</button>`}</div></div>
  <p class="dp-sum">${next?`<b><i style="background:${next.x.cc}"></i>${esc(next.text)}</b>`:''}<span>${summary}</span></p>
  <div class="dp-body">
   <div class="dp-col">${daySection('Compromissos',D.items.length,agenda+dayNotice(),`<button class="iconbtn" aria-label="Novo evento neste dia" title="Novo evento" data-act="event-new" data-date="${k}">${ic('plus')}</button>`)}</div>
   <div class="dp-col">${daySection('Tarefas',pending,quickAdd({date:k})+tasks)}${habits?daySection('Hábitos',k>tk?D.habits.length:hLeft,habits):''}</div>
  </div></section>`;
}
function daySelect(k){
 if(!k||k===UI.calSel)return;
 const dir=Math.sign(k.localeCompare(UI.calSel)),week=dk(monOf(pd(UI.calSel))),d=pd(k);
 UI.calSel=k;UI.calMonth=new Date(d.getFullYear(),d.getMonth(),1);dayOpen=null;
 quietRender();
 if(week!==dk(monOf(d)))slideIn('.dp-days',dir,18);
 slideIn('.dp-body',dir,14);slideIn('.dp-id',dir,6);
}
// marcador do dia: mesmo movimento da navegação, a partir da posição atual
let dayPill=null;
function placeDayInd(){
 const days=document.querySelector('.dp-days');if(!days)return;
 let ind=days.querySelector('.dp-ind');
 if(!ind){ind=document.createElement('i');ind.className='dp-ind';ind.setAttribute('aria-hidden','true');ind.setAttribute('data-persist','');days.prepend(ind)}
 const on=days.querySelector('[aria-pressed="true"]');if(!on)return;
 const x=on.offsetLeft,w=on.offsetWidth,moved=ind.dataset.x!==String(x)||ind.dataset.w!==String(w),placed=!!ind.dataset.x;
 if(!moved)return;
 const cs=getComputedStyle(ind),from={transform:cs.transform,width:cs.width};
 dayPill?.cancel();dayPill=null;
 ind.style.width=w+'px';ind.style.transform=`translateX(${x}px)`;ind.dataset.x=x;ind.dataset.w=w;
 if(placed&&motionOK())dayPill=ind.animate([from,{transform:`translateX(${x}px)`,width:w+'px'}],{duration:COMPASSO_MOTION.duration.selection,easing:COMPASSO_MOTION.easing.standard});
}
A['day-sel']=d=>daySelect(d.k);
A['day-today']=()=>daySelect(today());
A['day-week']=d=>daySelect(dk(addD(pd(UI.calSel),7*Number(d.d))));
A['day-agenda']=()=>{UI.calMode='day';switchView('calendario')};
A['day-open']=d=>{dayOpen=dayOpen===d.o?null:d.o;render()};
const dayCalNav=A['cal-nav'],dayCalToday=A['cal-today'];
A['cal-nav']=d=>{if(UI.calMode==='day')return daySelect(dk(addD(pd(UI.calSel),Number(d.d))));dayCalNav(d)};
A['cal-today']=()=>{if(UI.calMode==='day')return daySelect(today());dayCalToday()};
// conclusão: a linha mostra o risco e só então desce para "Feitas"
const dayToggleTask=toggleTask;
toggleTask=id=>{const x=S.tasks.find(t=>t.id===id);dayFlip={delay:x&&!x.done?COMPASSO_MOTION.duration.confirmationHold:0};return dayToggleTask(id)};
// durante a conclusão, os rótulos do grupo esperam o risco terminar, junto com a linha
let dayHold=0;
const dayEnter=enterEl,dayLeave=leaveEl;
enterEl=el=>{if(dayHold&&el.matches('.dp-list>.group-h'))return el.animate([{opacity:0},{opacity:1}],{duration:COMPASSO_MOTION.duration.state,delay:dayHold,fill:'backwards',easing:COMPASSO_MOTION.easing.standard});dayEnter(el)};
leaveEl=el=>{if(dayHold&&el.matches('.dp-list>.group-h'))el.classList.add('just-done');dayLeave(el)};
const dayRender=render;
render=()=>{
 const plan=dayFlip&&!calm()?dayFlip:null;dayFlip=null;let before=null;dayHold=plan?plan.delay:0;
 if(plan){before=new Map();document.querySelectorAll('.dp-list>[data-key]:not([data-leaving])').forEach(el=>before.set(el.getAttribute('data-key'),el.getBoundingClientRect().top))}
 dayRender();placeDayInd();dayHold=0;
 if(!before)return;
 document.querySelectorAll('.dp-list>[data-key]:not([data-leaving])').forEach(el=>{
  const top=before.get(el.getAttribute('data-key'));if(top==null)return;
  const dy=top-el.getBoundingClientRect().top;if(Math.abs(dy)<1)return;
  el.animate([{transform:`translateY(${dy}px)`},{transform:'none'}],{duration:COMPASSO_MOTION.duration.collapse,delay:plan.delay,easing:COMPASSO_MOTION.easing.standard,fill:'backwards'});
 });
};
// setas do teclado na faixa da semana; deslizar no celular troca de dia
document.addEventListener('keydown',e=>{
 if(!e.target.closest?.('.dp-days'))return;
 const step=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0;if(!step)return;
 e.preventDefault();daySelect(dk(addD(pd(UI.calSel),step)));
 document.querySelector('.dp-days [aria-pressed="true"]')?.focus({preventScroll:true});
});
let daySwipe=null;
document.addEventListener('pointerdown',e=>{daySwipe=e.pointerType!=='mouse'&&e.target.closest?.('.dp-body,.dp-head')?{x:e.clientX,y:e.clientY}:null});
document.addEventListener('pointerup',e=>{
 if(!daySwipe)return;const dx=e.clientX-daySwipe.x,dy=e.clientY-daySwipe.y;daySwipe=null;
 if(Math.abs(dx)>70&&Math.abs(dy)<40)daySelect(dk(addD(pd(UI.calSel),dx<0?1:-1)));
});
window.addEventListener('resize',()=>requestAnimationFrame(placeDayInd));
document.fonts?.ready.then(()=>requestAnimationFrame(placeDayInd));
// a cada minuto: atualiza "agora" e, ao virar o dia, acompanha quem estava em hoje
let dayLast=today();
setInterval(()=>{
 const t=today();if(t!==dayLast){if(UI.calSel===dayLast)UI.calSel=t;dayLast=t}
 if($('#modal').hidden&&document.querySelector('.dp'))schedule();
},60000);
