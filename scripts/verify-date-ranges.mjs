import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const bands=readFileSync(new URL('../public/date-range-bands.js',import.meta.url),'utf8');
const on=vm.runInNewContext(html.slice(html.indexOf('const calendarOn='),html.indexOf('const rangeLabel='))+';calendarOn');
for(const [record,task] of [[{startDate:'2026-11-25',due:'2026-11-26'},true],[{date:'2026-11-25',endDate:'2026-11-26'},false]]){
 assert.deepEqual(['2026-11-24','2026-11-25','2026-11-26','2026-11-27'].map(k=>on(record,k,task)),[false,true,true,false]);
}
assert(on({due:'2026-11-25'},'2026-11-25',true));assert(!on({due:''},'2026-11-25',true));
assert(on({date:'2026-12-31',endDate:'2027-01-02'},'2027-01-01'));
const split=vm.runInNewContext(bands.slice(0,bands.indexOf('const compassoRangeCalendar'))+';compassoRangeSegments');
const keys=Array.from({length:14},(_,i)=>new Date(Date.UTC(2026,10,23+i)).toISOString().slice(0,10));
const segments=split([{id:'a',start:keys[2],end:keys[3]},{id:'b',start:keys[6],end:keys[8]},{id:'c',start:keys[2],end:keys[4]}],keys);
assert.equal(segments.filter(x=>x.id==='a').length,1);assert.equal(segments.find(x=>x.id==='a').span,2);
const cross=segments.filter(x=>x.id==='b');assert.equal(cross.length,2);assert(cross[0].continuesAfter);assert(cross[1].continuesBefore);assert.equal(cross[1].span,2);
assert.notEqual(segments.find(x=>x.id==='a').lane,segments.find(x=>x.id==='c').lane);
console.log('OK: datas inclusivas, registros antigos, virada de ano, faixas, sobreposicoes e continuacao entre semanas.');
