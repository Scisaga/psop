import type {Part,PrototypeData,ReferenceAlignment} from './types';

export type ReferenceMode='corrected'|'source';
const positions=new WeakMap<Part[],{alignment:ReferenceAlignment;parts:Part[]}>();

/** Display only a validated, published configuration. No client fitting or mutation. */
export function referenceView(data:PrototypeData,mode:ReferenceMode='source'):PrototypeData{
 const alignment=data.reference_alignment;
 if(!alignment)return data;
 if(mode==='source')return {...data,meta:{...data.meta,activeReferenceConfiguration:alignment.source_configuration_ref}};
 let cached=positions.get(data.parts);
 if(!cached||cached.alignment!==alignment){
  const moved=new Map(alignment.placements.map(p=>[p.part_ref,p]));
  cached={alignment,parts:data.parts.map(p=>{const placement=moved.get(p.id);return placement?{...p,position:placement.position,quaternion:placement.quaternion}:p;})};
  positions.set(data.parts,cached);
 }
 const notes=new Map(alignment.presentation.part_notes.map(n=>[n.owner_ref,n]));
 const interfaces=new Map(alignment.presentation.interfaces.map(i=>[i.interface_ref,i]));
 const connections=new Map(alignment.presentation.connections.map(c=>[c.connection_ref,c]));
 return {...data,parts:cached.parts,meta:{...data.meta,activeReferenceConfiguration:alignment.configuration_ref},
  assembly:data.assembly?{...data.assembly,
   interfaces:data.assembly.interfaces.map(i=>{const update=interfaces.get(i.id);return update?{...i,note:update.note,geometry_summary:update.geometry_summary}:i;}),
   connections:data.assembly.connections.map(c=>{const update=connections.get(c.id);return {...c,...(update?{note:update.note,basis:update.basis??c.basis}:{}),configuration_ref:alignment.configuration_ref};}),
   part_notes:[...data.assembly.part_notes.filter(n=>!notes.has(n.owner_ref)),...alignment.presentation.part_notes.map(n=>({...n,evidence_refs:[]}))],
  }:undefined};
}
