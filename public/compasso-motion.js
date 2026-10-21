/* Approved Compasso motion primitives. Reuse these instead of per-view effects. */
const COMPASSO_MOTION=Object.freeze({
 duration:Object.freeze({tap:120,state:240,strike:420,selection:300,check:360,collapse:280,confirmationHold:520}),
 easing:Object.freeze({standard:'cubic-bezier(.2,.8,.2,1)',exit:'cubic-bezier(.4,0,1,1)',check:'cubic-bezier(.34,1.56,.64,1)'})
});

// Browser text fragments, not the width of a button/flex item, define each line.
function compassoStrikeSegments(rects,host){
 const lines=[];
 [...rects].filter(r=>r.width>0&&r.height>0).sort((a,b)=>a.top-b.top||a.left-b.left).forEach(rect=>{
  const left=Math.max(host.left,rect.left),right=Math.min(host.left+host.width,rect.left+rect.width);
  if(right<=left)return;
  const center=rect.top+rect.height/2;
  let line=lines.find(x=>Math.abs(x.center-center)<=Math.min(x.height,rect.height)*.45);
  if(!line){line={left,right,top:rect.top,bottom:rect.top+rect.height,center,height:rect.height};lines.push(line);}
  else{line.left=Math.min(line.left,left);line.right=Math.max(line.right,right);line.top=Math.min(line.top,rect.top);line.bottom=Math.max(line.bottom,rect.top+rect.height);line.height=line.bottom-line.top;line.center=(line.top+line.bottom)/2;}
 });
 return lines.sort((a,b)=>a.top-b.top).map(line=>({x:line.left-host.left,y:line.top-host.top+line.height*.56,width:line.right-line.left}));
}

const compassoActiveStrikes=new Set();
function compassoAnimateStrike(title){
 if(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches)return null;
 const rects=[],walker=document.createTreeWalker(title,NodeFilter.SHOW_TEXT);
 for(let node=walker.nextNode();node;node=walker.nextNode()){
  if(node.parentElement.closest('[data-completion-strike]'))continue;
  const start=node.data.search(/\S/),end=node.data.length-(node.data.match(/\s*$/)?.[0].length||0);
  if(start<0||start>=end)continue;
  const range=document.createRange();range.setStart(node,start);range.setEnd(node,end);rects.push(...range.getClientRects());
 }
 const box=title.getBoundingClientRect(),segments=compassoStrikeSegments(rects,{left:box.left+title.clientLeft,top:box.top+title.clientTop,width:title.clientWidth,height:title.clientHeight});
 if(!segments.length)return null;
 const overlay=document.createElement('span');overlay.className='completion-strike-overlay';overlay.setAttribute('data-completion-strike','');overlay.setAttribute('data-persist','');overlay.setAttribute('aria-hidden','true');
 title.classList.add('completion-strike-active');title.append(overlay);
 const animations=[],total=segments.reduce((sum,line)=>sum+line.width,0);let elapsed=0;
 const record={active:true,title,cancel(){if(!record.active)return;animations.forEach(animation=>animation.cancel());finish();}};
 function finish(){if(!record.active)return;record.active=false;overlay.remove();title.classList.remove('completion-strike-active');compassoActiveStrikes.delete(record);}
 compassoActiveStrikes.add(record);
 segments.forEach(segment=>{
  const line=document.createElement('span');line.className='completion-strike-line';line.style.left=segment.x+'px';line.style.top=(segment.y-.75)+'px';line.style.width=segment.width+'px';overlay.append(line);
  const duration=COMPASSO_MOTION.duration.strike*segment.width/total;
  animations.push(line.animate([{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{duration,delay:elapsed,easing:COMPASSO_MOTION.easing.standard,fill:'both'}));elapsed+=duration;
 });
 Promise.all(animations.map(animation=>animation.finished)).then(finish,finish);
 return record;
}
if(typeof window!=='undefined')window.addEventListener('resize',()=>[...compassoActiveStrikes].forEach(record=>record.cancel()));
