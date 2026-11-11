import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionUseState,hasIdentifiedCounterpart,interfaceUseState,isUsedConnection,referenceAssessment,referencePendingSummary} from '../src/assembly-model.ts';

const assessment={schema:'psop.reference-connection-assessment/1',configuration_ref:'source',purpose:'identified',counterpart:'identified',geometry:'axes_aligned',fastening:'unspecified',summary:'Mounting peer identified.',evidence_refs:['e'],open_items:[{kind:'fastening',note:'Verify screw specification.'}]};
const connection={id:'c',basis:'hypothesis',configuration_ref:'source',endpoints:[{interface_ref:'a',member_refs:['a:hole']},{interface_ref:'b',member_refs:['b:hole']}],reference_assessment:assessment};
const dataFor=c=>({parts:[],assembly:{interfaces:[{id:'a'},{id:'b'}],features:[],connections:[c]}});

test('identified mounting peer is visible without asserting installed screws',()=>{
  assert.equal(hasIdentifiedCounterpart(connection),true);
  assert.equal(isUsedConnection(connection),false);
  assert.equal(interfaceUseState(dataFor(connection),{id:'a'}),'identified');
  assert.match(referencePendingSummary(connection),/孔位已对应.*紧固细节待核/);
});
test('known counterpart survives a separate geometry review',()=>{
  const c={...connection,reference_assessment:{...assessment,geometry:'review_required'}};
  assert.equal(hasIdentifiedCounterpart(c),true);
  assert.equal(connectionUseState(c),'review');
  assert.match(referencePendingSummary(c),/对端已识别.*紧固细节待核/);
});
test('source assessment does not leak into a separately corrected configuration',()=>{
  const c={...connection,configuration_ref:'corrected',basis:'inferred_fit'};
  assert.equal(referenceAssessment(c),undefined);
  assert.equal(connectionUseState(c),'used');
  assert.equal(referencePendingSummary(c),'');
});
test('manual decisions override display while retaining geometric assessment',()=>{
  const c={...connection,reference_assessment:{...assessment,geometry:'review_required'},manual_decision:{status:'confirmed'}};
  assert.equal(connectionUseState(c),'manual');
  assert.match(referencePendingSummary(c),/几何待核.*紧固细节待核/);
  const rejected={...c,manual_decision:{status:'rejected'}};
  assert.equal(hasIdentifiedCounterpart(rejected),false);
  assert.equal(interfaceUseState(dataFor(rejected),{id:'a'}),'excluded');
});
test('unassessed original hypotheses retain an explicit pending state',()=>{
  const c={...connection,reference_assessment:undefined};
  assert.equal(hasIdentifiedCounterpart(c),false);
  assert.equal(connectionUseState(c),'possible');
  assert.equal(interfaceUseState(dataFor(c),{id:'a'}),'possible');
});
