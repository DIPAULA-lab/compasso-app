/* Fluxos de tarefas: captura em uma linha, menu "quando" na pílula de prazo, reagendar em lote e arrastar.
   Tudo grava nos campos que já existem (title, cat, due, startDate, rec, prio). */
const QA_DAYS=[['domingo','dom'],['segunda','seg'],['terça','ter','terca'],['quarta','qua'],['quinta','qui'],['sexta','sex'],['sábado','sáb','sab','sabado']];
const QA_PREP=/^(?:na|no|para|pra|até|ate|em|dia)$/i;
const qaPlain=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const nextDow=dow=>{const d=new Date(),n=((dow-d.getDay()+7)%7)||7;return dk(addD(d,n))};
const whenWord=due=>{if(!due)return 'sem prazo';const d=daysBetween(today(),due);return d===0?'hoje':d===1?'amanhã':`${DOW[(pd(due).getDay()+6)%7]}, ${fmtD(due)}`};
function whenOptions(){
 const t=new Date(),td=dk(t),tm=dk(addD(t,1)),out=[['Hoje',td],['Amanhã',tm]];
 if(t.getDay()>0&&t.getDay()<6&&nextDow(6)!==tm)out.push(['Sábado',nextDow(6)]);
 if(nextDow(1)!==tm)out.push(['Próxima segunda',nextDow(1)]);
 return out;
}
// Lê só o fim do texto: "Pagar luz sexta !" vira título + data + prioridade; o meio da frase fica intacto.
function qaParse(raw){
 let title=String(raw||'').trim();const out={date:undefined,prio:undefined,cat:undefined};
 for(let go=true;go;){
  go=false;let m;
  if((m=title.match(/^(.+?)\s+!+$/))&&out.prio==null){out.prio=1;title=m[1];go=true;continue}
  if((m=title.match(/^(.+?)\s+#(\S+)$/))&&out.cat==null){const c=catList().find(x=>qaPlain(x.name).replace(/\s/g,'').startsWith(qaPlain(m[2])));if(c){out.cat=c.id;title=m[1];go=true;continue}}
  if(out.date!==undefined)continue;
  m=title.match(/^(.+?)(\s+(?:na|no|para|pra|até|ate|em|dia))?\s+(\S+)$/i);if(!m||QA_PREP.test(m[1]))continue;
  const w=qaPlain(m[3]);let date;
  if(w==='hoje')date=today();else if(w==='amanha')date=dk(addD(new Date(),1));
  // abreviação de dia só vale depois de preposição ("até sex"), para não capturar nomes ("Ligar para o Seg")
  else{const i=QA_DAYS.findIndex(names=>names.slice(0,m[2]?names.length:1).concat(names[0]==='terça'?'terca':names[0]==='sábado'?'sabado':[]).some(n=>qaPlain(n)===w));if(i>=0)date=nextDow(i);
   const dm=w.match(/^(\d{1,2})\/(\d{1,2})$/);
   if(dm){const y=new Date().getFullYear(),d=new Date(y,+dm[2]-1,+dm[1]);if(d.getMonth()===+dm[2]-1){if(dk(d)<today())d.setFullYear(y+1);date=dk(d)}}}
  if(date){out.date=date;title=m[1];go=true}
 }
 return {...out,title};
}
const qaState={date:undefined,cat:undefined,prio:undefined,literal:false};
function quickAdd(ctx={}){
 const cat=ctx.cat||(UI.taskCat&&!['all','__uncategorized'].includes(UI.taskCat)?UI.taskCat:'')||UI.lastCat||catList()[0].id,date=ctx.date||'';
 const when=whenOptions();
 return `<form class="qa" data-form="qa" data-cat="${esc(cat)}" data-date="${esc(date)}" autocomplete="off">
  <div class="qa-line"><span class="qa-plus" aria-hidden="true">${ic('plus')}</span><input id="qa-title" type="text" placeholder="Adicionar tarefa" aria-label="Adicionar tarefa" enterkeyhint="done" maxlength="300"><kbd class="qa-key" aria-hidden="true">N</kbd><button type="submit" class="btn primary small qa-go">Adicionar</button></div>
  <div class="qa-opts"><div class="qa-hint" hidden><span></span><button type="button" class="qa-lit" data-act="qa-literal">usar como texto</button></div>
   <div class="qa-row" role="group" aria-label="Prazo">${when.map(([l,v])=>`<button type="button" class="fchip qa-chip" data-act="qa-date" data-v="${v}" aria-pressed="false">${l}</button>`).join('')}<label class="fchip qa-chip qa-pick" aria-pressed="false">${ic('cal')}<span>Outra data</span><input type="date" id="qa-pick" aria-label="Escolher data"></label></div>
   <div class="qa-row"><select id="qa-cat" aria-label="Categoria">${catOptions(cat)}</select><button type="button" class="fchip qa-chip" data-act="qa-prio" aria-pressed="false"><span class="prio p1">▲</span>Alta</button></div></div></form>`;
}
function qaEffective(f){
 const input=f.querySelector('#qa-title'),p=qaState.literal?{title:input.value.trim()}:qaParse(input.value);
 const ov=(a,b)=>a!==undefined?a:b;
 return {p,title:p.title,date:ov(p.date,ov(qaState.date,f.dataset.date||'')),cat:ov(p.cat,ov(qaState.cat,f.dataset.cat)),prio:ov(p.prio,ov(qaState.prio,2))};
}
function qaSync(){
 const f=document.querySelector('.qa');if(!f)return;
 const e=qaEffective(f),has=!!f.querySelector('#qa-title').value.trim();
 f.classList.toggle('has-text',has);f.querySelector('.qa-go').disabled=!has;
 let known=false;
 f.querySelectorAll('[data-act="qa-date"]').forEach(b=>{const on=b.dataset.v===e.date;known||=on;b.setAttribute('aria-pressed',on)});
 const pick=f.querySelector('.qa-pick'),custom=!!e.date&&!known;
 pick.setAttribute('aria-pressed',custom);pick.querySelector('span').textContent=custom?whenWord(e.date):'Outra data';
 f.querySelector('#qa-cat').value=e.cat;f.querySelector('[data-act="qa-prio"]').setAttribute('aria-pressed',e.prio===1);
 const hint=f.querySelector('.qa-hint'),found=[e.p.date!==undefined?whenWord(e.p.date):'',e.p.cat?catOf(e.p.cat).name:'',e.p.prio?'Alta':''].filter(Boolean);
 hint.hidden=!found.length;if(found.length)hint.querySelector('span').textContent=`${e.title} · ${found.join(' · ')}`;
}
function qaReset(){Object.assign(qaState,{date:undefined,cat:undefined,prio:undefined,literal:false})}
function qaSave(f){
 const e=qaEffective(f);if(!e.title)return;
 const id=uid();UI.lastCat=e.cat;
 put('tasks',id,{title:e.title,cat:e.cat,due:e.date,prio:e.prio,done:false,doneAt:null,createdAt:new Date().toISOString(),notes:''});
 f.querySelector('#qa-title').value='';qaReset();qaSync();f.querySelector('#qa-title').focus();
 toast(`Adicionada em ${catOf(e.cat).name} · ${whenWord(e.date)}`,{label:'Desfazer',fn:()=>del('tasks',id)});
}
document.addEventListener('submit',e=>{if(e.target.dataset?.form!=='qa')return;e.preventDefault();e.stopImmediatePropagation();qaSave(e.target)},true);
document.addEventListener('input',e=>{
 if(e.target.id==='qa-title'){if(!e.target.value)qaState.literal=false;qaSync()}
 if(e.target.id==='qa-pick'&&e.target.value){qaState.date=e.target.value;qaSync();document.getElementById('qa-title')?.focus()}
 if(e.target.id==='qa-cat'){qaState.cat=e.target.value;qaSync()}
});
document.addEventListener('change',e=>{if(e.target.id==='qa-cat'){qaState.cat=e.target.value;qaSync();document.getElementById('qa-title')?.focus()}});
document.addEventListener('mousedown',e=>{if(e.target.closest?.('.qa button'))e.preventDefault()});
document.addEventListener('click',e=>{const p=e.target.closest?.('.qa-pick');if(p){try{p.querySelector('input').showPicker()}catch{}}});
document.addEventListener('focusout',e=>{
 const f=e.target.closest?.('.qa');if(!f||f.contains(e.relatedTarget)||f.querySelector('#qa-title').value)return;
 setTimeout(()=>{if(!f.contains(document.activeElement)){qaReset();qaSync()}},0);
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&e.target.id==='qa-title'){e.target.value='';qaReset();qaSync();e.target.blur();e.stopImmediatePropagation();return}
 // N: captura de qualquer tela, fora de campos de texto
 if((e.key!=='n'&&e.key!=='N')||e.metaKey||e.ctrlKey||e.altKey||!$('#modal').hidden||e.target.closest?.('input,textarea,select,[contenteditable]'))return;
 e.preventDefault();const input=document.getElementById('qa-title');
 if(input){input.focus();input.scrollIntoView({block:'center',behavior:motionOK()?'smooth':'auto'})}else A['task-new']({});
});
A['qa-date']=d=>{const f=document.querySelector('.qa');qaState.date=qaEffective(f).date===d.v?'':d.v;qaSync()};
A['qa-prio']=()=>{const f=document.querySelector('.qa');qaState.prio=qaEffective(f).prio===1?2:1;qaSync()};
A['qa-literal']=()=>{qaState.literal=true;qaSync()};
A['qa-cat']=d=>{
 qaState.cat=d.c;qaSync();const f=document.querySelector('.qa'),input=f?.querySelector('#qa-title');if(!input)return A['task-new'](d);
 input.focus({preventScroll:true});f.scrollIntoView({block:'center',behavior:motionOK()?'smooth':'auto'});
 if(motionOK())f.animate([{transform:'scale(1)'},{transform:'scale(1.012)',offset:.4},{transform:'scale(1)'}],{duration:COMPASSO_MOTION.duration.check,easing:COMPASSO_MOTION.easing.standard});
};
const dayRenderQa=render;
render=()=>{dayRenderQa();qaSync()};

/* ---- reagendar ---- */
const withDue=(x,due)=>{
 const o={...strip(x),due};
 if(x.startDate)o.startDate=due&&x.due?dk(addD(pd(due),-daysBetween(x.startDate,x.due))):'';
 if(hasRec(x.rec)&&due)o.rec={...x.rec,start:due};
 return o;
};
function moveTasks(ids,due){
 const list=ids.map(id=>S.tasks.find(x=>x.id===id)).filter(x=>x&&!x.done&&x.due!==due&&(due||!hasRec(x.rec)));if(!list.length)return;
 const old=list.map(x=>({id:x.id,doc:strip(x)}));
 list.forEach(x=>put('tasks',x.id,withDue(x,due)));
 toast(`${list.length===1?'Movida':`${list.length} tarefas movidas`} para ${whenWord(due)}`,{label:'Desfazer',fn:()=>old.forEach(o=>put('tasks',o.id,o.doc))});
}
let popEl=null,popFrom=null;
function closePop(){
 if(!popEl)return;const el=popEl,from=popFrom;popEl=popFrom=null;
 if(motionOK())el.animate([{opacity:1},{opacity:0}],{duration:COMPASSO_MOTION.duration.tap,easing:COMPASSO_MOTION.easing.exit}).finished.then(()=>el.remove(),()=>el.remove());else el.remove();
 if(from?.isConnected&&kbd)from.focus({preventScroll:true});
}
function openPop(anchor,html,label){
 closePop();
 const el=document.createElement('div');el.className='pop';el.setAttribute('role','menu');el.setAttribute('aria-label',label);el.innerHTML=html;document.body.append(el);
 const a=anchor.getBoundingClientRect(),b=el.getBoundingClientRect(),gap=6;
 const below=a.bottom+gap+b.height<innerHeight-8,top=below?a.bottom+gap:Math.max(8,a.top-gap-b.height),left=clamp(a.right-b.width,8,innerWidth-b.width-8);
 el.style.top=top+'px';el.style.left=left+'px';
 popEl=el;popFrom=anchor;
 if(motionOK())el.animate([{opacity:0,transform:`translateY(${below?-4:4}px) scale(.98)`},{opacity:1,transform:'none'}],{duration:COMPASSO_MOTION.duration.state,easing:COMPASSO_MOTION.easing.standard});
 (el.querySelector('[aria-checked="true"]')||el.querySelector('button')).focus({preventScroll:true});
}
function whenMenu(ids,opt={}){
 const one=ids.length===1?S.tasks.find(x=>x.id===ids[0]):null,cur=one?.due||'';
 const rows=whenOptions().map(([l,v])=>`<button role="menuitemradio" aria-checked="${v===cur}" data-act="when-set" data-v="${v}" data-ids="${ids.join(',')}"><i class="due-${dueLvl(v)}"></i><span>${l}</span><em>${fmtD(v)}</em></button>`).join('');
 const prio=one?`<div class="pop-seg" role="group" aria-label="Prioridade">${[[1,'▲ Alta'],[2,'Média'],[3,'▽ Baixa']].map(([p,l])=>`<button aria-pressed="${(+one.prio||2)===p}" data-act="prio-set" data-id="${one.id}" data-p="${p}">${l}</button>`).join('')}</div>`:'';
 const none=one?.due&&!hasRec(one.rec)?`<button role="menuitem" data-act="when-set" data-v="" data-ids="${ids.join(',')}"><i></i><span>Sem prazo</span></button>`:'';
 return `${opt.title?`<div class="pop-t">${esc(opt.title)}</div>`:''}${rows}<label class="pop-date"><i></i><span>Outra data</span><input type="date" data-ids="${ids.join(',')}" value="${esc(cur)}" aria-label="Escolher data"></label>${none}${prio}`;
}
A['task-when']=(d,el)=>{if(popFrom===el)return closePop();openPop(el,whenMenu([d.id]),'Prazo e prioridade')};
A['when-late']=(d,el)=>{
 const ids=S.tasks.filter(x=>!x.done&&x.due&&x.due<today()&&(!d.c||x.cat===d.c)).map(x=>x.id);
 if(popFrom===el)return closePop();openPop(el,whenMenu(ids,{title:`Reagendar ${ids.length} atrasadas`}),'Reagendar atrasadas');
};
A['when-set']=d=>{closePop();moveTasks(d.ids.split(','),d.v)};
A['prio-set']=d=>{
 const x=S.tasks.find(t=>t.id===d.id);if(!x)return;put('tasks',x.id,{...strip(x),prio:+d.p});
 popEl?.querySelectorAll('[data-act="prio-set"]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.p===d.p));
};
document.addEventListener('change',e=>{const i=e.target.closest?.('.pop-date input');if(i&&i.value){const ids=i.dataset.ids.split(',');closePop();moveTasks(ids,i.value)}});
document.addEventListener('click',e=>{const l=e.target.closest?.('.pop-date');if(l){try{l.querySelector('input').showPicker()}catch{}}});
document.addEventListener('pointerdown',e=>{if(popEl&&!popEl.contains(e.target)&&!e.target.closest?.('[data-act="task-when"],[data-act="when-late"]'))closePop()},true);
window.addEventListener('scroll',()=>closePop(),{passive:true});window.addEventListener('popstate',()=>closePop());window.addEventListener('resize',()=>closePop());
document.addEventListener('keydown',e=>{
 if(!popEl)return;
 if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();kbd=true;closePop();return}
 if(e.key==='Tab'){kbd=true;closePop();return}
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){
  const items=[...popEl.querySelectorAll('button,input')],i=items.indexOf(document.activeElement);
  e.preventDefault();items[(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();
 }
},true);
function dueBtn(x){
 if(x.done)return dueTag(x);
 return `<button class="due-btn ${x.due?'':'is-none'}" data-act="task-when" data-id="${x.id}" aria-haspopup="menu" aria-label="Prazo e prioridade de ${esc(x.title)}" title="Mudar prazo ou prioridade">${x.due?dueTag(x):`${ic('cal')}<span>Prazo</span>`}</button>`;
}
const lateBtn=(n,c='')=>n>1?`<button class="late-all" data-act="when-late" ${c?`data-c="${esc(c)}"`:''}>Reagendar</button>`:'';
// atalhos de data no formulário completo
const formWhen=()=>`<div class="form-when" role="group" aria-label="Atalhos de prazo">${whenOptions().map(([l,v])=>`<button type="button" class="fchip qa-chip" data-act="form-date" data-v="${v}">${l}</button>`).join('')}</div>`;
A['form-date']=d=>{const i=document.getElementById('f-due');if(!i)return;i.value=d.v;i.dispatchEvent(new Event('change',{bubbles:true}));i.dispatchEvent(new Event('input',{bubbles:true}));formWhenSync()};
function formWhenSync(){const v=document.getElementById('f-due')?.value;document.querySelectorAll('[data-act="form-date"]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===v))}
document.addEventListener('input',e=>{if(e.target.id==='f-due')formWhenSync()});
const taskModalBase=taskModal;
taskModal=(...a)=>{taskModalBase(...a);formWhenSync()};

/* ---- arrastar (computador): para um dia muda o prazo, para uma coluna muda a categoria ---- */
const canDrag=matchMedia('(pointer:fine)').matches;
const dragAttr=x=>canDrag&&!x.done?'draggable="true"':'';
let dragId=null;
const dropOf=t=>t.closest?.('.dp-day,.cday,.task-list-card[data-cat]');
const clearDrop=()=>document.querySelectorAll('.drop-on').forEach(el=>el.classList.remove('drop-on'));
document.addEventListener('dragstart',e=>{
 const row=e.target.closest?.('[draggable="true"][data-key^="t:"]');if(!row)return;
 dragId=row.getAttribute('data-key').slice(2);row.classList.add('dragging');document.body.classList.add('is-dragging');
 if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',S.tasks.find(x=>x.id===dragId)?.title||'')}
});
document.addEventListener('dragover',e=>{if(!dragId)return;const t=dropOf(e.target);clearDrop();if(t){e.preventDefault();t.classList.add('drop-on')}});
document.addEventListener('drop',e=>{
 if(!dragId)return;const t=dropOf(e.target);if(!t)return;e.preventDefault();
 const x=S.tasks.find(y=>y.id===dragId);
 if(x&&t.dataset.k)moveTasks([x.id],t.dataset.k);
 else if(x&&t.dataset.cat&&t.dataset.cat!==x.cat){const old=strip(x);UI.lastCat=t.dataset.cat;put('tasks',x.id,{...old,cat:t.dataset.cat});toast(`Movida para ${catOf(t.dataset.cat).name}`,{label:'Desfazer',fn:()=>put('tasks',x.id,old)})}
});
document.addEventListener('dragend',()=>{dragId=null;clearDrop();document.body.classList.remove('is-dragging');document.querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging'))});
A['task-group']=d=>{UI.taskGroup=d.g;try{localStorage.setItem('compasso:taskgroup',d.g)}catch{};quietRender()};
try{UI.taskGroup=localStorage.getItem('compasso:taskgroup')||'cat'}catch{UI.taskGroup='cat'}
