/* Behavior and content organization only. No design tokens or style overrides. */
let compassoMapWeeks=8;
const compassoTemplate=html=>{const t=document.createElement('template');t.innerHTML=html;return t;};
const compassoHomeOriginal=vHoje;
vHoje=()=>{
 const t=compassoTemplate(compassoHomeOriginal()),root=t.content;
 // Reorder complete original components; keep their exact visual definitions.
 const tasks=root.querySelector('.home-mid'),goals=root.querySelector('.goals-panel');
 goals.before(tasks);
 return t.innerHTML;
};
// The current task view already groups nonempty categories. Reuse its creation shortcuts.
const compassoTasksOriginal=vTarefas;
vTarefas=()=>{
 const t=compassoTemplate(compassoTasksOriginal()),root=t.content,empty=root.querySelector('.task-empty-cats');
 if(empty){const details=document.createElement('details');details.className='tbl';details.dataset.key='empty-categories';const summary=document.createElement('summary');summary.textContent=empty.querySelector('span')?.textContent||'Categorias sem tarefas';details.append(summary);const actions=document.createElement('div');actions.className='actions';empty.querySelectorAll('button').forEach(button=>{button.className='btn';actions.append(button);});details.append(actions);empty.replaceWith(details);}
 return t.innerHTML;
};
const compassoHabitsOriginal=vHabitos;
vHabitos=()=>{
 const t=compassoTemplate(compassoHabitsOriginal()),root=t.content;
 const header=root.querySelector('.vh'),metas=[...root.querySelectorAll('h2')].find(x=>x.textContent==='Metas')?.parentElement,habitos=[...root.querySelectorAll('section.card')].find(x=>x.querySelector('h2')?.textContent==='Hábitos');
 if(metas)metas.id='compasso-goals';if(habitos)habitos.id='compasso-habits';
 const links=document.createElement('div');links.className='filters';
 links.innerHTML='<button class="btn" data-act="compasso-section" data-section="compasso-habits">Ver hábitos</button><button class="btn" data-act="compasso-section" data-section="compasso-goals">Ver metas</button>';
 header.after(links);return t.innerHTML;
};
A['compasso-section']=d=>{
 const section=document.getElementById(d.section);if(!section)return;
 // Leave the original component geometry untouched while accounting for the sticky navigation.
 const top=section.getBoundingClientRect().top+scrollY-document.querySelector('.side').getBoundingClientRect().height-16;
 scrollTo({top,behavior:motionOK()?'smooth':'auto'});
 const heading=section.querySelector('h2');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
};
const compassoPlansOriginal=plansCard;
plansCard=()=>{
 if(S.plans.length)return compassoPlansOriginal();
 const t=compassoTemplate(compassoPlansOriginal());t.content.querySelector('.empty')?.remove();
 // Keep the original card, header, helper text and button, removing the redundant empty panel.
 return t.innerHTML;
};
const compassoStatsOriginal=vStats;
vStats=()=>{
 const t=compassoTemplate(compassoStatsOriginal()),root=t.content,kpis=root.querySelector('.kpis');
 const labels=kpis.querySelectorAll('.l');labels[0].textContent='consistência média dos hábitos · últimos 30 dias';labels[2].textContent='tarefas concluídas · últimos 7 dias';labels[3].textContent='treinos · últimos 30 dias';
 const summary=document.createElement('section');summary.className='card';
 summary.innerHTML=`<div class="card-h"><h2>Seu ritmo recente</h2></div><p class="muted">${S.tasks.filter(x=>x.done&&x.doneAt?.slice(0,10)>=dk(addD(new Date(),-6))).length} tarefas concluídas nos últimos 7 dias · ${wThisWeek().length}/${weekTarget()} treinos nesta semana.</p>`;
 kpis.after(summary);
 const card=root.querySelector('[data-heat-weeks]')?.closest('section');
 if(card){const controls=document.createElement('div');controls.className='card-h';controls.innerHTML=`<div class="seg" role="group" aria-label="Período dos mapas de hábitos"><button data-act="compasso-period" data-weeks="8" aria-pressed="${compassoMapWeeks===8}">8 semanas</button><button data-act="compasso-period" data-weeks="53" aria-pressed="${compassoMapWeeks===53}">1 ano</button></div>`;card.querySelector('.card-h').after(controls);}
 return t.innerHTML;
};
A['compasso-period']=d=>{compassoMapWeeks=+d.weeks;quietRender();};
// Existing incremental updates, motion, history and undo are retained from the current source.
const compassoOpenOriginal=openModal;
let compassoFocusOrigin=null,compassoSavedOverflow=null;
openModal=html=>{
 if($('#modal').hidden){compassoFocusOrigin=document.activeElement;compassoSavedOverflow=document.body.style.overflow;}
 compassoOpenOriginal(html);document.querySelector('.app').inert=true;document.body.style.overflow='hidden';
 const title=$('#sheet h2');if(title){title.id='compasso-dialog-title';$('#sheet').setAttribute('aria-labelledby',title.id);}
};
const compassoModalObserver=new MutationObserver(()=>{
 if(!$('#modal').hidden)return;
 document.querySelector('.app').inert=false;document.body.style.overflow=compassoSavedOverflow??'';
 if(compassoFocusOrigin?.isConnected)compassoFocusOrigin.focus({preventScroll:true});compassoFocusOrigin=null;
});
compassoModalObserver.observe($('#modal'),{attributes:true,attributeFilter:['hidden']});
document.addEventListener('keydown',e=>{
 if(e.key!=='Tab'||$('#modal').hidden)return;
 const controls=[...$('#sheet').querySelectorAll('button,input,textarea,select,a[href]')].filter(x=>!x.disabled&&x.getClientRects().length),first=controls[0],last=controls.at(-1);
 if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
});
