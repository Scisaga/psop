import test from 'node:test';
import assert from 'node:assert/strict';
import {capabilityAssetUrl,loadPartCapabilities,mergePartCapabilities,loadCompatibilityIndex,loadCompatibilityPair} from '../src/capability-data.ts';
import {featureDimensions,featureLabel,geometrySearchEntries,selectionForFeature,assemblyIndex,referenceAssemblyData,interfaceUseState} from '../src/assembly-model.ts';
import {compatibilityRelations,compatibilityTemplateLabel,compatibilityConditionLabel,connectorRequirementLabel} from '../src/compatibility-presentation.ts';

const base='/api/workspaces/device/snapshots/revision/assets/';
const feature=(id,owner='part-a')=>({id,owner_ref:owner,geometry_source_ref:'source',geometry_digest:'sha256:'+'a'.repeat(64),kind:'bore_wall',geometry:{type:'cylinder',origin:[0,0,0],axis:[0,0,1],radius_m:.0011,axial_range_m:[0,.004],triangle_indices:[0,1]}});
function fixture(digest='package-a'){
 return {meta:{packageDigest:digest},parts:[{id:'part-a',name:'外壳',geometryUrl:base+'sources/shell.stl'},{id:'part-b',name:'支架',geometryUrl:base+'sources/support.stl'}],bodies:[],evidence:[],assembly:{features:[],interfaces:[],connections:[],part_notes:[],capability_index:{asset_base:base,parts:{'part-a':{path:'indexes/parts/a.json',feature_count:1,interface_count:0,candidate_count:1}},compatibility:{index_path:'indexes/compatibility.json'}}}};
}
const detail=()=>({schema:'psop.part-capabilities/1',owner_ref:'part-a',features:[feature('unused-bore')],interfaces:[],resources:[],frames:[],reference_connections:[],compatibility_pairs:[]});

test('resolves lazy references from package root and rejects snapshot escapes',()=>{
 const data=fixture();
 assert.equal(capabilityAssetUrl(data,'indexes/parts/a.json'),base+'indexes/parts/a.json');
 assert.equal(capabilityAssetUrl(data,base+'indexes/parts/part%3Aa.json'),base+'indexes/parts/part%3Aa.json');
 for(const path of ['../other.json','indexes/../other.json','https://example.test/data.json','/api/workspaces/other/assets/data.json',base+'../secret',base+'%2e%2e/secret',base+'a%2fb.json'])assert.throws(()=>capabilityAssetUrl(data,path),/路径/);
 const withoutExplicit=fixture();delete withoutExplicit.assembly.capability_index.asset_base;
 assert.equal(capabilityAssetUrl(withoutExplicit,'indexes/parts/a.json'),base+'indexes/parts/a.json');
});

test('hydrates orphan geometry immutably and makes it searchable and selectable',()=>{
 const original=fixture(),before=JSON.stringify(original),hydrated=mergePartCapabilities(original,detail());
 assert.equal(JSON.stringify(original),before);assert.notStrictEqual(hydrated,original);
 assert.equal(hydrated.assembly.features.length,1);assert.equal(hydrated.assembly.interfaces.length,0);
 assert.strictEqual(mergePartCapabilities(hydrated,detail()),hydrated);
 const found=geometrySearchEntries(hydrated,'2.2');assert.equal(found.length,1);assert.deepEqual(found[0].selection,{kind:'feature',id:'unused-bore',ownerRef:'part-a'});
 assert.equal(featureLabel(hydrated.assembly.features[0]),'有限内孔壁');assert.match(featureDimensions(hydrated.assembly.features[0]),/Ø2.2.*4 mm/);
 assert.equal(assemblyIndex(original).features.size,0);assert.equal(assemblyIndex(hydrated).features.size,1);
 assert.deepEqual(selectionForFeature(hydrated.assembly.features[0]),found[0].selection);
});

test('reference assembly retains both bearing rings without inventing a peer or use state',()=>{
 const data=fixture('unresolved-bearing-rings');
 const ring=(id,key)=>({id,owner_ref:'part-a',key,name:key,geometry_summary:'finite ring',members:[],selection:{kind:'unspecified'},origin:'source_geometry',evidence_refs:[],capability_basis:'migrated_semantic_assertion'});
 const inner=ring('bearing-inner','inner_ring'),outer=ring('bearing-outer','outer_ring');
 const hypothetical={...ring('geometric-pattern','pattern'),capability_basis:'geometry_hypothesis'};
 data.assembly.interfaces=[inner,outer,hypothetical];
 const reference=referenceAssemblyData(data);
 assert.deepEqual(reference.assembly.interfaces.map(item=>item.id),['bearing-inner','bearing-outer']);
 assert.equal(reference.assembly.connections.length,0);
 assert.equal(interfaceUseState(reference,inner),'available');
 assert.equal(interfaceUseState(reference,outer),'available');
 assert.equal(data.assembly.interfaces.length,3);
 // Source summaries need not have been hydrated with capability metadata yet.
 delete outer.capability_basis;
 assert.equal(referenceAssemblyData(data).assembly.interfaces.length,2);
});

test('loads once per immutable package and checks exact part ownership',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify(detail()));};
 try{
  const data=fixture('load-once');
  const [one,two]=await Promise.all([loadPartCapabilities(data,'part-a'),loadPartCapabilities(data,'part-a')]);
  assert.strictEqual(one,two);assert.equal(calls,1);assert.equal(one.features[0].id,'unused-bore');
  assert.equal(await loadPartCapabilities(data,'unknown'),null);
  const bad=detail();bad.features[0].owner_ref='part-b';globalThis.fetch=async()=>new Response(JSON.stringify(bad));
  await assert.rejects(loadPartCapabilities(fixture('wrong-owner'),'part-a'),/其他部件/);
 }finally{globalThis.fetch=previous;}
});

test('a failed read can retry and a cancelled consumer does not poison the cached asset',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>++calls===1?new Response('{}',{status:503}):new Response(JSON.stringify(detail()));
 try{
  const data=fixture('retry');await assert.rejects(loadPartCapabilities(data,'part-a'),/503/);
  assert.equal((await loadPartCapabilities(data,'part-a')).owner_ref,'part-a');assert.equal(calls,2);
  const controller=new AbortController();controller.abort();
  await assert.rejects(loadPartCapabilities(data,'part-a',controller.signal),{name:'AbortError'});
  assert.equal((await loadPartCapabilities(data,'part-a')).owner_ref,'part-a');
 }finally{globalThis.fetch=previous;}
});

test('candidate index remains a directory and pair details are fetched and checked separately',async()=>{
 const previous=globalThis.fetch,seen=[];
 const pair={id:'pair-ab',owner_refs:['part-a','part-b'],path:'indexes/compatibility/ab.json',candidate_count:1};
 const responses={
  [base+'indexes/compatibility.json']:{schema:'psop.compatibility-index/1',pairs:[pair],scope:{kind:'local_geometry'}},
  [base+'indexes/compatibility/ab.json']:{schema:'psop.compatibility-pair/1',owner_refs:pair.owner_refs,candidates:[{id:'candidate',endpoints:[{owner_ref:'part-a',feature_refs:['unused-bore']},{owner_ref:'part-b',feature_refs:['shaft']}],geometric_witness:{status:'conditional'}}],screening:[]},
 };
 globalThis.fetch=async url=>{seen.push(url);return new Response(JSON.stringify(responses[url]));};
 try{
  const data=fixture('candidate-read');const index=await loadCompatibilityIndex(data);assert.equal(seen.length,1);
  const pairDetail=await loadCompatibilityPair(data,index.pairs[0]);assert.equal(pairDetail.candidates.length,1);assert.equal(seen.length,2);
  await assert.rejects(loadCompatibilityPair(data,{...pair,owner_refs:['part-b','part-a']}),/部件对不一致/);
  assert.deepEqual(data.assembly.features,[]);
 }finally{globalThis.fetch=previous;}
});

test('version 2 compatibility shards retain interference separately from virtual operation assessment',async()=>{
 const previous=globalThis.fetch,pair={id:'v2-pair',owner_refs:['part-a','part-b'],path:'details/v2-pair.json',candidate_count:1};
 const observation={status:'interference',intersection_volume_m3:.00305/1e9},assessment={schema:'psop.assembly-assessment/1',decision:'allow_with_note',reasons:['qualified_interface_contact']};
 globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('v2-pair.json')?{schema:'psop.compatibility-pair/2',owner_refs:pair.owner_refs,candidates:[{id:'v2',interface_matches:[{alignment_options:[{interference:observation,assembly_assessment:assessment}]}]}]}:{schema:'psop.compatibility-index/2',pairs:[pair]}));
 try{const data=fixture('v2-policy-read'),index=await loadCompatibilityIndex(data),detail=await loadCompatibilityPair(data,index.pairs[0]);assert.deepEqual(detail.candidates[0].interface_matches[0].alignment_options[0].interference,observation);assert.equal(detail.candidates[0].interface_matches[0].alignment_options[0].assembly_assessment.decision,'allow_with_note');}finally{globalThis.fetch=previous;}
});

test('pages the published mapping relation without adding new feature pairings',()=>{
 const finite={mapping_family:{kind:'finite_feature_relation',pairs:[{feature_a_ref:'a1',feature_b_ref:'b2'},{feature_a_ref:'a2',feature_b_ref:'b1'}]}};
 assert.deepEqual(compatibilityRelations(finite,1,1),{total:2,items:[{feature_a_ref:'a2',feature_b_ref:'b1'}]});
 const cartesian={mapping_family:{kind:'cartesian_feature_relation',features_a:['a1','a2'],features_b:['b1','b2','b3']}};
 assert.deepEqual(compatibilityRelations(cartesian,2,2),{total:6,items:[{feature_a_ref:'a1',feature_b_ref:'b3'},{feature_a_ref:'a2',feature_b_ref:'b1'}]});
 assert.equal(compatibilityRelations({}).total,0);
 assert.equal(compatibilityTemplateLabel('mechanism:cylindrical_insertion:1'),'圆柱轴与孔的有限适配');
 assert.equal(compatibilityConditionLabel('manufacturing_fit_unknown'),'制造配合公差未知');
 assert.match(connectorRequirementLabel({role:'screw',possible_shank_diameter_upper_bounds_m:[.0022]}),/螺钉.*Ø2.2.*规格/);
});

test('geometric potential can be searched without asserting a functional interface',()=>{
 const partDetail=detail();partDetail.features[0].capability={basis:'geometric_potential',role:'receiving_wall',template_refs:['mechanism:through_fastener:1'],resource_refs:[],member_selection:'finite_region_or_explicit_pattern',complementary_requirements:[],unresolved_conditions:[]};
 const data=mergePartCapabilities(fixture('potential-search'),partDetail);
 assert.equal(data.assembly.interfaces.length,0);
 assert.equal(geometrySearchEntries(data,'穿层')[0].selection.id,'unused-bore');
});
