import type {GeometryDescriptor,GeometrySelection,PrototypeData,Vec3} from './types';
import {assemblyIndex,featureLabel,interfacesForPart,selectedAssemblyMembers,selectionForInterface} from './assembly-model';

export function featuresFor(data:PrototypeData,refs:string[]){const index=assemblyIndex(data);return refs.flatMap(id=>{const f=index.features.get(id);return f?[f]:[];});}
export function descriptorFeatures(data:PrototypeData,item:GeometryDescriptor){return featuresFor(data,item.featureRefs);}
export function resolveGeometry(data:PrototypeData,selection:GeometrySelection|null):GeometryDescriptor|null{
 if(!selection)return null;const index=assemblyIndex(data);
 if(selection.kind==='feature'){
  const f=index.features.get(selection.id);if(!f||selection.ownerRef&&f.owner_ref!==selection.ownerRef)return null;
  const g=f.geometry;return{selection,ownerRef:f.owner_ref,title:featureLabel(f),featureRefs:[f.id],position:g.origin,normal:('axis'in g?g.axis:g.normal),entries:[],peers:[],contextPartRefs:[f.owner_ref]};
 }
 const item=index.interfaces.get(selection.id);if(!item||selection.ownerRef&&item.owner_ref!==selection.ownerRef)return null;
 const members=selectedAssemblyMembers(data,item,selection);
 const featureRefs=[...new Set(members.flatMap(m=>m.feature_refs))];
 const extent=members.length?members:item.members;
 const position=[0,1,2].map(axis=>extent.reduce((sum,m)=>sum+m.position[axis],0)/extent.length) as Vec3;
 return{selection,ownerRef:item.owner_ref,title:item.name,featureRefs,position,normal:extent[0].direction,
  entries:members.flatMap(m=>m.feature_refs.map(featureRef=>({featureRef,position:m.position,direction:m.direction}))),peers:[],contextPartRefs:[item.owner_ref]};
}
export function pickedInterfaces(data:PrototypeData,owner:string,triangle:number){
 const features=assemblyIndex(data).features;
 return interfacesForPart(data,owner).flatMap(item=>item.members.filter(member=>member.feature_refs.some(id=>features.get(id)?.geometry.triangle_indices.includes(triangle))).map(member=>({interface:item,member})));
}
export function pickedFeatures(data:PrototypeData,owner:string,triangle:number){
 return (data.assembly?.features??[]).filter(feature=>feature.owner_ref===owner&&feature.geometry.triangle_indices.includes(triangle));
}
export {selectionForInterface};
export function routeSelection(params:URLSearchParams):GeometrySelection|null{
 const kind=params.has('interface')?'interface':params.has('feature')?'feature':null;if(!kind)return null;
 return{kind,id:params.get(kind)!,ownerRef:params.get('part')||undefined,memberRef:params.get('member')||undefined,memberRefs:params.has('members')?(params.get('members')||'').split(',').filter(Boolean):undefined,relationRef:params.get('relationRef')||undefined,fastenerRef:params.get('fastener')||undefined};
}
export const selectionQueryKey=(selection:GeometrySelection)=>selection.kind;
