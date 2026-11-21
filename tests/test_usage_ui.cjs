const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.style={};this.attrs={};this.events={};this.textContent='';this.value='30';}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];this.textContent='';}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,fn){this.events[k]=fn;}
  set innerHTML(v){throw new Error('Unsafe HTML insertion');}
}
const nodes=new Map();
const document={getElementById(id){if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t)};
const waiting={schema_version:1,status:'not_configured',site:'zihangzou.github.io',windows:{}};
let fixture=waiting,fail=false;
const context={document,Intl,Date,Number,Math,console,fetch:async()=>{if(fail)throw Error('offline');return{ok:true,json:async()=>fixture};}};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/usage.js'),'utf8'),context);await flush();
  assert.equal(nodes.get('views').textContent,'—');assert.equal(nodes.get('connection').textContent,'Awaiting setup');
  const windows={};for(const k of ['1','7','30'])windows[k]={start:'2026-11-01T00:00:00Z',end:'2026-11-21T01:00:00Z',views:Number(k),visits:1,neural_views:1,daily:[{date:'2026-11-20',views:Number(k),visits:1}],pages:[{label:'<img onerror=alert(1)>',views:1}],countries:[],referrers:[],devices:[]};
  fixture={schema_version:1,status:'ready',site:'zihangzou.github.io',updated_at:new Date().toISOString(),windows};
  await nodes.get('refresh').events.click();assert.equal(nodes.get('views').textContent,'30');assert.equal(nodes.get('connection').textContent,'Connected');
  assert.equal(nodes.get('page-rows').children[0].children[0].children[0].textContent,'<img onerror=alert(1)>');
  assert.equal(nodes.get('chart').children[0].tag,'svg');
  nodes.get('range').value='7';nodes.get('range').events.change();assert.equal(nodes.get('views').textContent,'7');
  fail=true;await nodes.get('refresh').events.click();assert.equal(nodes.get('views').textContent,'7');assert.equal(nodes.get('connection').textContent,'Sync unavailable');
  assert.match(nodes.get('notice').textContent,/last loaded snapshot/);
  fail=false;fixture=structuredClone(fixture);fixture.windows['7'].views=null;await nodes.get('refresh').events.click();assert.equal(nodes.get('views').textContent,'7');assert.equal(nodes.get('connection').textContent,'Sync unavailable');
  fixture=structuredClone(fixture);fixture.windows['7'].views=0;fixture.windows['7'].daily[0].views=0;fixture.windows['7'].visits=0;fixture.windows['7'].neural_views=0;await nodes.get('refresh').events.click();assert.equal(nodes.get('views').textContent,'0');assert.match(nodes.get('notice').textContent,/no recorded page views/);
  fixture.updated_at='2020-01-01T00:00:00Z';await nodes.get('refresh').events.click();assert.match(nodes.get('notice').textContent,/over 24 hours old/);
  console.log('PASS: pending, connected, range selection, safe text, fetch failure, invalid data, zero traffic and stale data states');
})().catch(e=>{console.error(e);process.exit(1);});
