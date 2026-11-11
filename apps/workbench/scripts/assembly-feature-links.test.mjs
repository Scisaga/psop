import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {interfaceFeatureRefs,interfacesForSelection} from '../src/assembly-model.ts';

test('published measured hip bores and head cradles inherit their explicitly migrated functional association',async()=>{
 const root=new URL('../../../build/microduck/source-1.15/microduck-capabilities-9.dkp/',import.meta.url);
 const scene=JSON.parse(await fs.readFile(new URL('indexes/scene.json',root),'utf8'));
 for(const [owner,feature,iface] of [
  ['55970da91992f38c','feature:73de4a7931432d81390d:geometry:84530ebce6a93b73e437','hip_support_two_holes'],
  ['986b5adf27910138','feature:235863d91c3a953cf25b:geometry:71085be1b816cc33630d','roll_bearing_drive_cradle'],
 ]){
  const ownerRef='part:microduck:'+owner,entry=scene.assembly.capability_index.parts[ownerRef];
  const detail=JSON.parse(gunzipSync(await fs.readFile(new URL(entry.path,root))));
  const data={...scene,assembly:{...scene.assembly,features:detail.features,interfaces:detail.interfaces}};
  const expected=detail.interfaces.find(i=>i.id===`interface:assembly:${owner}:${iface}`);
  assert.ok(interfaceFeatureRefs(data,expected).includes(feature));
  assert.ok(interfacesForSelection(data,{kind:'feature',id:feature,ownerRef}).some(i=>i.id===expected.id));
  assert.equal(interfacesForSelection(data,{kind:'feature',id:feature,ownerRef:'other-part'}).length,0);
 }
});

test('associations require declared replacements with the same owner and source digest',()=>{
 const feature=(id,owner_ref='part-a',geometry_digest='sha256:a')=>({id,owner_ref,geometry_digest});
 const declared={...feature('alias'),replacement_feature_refs:['actual','foreign-owner','foreign-source']};
 const iface={id:'interface-a',owner_ref:'part-a',members:[{feature_refs:['alias']}]};
 const data={parts:[],assembly:{features:[declared,feature('actual'),feature('foreign-owner','part-b'),feature('foreign-source','part-a','sha256:b'),feature('unrelated')],interfaces:[iface],connections:[]}};
 assert.deepEqual(interfaceFeatureRefs(data,iface),['alias','actual']);
 assert.deepEqual(interfacesForSelection(data,{kind:'feature',id:'unrelated',ownerRef:'part-a'}),[]);
});
