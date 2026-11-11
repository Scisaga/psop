import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {activeDecisions,createReferenceDecisionStore,readDecisionRequest} from './reference-decisions.mjs';

async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),'psop-reference-decisions-'));
  const scene={parts:[{id:'a'},{id:'b'}],reference_alignment:{configuration_ref:'corrected',source_configuration_ref:'raw'},assembly:{interfaces:[
    {id:'ia',owner_ref:'a',name:'壳体承座',members:[{id:'a1'}]},
    {id:'ib',owner_ref:'b',name:'支架承槽',members:[{id:'b1'}]}],connections:[{id:'fit',name:'壳体与支架',mechanism:'有限面定位',basis:'hypothesis',endpoints:[{interface_ref:'ia',member_refs:['a1']},{interface_ref:'ib',member_refs:['b1']}]}]}};
  const bytes=Buffer.from(JSON.stringify(scene));
  const options={registryFile:path.join(root,'registry.json'),load:async(w,s)=>{if(w!=='w'||s!=='s')throw new Error('Unknown workspace');return {manifest:{package_digest:'a'.repeat(64),entrypoints:{scene:'scene.json'}}};},read:async()=>bytes};
  const target={configuration_ref:'corrected',connection_ref:'fit',endpoints:[{owner_ref:'a',interface_ref:'ia',member_refs:['a1']},{owner_ref:'b',interface_ref:'ib',member_refs:['b1']}]};
  return {options,target,bytes,store:createReferenceDecisionStore(options)};
}
test('confirms, persists across store restarts, rejects and undoes without changing source bytes',async()=>{
  const f=await fixture(),original=Buffer.from(f.bytes);
  let ledger=await f.store.get('w','s');assert.equal(ledger.revision,0);
  ledger=await f.store.update('w','s',{action:'confirm',expected_revision:0,target:f.target,note:'已核对实物定位'});
  assert.equal(activeDecisions(ledger)[0].basis,'user_statement');assert.equal(activeDecisions(ledger)[0].note,'已核对实物定位');
  const reopened=createReferenceDecisionStore(f.options);assert.deepEqual(await reopened.get('w','s'),ledger);
  ledger=await reopened.update('w','s',{action:'reject',expected_revision:1,target:f.target,note:'另一个接口负责此连接'});
  assert.equal(activeDecisions(ledger)[0].action,'reject');
  ledger=await reopened.update('w','s',{action:'undo',expected_revision:2,decision_ref:activeDecisions(ledger)[0].id});
  assert.equal(activeDecisions(ledger).length,0);assert.equal(ledger.events.length,3);assert.deepEqual(f.bytes,original);
});
test('concurrent writers cannot overwrite an earlier judgment with a stale revision',async()=>{
  const {store,target}=await fixture();
  const results=await Promise.allSettled([store.update('w','s',{action:'confirm',expected_revision:0,target}),store.update('w','s',{action:'reject',expected_revision:0,target,note:'不同判断'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
  assert.equal((await store.get('w','s')).events.length,1);
});
test('rejects false owners, self pairs, foreign members, stale mappings and unknown configurations',async()=>{
  const f=await fixture();
  for(const change of [t=>{t.endpoints[0].owner_ref='b';},t=>{t.endpoints[0].member_refs=['b1'];},t=>{t.endpoints[0].member_refs=[];},t=>{t.configuration_ref='fiction';},t=>{t.connection_ref='missing';},t=>{t.connection_ref=null;t.endpoints[1]={...t.endpoints[0]};}]){
    const target=structuredClone(f.target);change(target);
    await assert.rejects(f.store.update('w','s',{action:'confirm',expected_revision:0,target}));
  }
  assert.equal((await f.store.get('w','s')).revision,0);
});
test('a new explicit binding retains unspecified members and is separate per configuration',async()=>{
  const {store,target}=await fixture();target.connection_ref=null;target.endpoints.forEach(e=>e.member_refs=[]);
  let ledger=await store.update('w','s',{action:'confirm',expected_revision:0,target,note:'部件对应明确，选孔未定'});
  assert.deepEqual(ledger.events[0].target.endpoints.map(e=>e.member_refs),[[],[]]);
  ledger=await store.update('w','s',{action:'confirm',expected_revision:1,target:{...target,configuration_ref:'raw'}});
  assert.equal(activeDecisions(ledger).length,2);assert.notEqual(ledger.events[0].target_key,ledger.events[1].target_key);
});
test('requires an exclusion reason and only permits undoing an active judgment',async()=>{
  const {store,target}=await fixture();await assert.rejects(store.update('w','s',{action:'reject',expected_revision:0,target,note:' '}),/理由/);
  let ledger=await store.update('w','s',{action:'confirm',expected_revision:0,target});
  const id=ledger.events[0].id;ledger=await store.update('w','s',{action:'undo',expected_revision:1,decision_ref:id});
  await assert.rejects(store.update('w','s',{action:'undo',expected_revision:2,decision_ref:id}),/撤销/);
});
test('checks write origin, JSON content and request size',async()=>{
  const request=(body,extra={})=>Object.assign(Readable.from([Buffer.from(body)]),{headers:{host:'localhost:8780','content-type':'application/json',...extra}});
  assert.deepEqual(await readDecisionRequest(request('{"action":"confirm"}')),{action:'confirm'});
  await assert.rejects(readDecisionRequest(request('{}',{origin:'https://example.com'})),e=>e.status===403);
  await assert.rejects(readDecisionRequest(request('{}',{'sec-fetch-site':'cross-site'})),e=>e.status===403);
  await assert.rejects(readDecisionRequest(request('{}',{'content-type':'text/plain'})),e=>e.status===415);
  await assert.rejects(readDecisionRequest(request('bad')),e=>e.status===400);
  await assert.rejects(readDecisionRequest(request('x'.repeat(65537))),e=>e.status===413);
});
