import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceView} from '../src/reference-alignment.ts';
import {isUsedConnection} from '../src/assembly-model.ts';

function fixture(){return {meta:{packageDigest:'one'},parts:[{id:'seat',position:[0,0,.0002],quaternion:[0,0,0,1]},{id:'anchor',position:[0,0,0]}],assembly:{features:[],interfaces:[{id:'socket',note:'source offset'}],connections:[{id:'relation',basis:'incompatible',note:'source conflict'}],part_notes:[{owner_ref:'seat',text:'source conflict',evidence_refs:['source']} ]},reference_alignment:{configuration_ref:'corrected',source_configuration_ref:'source',title:'Engineering correction',basis:'engineering_inference',placements:[{part_ref:'seat',source_position:[0,0,.0002],position:[0,0,0],quaternion:[0,0,0,1]}],presentation:{part_notes:[{owner_ref:'seat',text:'Corrected, source unchanged'}],interfaces:[{interface_ref:'socket',note:'Corrected fit',geometry_summary:'finite socket'}],connections:[{connection_ref:'relation',basis:'inferred_fit',note:'Corrected fit',check_refs:['axis']} ]}}};}
test('uses published placements and inference labels while retaining exact source display',()=>{
 const data=fixture(),before=JSON.stringify(data),view=referenceView(data,'corrected');
 assert.deepEqual(view.parts[0].position,[0,0,0]);assert.equal(view.assembly.connections[0].basis,'inferred_fit');assert.ok(isUsedConnection(view.assembly.connections[0]));
 assert.equal(view.meta.activeReferenceConfiguration,'corrected');assert.equal(view.assembly.part_notes[0].text,'Corrected, source unchanged');
 assert.equal(JSON.stringify(data),before);assert.strictEqual(referenceView(data,'source').parts,data.parts);assert.equal(referenceView(data).meta.activeReferenceConfiguration,'source');
 assert.deepEqual(referenceView(data,'source').parts[0].position,[0,0,.0002]);assert.equal(referenceView(data,'source').assembly.connections[0].basis,'incompatible');
});
test('lazy detail merges never accumulate translations or reload unchanged part positions',()=>{
 const data=fixture(),first=referenceView(data,'corrected'),hydrated={...data,assembly:{...data.assembly,features:[{id:'finite-wall'}]}};
 const second=referenceView(hydrated,'corrected');assert.strictEqual(first.parts,second.parts);assert.deepEqual(second.parts[0].position,[0,0,0]);
 assert.strictEqual(referenceView(data,'source').parts,data.parts);assert.equal(referenceView(data).meta.activeReferenceConfiguration,'source');
});
test('historical packages have unchanged reference semantics',()=>{
 const data=fixture();delete data.reference_alignment;assert.strictEqual(referenceView(data),data);
});
