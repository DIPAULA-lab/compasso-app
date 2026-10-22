/* Approved interaction behavior. Original appearance and data handlers are retained. */
const compassoMotion={pill:null,pillFrame:0,main:null,leaving:new WeakMap(),feedback:new WeakMap()};
pop=el=>motionOK()?el.animate([{transform:'scale(1)'},{transform:'scale(1.3)',offset:.35},{transform:'scale(1)'}],{duration:COMPASSO_MOTION.duration.check,easing:COMPASSO_MOTION.easing.check}):null;

function compassoPaintLabels(nav,pill){
 const bounds=nav.getBoundingClientRect(),box=pill.getBoundingClientRect();
 nav.style.setProperty('--compasso-pill-left',(box.left-bounds.left)+'px');
 nav.style.setProperty('--compasso-pill-right',(box.right-bounds.left)+'px');
 nav.querySelectorAll('button>span').forEach(label=>label.style.setProperty('--compasso-label-left',(label.getBoundingClientRect().left-bounds.left)+'px'));
}
placeNavInd=()=>{
 const nav=$('#nav');let pill=nav.querySelector('.nav-ind');
 if(!pill){pill=document.createElement('i');pill.className='nav-ind';pill.setAttribute('aria-hidden','true');pill.setAttribute('data-persist','');nav.prepend(pill);}
 const active=nav.querySelector('[aria-current="page"]');
 if(!active||getComputedStyle(pill).display==='none'){
  cancelAnimationFrame(compassoMotion.pillFrame);compassoMotion.pill?.cancel();compassoMotion.pill=null;
  nav.classList.remove('has-ind','compasso-nav-motion');return;
 }
 const x=active.offsetLeft,width=active.offsetWidth,wasPositioned=nav.classList.contains('has-ind');
 const current=getComputedStyle(pill),from={transform:current.transform,width:current.width};
 const moved=pill.dataset.x!==String(x)||pill.dataset.w!==String(width);
 nav.classList.add('has-ind','compasso-nav-motion');
 if(moved){
  cancelAnimationFrame(compassoMotion.pillFrame);compassoMotion.pill?.cancel();
  pill.style.width=width+'px';pill.style.transform=`translateX(${x}px)`;pill.dataset.x=x;pill.dataset.w=width;
  if(wasPositioned&&motionOK()){
   const animation=pill.animate([from,{transform:`translateX(${x}px)`,width:width+'px'}],{duration:COMPASSO_MOTION.duration.selection,easing:COMPASSO_MOTION.easing.standard});
   compassoMotion.pill=animation;
   const paint=()=>{compassoPaintLabels(nav,pill);if(animation.playState==='running')compassoMotion.pillFrame=requestAnimationFrame(paint);};
   paint();animation.finished.then(()=>{if(compassoMotion.pill===animation){compassoMotion.pill=null;compassoPaintLabels(nav,pill);}},()=>{});
  }else compassoMotion.pill=null;
 }
 compassoPaintLabels(nav,pill);
};

// Animate the page content only. The header is never captured as an overlay.
switchView=(v,opt={})=>{
 if(!VIEWS.some(x=>x[0]===v))return;
 if(v===UI.view){quietRender();scrollTo({top:0,behavior:motionOK()?'smooth':'auto'});return;}
 scrollMem[UI.view]=scrollY;
 if(!opt.back)history.pushState({v},'','#'+v);
 compassoMotion.main?.cancel();
 // A previously cancelled legacy transition must not retain named snapshots.
 viewTr?.skipTransition?.();viewTr=null;
 const main=$('#main'),pill=$('#nav .nav-ind');main.style.viewTransitionName='';if(pill)pill.style.viewTransitionName='';
 UI.view=v;quietRender();scrollTo(0,opt.back?(scrollMem[v]||0):0);
 if(motionOK())compassoMotion.main=main.animate([{opacity:.35,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:COMPASSO_MOTION.duration.state,easing:COMPASSO_MOTION.easing.standard});
};

// An exiting category/group must keep the same confirmation pause as its task.
leaveEl=el=>{
 const previous=compassoMotion.leaving.get(el);if(previous)return;
 el.setAttribute('data-leaving','');el.style.pointerEvents='none';
 const frames=boxFrames(el);el.style.overflow='hidden';
 const wait=el.matches('.just-done')||el.querySelector('.just-done')?COMPASSO_MOTION.duration.confirmationHold:0;
 const record={active:true,animation:null};compassoMotion.leaving.set(el,record);
 record.animation=el.animate([{height:frames.h,paddingTop:frames.pt,paddingBottom:frames.pb,marginTop:frames.mt,marginBottom:frames.mb,opacity:1},shut],{duration:COMPASSO_MOTION.duration.collapse,delay:wait,easing:COMPASSO_MOTION.easing.standard,fill:'forwards'});
 record.animation.finished.then(()=>{if(record.active){el.remove();compassoMotion.leaving.delete(el);}},()=>{});
};
const compassoMorphKidsOriginal=morphKids;
morphKids=(a,b,anim)=>{
 // Undo during the exit animation reuses the original row rather than duplicating it.
 const wanted=new Set([...b.childNodes].map(mkey).filter(Boolean));
 [...a.children].filter(el=>el.hasAttribute('data-leaving')&&wanted.has(mkey(el))).forEach(el=>{
  const record=compassoMotion.leaving.get(el);if(!record)return;record.active=false;record.animation.cancel();compassoMotion.leaving.delete(el);
  el.removeAttribute('data-leaving');el.style.pointerEvents='';el.style.overflow='';el.classList.remove('just-done');
 });
 compassoMorphKidsOriginal(a,b,anim);
};

function compassoCompletionFeedback(el,kind){
 if(!el||!motionOK())return;
 const row=el.closest('.row,.gp,.hl,.hab'),title=row?.querySelector(kind==='habit'?'.hl-t,.name button,.main':'.t');
 // Setting the native checked state before rendering prevents a second pop in morphNode.
 el.setAttribute('aria-checked','true');pop(el);
 if(kind==='task')row?.classList.add('just-done');
 if(title){
  compassoMotion.feedback.get(title)?.cancel();
  const animation=compassoAnimateStrike(title);
  if(animation)compassoMotion.feedback.set(title,animation);
 }
}
const compassoMorphNodeOriginal=morphNode;
morphNode=(a,b,anim)=>{
 const strike=a.nodeType===1?compassoMotion.feedback.get(a):null;
 if(strike?.active&&a.textContent!==b.textContent)strike.cancel();
 if(a.nodeType===1&&a.getAttribute('aria-checked')==='true'&&b.getAttribute('aria-checked')==='false'){
  const row=a.closest('.row,.gp,.hl,.hab'),title=row?.querySelector('.t,.hl-t,.name button,.main');
  if(title)compassoMotion.feedback.get(title)?.cancel();
 }
 compassoMorphNodeOriginal(a,b,anim);
 if(strike?.active)a.classList.add('completion-strike-active');
};
A['task-toggle']=(d,el)=>{
 const task=S.tasks.find(x=>x.id===d.id);if(!task)return;
 if(!task.done)compassoCompletionFeedback(el,'task');
 toggleTask(d.id);
 const auto=$('#sheet .gm-auto'),form=$('#sheet form[data-form="goal"]');
 if(auto&&form?.dataset.id){const goal=goalOf(form.dataset.id);if(goal)morph(auto,goalPartsHtml(goal),!calm());}
};
A['habit-toggle']=(d,el)=>{
 // A workout-derived completion keeps its existing explanation and cannot be unchecked.
 if(autoW(d.id,d.k).length){toggleHabit(d.id,d.k);return;}
 if(!doneOn(d.id,d.k))compassoCompletionFeedback(el,'habit');
 toggleHabit(d.id,d.k);
};

// Keep the original dueLvl()/dueTag() thresholds and the original badge palette.
// Event dates use the same existing badge component; category colors stay separate.
const compassoAgendaDayOriginal=agendaDay;
agendaDay=(key,label)=>{
 const t=compassoTemplate(compassoAgendaDayOriginal(key,label));
 t.content.querySelectorAll('.it').forEach(row=>{
  if(!row.querySelector('[data-act="event-edit"],a[href]'))return;
  const source=row.querySelector('.src');if(!source)return;
  const badge=compassoTemplate(dueTag({due:key}).replace('atrasada','atrasado')).content.firstElementChild;
  if(badge){badge.classList.add('sm');badge.dataset.deadline=key;badge.setAttribute('aria-label','Prazo do evento: '+fmtD(key));source.append(' · ',badge);}
 });return t.innerHTML;
};
function compassoEventTimeBadges(html){
 const t=compassoTemplate(html);
 t.content.querySelectorAll('.cday[data-k],.sd').forEach(day=>{
  const key=day.dataset.k||day.querySelector('.sd-h')?.dataset.k;if(!key)return;
  day.querySelectorAll('.ci:not(.task):not(.plan)>.mono,.si[data-act="event-edit"]>.mono,.si[href]>.mono').forEach(time=>{
   time.className='due sm due-'+dueLvl(key);time.dataset.deadline=key;
  });
 });return t.innerHTML;
}
const compassoCalendarOriginal=vCal,compassoStripOriginal=weekStrip;
vCal=()=>compassoEventTimeBadges(compassoCalendarOriginal());
weekStrip=()=>compassoEventTimeBadges(compassoStripOriginal());

// Completion belongs to the displayed day. Keep the same strike-through after
// the feedback animation, on initial render and when returning to either view.
function compassoHabitCompletedTitles(html){
 const t=compassoTemplate(html);
 t.content.querySelectorAll('.hl>.hl-ck[data-act="habit-toggle"],.agenda .row>.check[data-act="habit-toggle"]').forEach(control=>{
  control.parentElement.classList.toggle('habit-done',control.getAttribute('aria-checked')==='true');
 });
 return t.innerHTML;
}
const compassoHabitHomeOriginal=vHoje,compassoHabitCalendarOriginal=vCal;
vHoje=()=>compassoHabitCompletedTitles(compassoHabitHomeOriginal());
vCal=()=>compassoHabitCompletedTitles(compassoHabitCalendarOriginal());
document.fonts?.ready.then(()=>requestAnimationFrame(placeNavInd));

/* Approved calendar views: reuse existing cells, agenda and interactions. */
UI.calMode='month';
function compassoCalendarRange(mode,key){
 const selected=pd(key),start=mode==='week'?monOf(selected):selected;
 return {start,end:addD(start,mode==='week'?6:0)};
}
const compassoCalendarMonth=vCal;
vCal=()=>{
 const mode=UI.calMode||'month';
 const template=compassoTemplate(compassoCalendarMonth()),root=template.content;
 const header=root.querySelector('.vh'),controls=document.createElement('div');
 controls.className='filters';
 controls.innerHTML=`<div class="seg" role="group" aria-label="Visualização da agenda">${[['day','Dia'],['week','Semana'],['month','Mês']].map(([value,label])=>`<button data-act="cal-mode" data-mode="${value}" aria-pressed="${mode===value}">${label}</button>`).join('')}</div>`;
 header.after(controls);
 if(mode==='month'){
  // Fill the existing grid row without changing the calendar or panel contents.
  root.querySelector('.cal-wrap .agenda').style.alignSelf='stretch';
 }
 if(mode!=='month'){
  const {start,end}=compassoCalendarRange(mode,UI.calSel);
  const year=start.getFullYear()===end.getFullYear()?String(end.getFullYear()):`${start.getFullYear()} / ${end.getFullYear()}`;
  header.querySelector('h1').textContent=mode==='week'?`${fmtD(dk(start))} – ${fmtD(dk(end))} · ${year}`:`${fmtD(UI.calSel)} · ${year}`;
  const previous=header.querySelector('[data-act="cal-nav"][data-d="-1"]'),next=header.querySelector('[data-act="cal-nav"][data-d="1"]');
  previous.setAttribute('aria-label',mode==='week'?'Semana anterior':'Dia anterior');
  next.setAttribute('aria-label',mode==='week'?'Próxima semana':'Próximo dia');
  const wrap=root.querySelector('.cal-wrap');
  if(mode==='day')wrap.replaceWith(wrap.querySelector('.agenda'));
  else{
   // In week view the existing day panel follows the calendar at full width.
   wrap.style.gridTemplateColumns='minmax(0,1fr)';
   const first=dk(start),last=dk(end);
   wrap.querySelectorAll('.cday').forEach(day=>{
    if(day.dataset.k<first||day.dataset.k>last)day.remove();else day.classList.remove('out');
   });
  }
 }
 return template.innerHTML;
};
A['cal-mode']=data=>{
 if(!['month','week','day'].includes(data.mode)||UI.calMode===data.mode)return;
 UI.calMode=data.mode;
 const selected=pd(UI.calSel);UI.calMonth=new Date(selected.getFullYear(),selected.getMonth(),1);
 quietRender();slideIn(data.mode==='day'?'.agenda':'.cal',1,8);
};
const compassoCalendarNav=A['cal-nav'];
A['cal-nav']=data=>{
 if(UI.calMode==='month')return compassoCalendarNav(data);
 const selected=addD(pd(UI.calSel),(UI.calMode==='week'?7:1)*Number(data.d));
 UI.calSel=dk(selected);UI.calMonth=new Date(selected.getFullYear(),selected.getMonth(),1);
 quietRender();slideIn(UI.calMode==='day'?'.agenda':'.cal-grid',Number(data.d),8);
};
const compassoCalendarSelect=A['cal-sel'];
A['cal-sel']=data=>{
 if(UI.calMode==='week'){
  const selected=pd(data.k);UI.calMonth=new Date(selected.getFullYear(),selected.getMonth(),1);
 }
 compassoCalendarSelect(data);
};
