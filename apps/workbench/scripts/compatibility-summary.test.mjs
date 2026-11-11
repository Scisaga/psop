import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {structureComparisons,measurementRows,sortedCandidates,cartesianComparisonPage,featureCaption,exploratoryCandidate} from '../src/compatibility-summary.ts';
import {compatibilityPatternLabel,compatibilityConditionLabel} from '../src/compatibility-presentation.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../build/microduck/source-1.15/microduck-capabilities-9.dkp');
const read=async file=>{const b=await fs.readFile(path.join(root,file));return JSON.parse((file.endsWith('.gz')?gunzipSync(b):b).toString('utf8'));};
const data=await read('indexes/scene.json'),index=await read('indexes/capabilities.json'),detail=await read('details/pairs/d5cf51f6df5344f5f634.json.gz');
for(const owner of detail.owner_refs){const d=await read(index.parts[owner].path);data.assembly.features.push(...d.features.filter(f=>!data.assembly.features.some(old=>old.id===f.id)));}
const relations=detail.local_geometry_clues??detail.candidates;
const cylindrical=relations.find(c=>c.template_ref.includes('cylindrical_insertion'));
test('shared stepped-hole resources group six published comparisons into four structural groups without losing an edge',()=>{
  const groups=structureComparisons(data,cylindrical);
  assert.equal(groups.length,4);assert.equal(groups.flatMap(g=>g.pairs).length,6);
  assert.equal(groups.filter(g=>g.featuresB.length===2).length,2);
  assert.deepEqual(new Set(groups.flatMap(g=>g.pairs).map(p=>JSON.stringify(p))),new Set(cylindrical.mapping_family.pairs.map(p=>JSON.stringify(p))));
});
test('the two endpoints have readable dimensions and retain measured allowance and finite length',()=>{
  const pair=cylindrical.mapping_family.pairs.find(p=>data.assembly.features.find(f=>f.id===p.feature_b_ref)?.geometry.radius_m<.01);
  const rows=measurementRows(data,cylindrical,pair);
  assert.match(rows.find(r=>r.label==='本端结构').value,/Ø18.5/);assert.match(rows.find(r=>r.label==='对端结构').value,/Ø19/);
  assert.match(rows.find(r=>r.label==='单边尺寸余量').value,/0.25 mm/);assert.match(rows.find(r=>r.label==='有限段长度').value,/0.9 mm/);
  assert.equal(rows.some(r=>/组装成功|实际插入/.test(r.value)),false);
  for(const endpoint of cylindrical.endpoints)for(const ref of endpoint.feature_refs)assert.doesNotMatch(featureCaption(data,ref),/读取中|几何 \d/);
});
test('presentation order retains all local clues while ordinary contact remains in the exploration data',()=>{
  const sorted=sortedCandidates(relations);assert.equal(sorted.length,5);
  assert.deepEqual(new Set(sorted.map(c=>c.id)),new Set(relations.map(c=>c.id)));
  assert.equal(sorted[0],cylindrical);assert.equal(sorted.filter(exploratoryCandidate).length,1);
});
test('cartesian comparison pages cover the published relation exactly, without eager materialization',()=>{
  const c=relations.find(c=>c.mapping_family.kind==='cartesian_feature_relation'),family=c.mapping_family,total=family.features_a.length*family.features_b.length;
  assert.equal(total,3648);const pairs=[];
  for(let offset=0;offset<total;offset+=71)pairs.push(...cartesianComparisonPage(c,offset,71));
  assert.equal(pairs.length,total);assert.equal(new Set(pairs.map(p=>p.feature_a_ref+'|'+p.feature_b_ref)).size,total);
  assert.deepEqual(cartesianComparisonPage(c,total,5),[]);
});
test('similar-looking dimensions never merge independent physical resources',()=>{
  const ref=cylindrical.mapping_family.pairs[0].feature_b_ref;
  const changed={...data,assembly:{...data.assembly,features:data.assembly.features.map(f=>f.id===ref?{...f,capability:{...f.capability,resource_refs:['separate-witnessed-resource']}}:f)}};
  const groups=structureComparisons(changed,cylindrical);assert.equal(groups.flatMap(g=>g.pairs).length,6);
  assert.ok(groups.some(g=>g.featuresB.includes(ref)));
});
test('whole-body collision clearance does not promote a partial cradle to a complete seat',()=>{
  const match={member_count:1,selection_a:'all_members',selection_b:'all_members',registration:{whole_part_collision_evaluated:true},
    member_pairs:[{radial_fit:{kind:'attributed_functional_clearance',fit_kinds:['partial_radial_support']}}]};
  assert.equal(compatibilityPatternLabel(match),'局部支承');
  assert.match(compatibilityConditionLabel('partial_support_contact_and_encirclement_unverified'),/实际接触.*轴向保持/);
});
test('documented subgroups remain visibly distinct from using the entire source pattern',()=>{
  const match={member_count:4,source_member_count_b:6,selection_a:'all_members',selection_b:'declared_member_set',member_pairs:[]};
  assert.equal(compatibilityPatternLabel(match),'指定孔组');
  assert.equal(compatibilityPatternLabel({...match,selection_b:'all_members'}),'完整接口');
  assert.equal(compatibilityPatternLabel({...match,selection_b:'adjacent_pair'}),'相邻双孔');
});
