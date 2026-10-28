/* Inclusive multi-day bands, using the existing calendar's grid and category palette. */
function compassoRangeSegments(records,keys){
 const segments=[];
 for(let offset=0;offset<keys.length;offset+=7){
  const week=keys.slice(offset,offset+7),lanes=[];
  records.filter(x=>x.start<=week.at(-1)&&x.end>=week[0]).sort((a,b)=>a.start.localeCompare(b.start)||b.end.localeCompare(a.end)||a.id.localeCompare(b.id)).forEach(x=>{
   const start=week.findIndex(k=>k>=x.start),last=week.findLastIndex(k=>k<=x.end);
   let lane=lanes.findIndex(end=>end<start);if(lane<0)lane=lanes.length;lanes[lane]=last;
   segments.push({...x,row:offset/7+1,col:start+1,span:last-start+1,lane,continuesBefore:x.start<week[0],continuesAfter:x.end>week.at(-1)});
  });
 }
 return segments;
}
const compassoRangeCalendar=vCal;
vCal=()=>{
 const template=compassoTemplate(compassoRangeCalendar()),root=template.content,grid=root.querySelector('.cal-grid');
 if(!grid)return template.innerHTML;
 const days=[...grid.querySelectorAll('.cday')],keys=days.map(day=>day.dataset.k);
 const records=[
  ...S.events.filter(x=>x.endDate>x.date).map(x=>({id:x.id,start:x.date,end:x.endDate,title:x.title,color:cv(catOf(x.cat).c),act:'event-edit',kind:'event'})),
  ...S.tasks.filter(x=>x.startDate&&x.due>x.startDate).map(x=>({id:x.id,start:x.startDate,end:x.due,title:x.title,color:cv(catOf(x.cat).c),act:'task-edit',kind:'task',done:x.done})),
  ...S.workouts.filter(x=>x.endDate>x.date).map(x=>({id:x.id,start:x.date,end:x.endDate,title:x.title||WT[x.type].n,color:cv(WT[x.type].c),act:'w-edit',kind:'workout'}))
 ];
 const segments=compassoRangeSegments(records,keys);
 grid.classList.add('has-date-ranges');
 days.forEach((day,i)=>{
  const row=Math.floor(i/7)+1;day.style.gridRow=row;day.style.gridColumn=i%7+1;
  day.querySelectorAll('[data-range-item]').forEach(item=>item.remove());
  const laneCount=Math.max(0,...segments.filter(s=>s.row===row).map(s=>s.lane+1));
  if(laneCount){const spacer=document.createElement('span');spacer.className='range-space';spacer.style.height=`${laneCount*23}px`;spacer.setAttribute('aria-hidden','true');day.querySelector('.dn').after(spacer);}
  const more=day.querySelector('.more'),items=[...day.querySelectorAll('.ci')];
  items.forEach((item,n)=>{item.hidden=n>=3});
  if(more){if(items.length>3)more.textContent=`+${items.length-3}`;else more.remove();}
 });
 segments.forEach(x=>{
  const band=document.createElement('button');band.type='button';
  band.className=`ci range-band ${x.kind==='task'?'task':''} ${x.done?'ok':''} ${x.continuesBefore?'range-before':''} ${x.continuesAfter?'range-after':''}`;
  band.dataset.act=x.act;band.dataset.id=x.id;band.dataset.rangeBand=x.id;
  band.style.gridRow=x.row;band.style.gridColumn=`${x.col} / span ${x.span}`;band.style.marginTop=`${39+x.lane*23}px`;band.style.setProperty('--cc',x.color);
  const label=`${x.title} · ${rangeLabel(x.start,x.end)}${x.continuesBefore?' · continuação':''}${x.continuesAfter?' · continua na próxima semana':''}`;
  band.title=label;band.setAttribute('aria-label',label);band.textContent=x.title;
  grid.append(band);
 });
 return template.innerHTML;
};
