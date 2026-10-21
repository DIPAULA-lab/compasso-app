import {readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const original=read('../public/index.html');
for(const file of readdirSync(new URL('../public/',import.meta.url)).filter(x=>x.endsWith('.js'))){
 const source=read('../public/'+file);new vm.Script(source,{filename:file});
 assert(!/Dados fictícios|Salvo apenas na prévia|preview-view|preview-status/.test(source),file+': no demo substitutions');
}
for(const [i,match] of [...original.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].entries())new vm.Script(match[1],{filename:'index-inline-'+i});
assert(original.includes('src="config.js"')&&original.includes('src="compasso-shim.js"'),'retain real data adapter');
assert(original.indexOf('src="compasso-interactions.js"')<original.indexOf('/* ============ boot ============ */'),'install behaviors before boot');
// Test the actual original deadline classifier at every boundary, including overdue dates.
const classifier=original.match(/const dueLvl=k=>\{[^\n]+\};/)[0];
const context=vm.createContext({today:()=> '2026-10-21',daysBetween:(a,b)=>(Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000});
vm.runInContext(classifier+'\nthis.classifyDeadline=dueLvl;',context);
for(const [date,color] of [['2026-10-20','red'],['2026-10-21','red'],['2026-10-26','red'],['2026-10-27','yellow'],['2026-10-28','yellow'],['2026-10-29','green'],['2026-12-01','green']]){
 assert.equal(context.classifyDeadline(date),color,`deadline ${date}`);
}
const behavioralCss=read('../public/compasso-motion.css');
assert(!/#[0-9a-f]{3,8}\b/i.test(behavioralCss),'no new literal colors');
assert(!/(?:font-family|font-size|border-radius|box-shadow)\s*:/.test(behavioralCss),'no component redesign');
assert(!/--(?:due-red|due-yellow|due-green|ink|bg|surface)\s*:/.test(behavioralCss),'preserve original palette');
const motionContext=vm.createContext({});vm.runInContext(read('../public/compasso-motion.js'),motionContext);
const segments=(rects,host={left:0,top:0,width:300,height:100})=>JSON.parse(JSON.stringify(motionContext.compassoStrikeSegments(rects,host)));
const short=segments([{left:0,top:0,width:82,height:18}]);
assert.equal(short[0].width,82,'short phrase must not expand to the 300px container');
const wrapped=segments([{left:0,top:0,width:170,height:18},{left:0,top:24,width:68,height:18}]);
assert.deepEqual(wrapped.map(line=>line.width),[170,68],'each wrapped line keeps its own text length');
const inline=segments([{left:0,top:0,width:35,height:18},{left:35,top:-1,width:24,height:20},{left:59,top:0,width:62,height:18}]);
assert.equal(inline.length,1,'nested number spans must not create duplicate strokes');assert.equal(inline[0].width,121);
assert.deepEqual(segments([{left:80,top:50,width:300,height:18}],{left:100,top:50,width:160,height:50}).map(line=>({x:line.x,width:line.width})),[{x:0,width:160}],'clip long text to the visible title');
assert.equal(segments([{left:0,top:0,width:0,height:18}]).length,0,'ignore empty fragments');
console.log('OK: production scripts, real adapter, deadline boundaries, measured strike fragments, original appearance tokens.');
