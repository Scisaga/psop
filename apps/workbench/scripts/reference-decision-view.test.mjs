import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceDecisionView,activeReferenceDecisions} from '../src/reference-decisions.ts';
import {isUsedConnection,interfaceUseState} from '../src/assembly-model.ts';

const data={meta:{packageDigest:'sha',activeReferenceConfiguration:'corrected'},parts:[],assembly:{interfaces:[{id:'a'},{id:'b'}],connections:[{id:'fit',basis:'hypothesis',endpoints:[{interface_ref:'a',member_refs:[]},{interface_ref:'b',member_refs:[]}]}],features:[]}};
const ledger={package_digest:'sha',events:[{id:'1',target_key:'x',action:'confirm',created_at:'now',note:'实物核对',target:{configuration_ref:'corrected',connection_ref:'fit',endpoints:[]}}]};
test('human confirmation changes displayed use while preserving the original basis and measurements',()=>{
  const source=structuredClone(data),view=referenceDecisionView(source,ledger),c=view.assembly.connections[0];
  assert.equal(c.basis,'hypothesis');assert.equal(isUsedConnection(c),true);assert.equal(interfaceUseState(view,{id:'a'}),'manual');
  assert.equal(source.assembly.connections[0].manual_decision,undefined);assert.equal(view.parts,source.parts);
});
test('judgments never bleed between packages or configurations and undo restores the source view',()=>{
  assert.equal(referenceDecisionView(data,{...ledger,package_digest:'other'}),data);
  assert.equal(referenceDecisionView({...data,meta:{...data.meta,activeReferenceConfiguration:'raw'}},ledger).assembly.connections[0].manual_decision,undefined);
  const undone={...ledger,events:[...ledger.events,{action:'undo',target_key:'x'}]};assert.equal(activeReferenceDecisions(undone).length,0);assert.equal(referenceDecisionView(data,undone),data);
});
test('manual exclusion overrides use display without falsifying a geometric incompatibility',()=>{
  const view=referenceDecisionView(data,{...ledger,events:[{...ledger.events[0],action:'reject'}]});
  assert.equal(view.assembly.connections[0].basis,'hypothesis');assert.equal(isUsedConnection(view.assembly.connections[0]),false);assert.equal(interfaceUseState(view,{id:'a'}),'excluded');
});
