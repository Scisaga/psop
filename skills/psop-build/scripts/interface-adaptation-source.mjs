import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {buildInterfaceAdaptations} from './interface-adaptations.mjs';
const decode=bytes=>JSON.parse((bytes[0]===31&&bytes[1]===139?gunzipSync(bytes):bytes).toString('utf8'));
export async function analyzeInterfaceAdaptations({scene,root,catalog}){
 const details=catalog?null:await Promise.all(Object.entries(scene.assembly?.capability_index?.parts??{}).map(async([owner,p])=>[owner,decode(await readFile(path.join(root,...p.path.split('/'))))]));
 const interfaces=catalog?.interfaces??details.flatMap(([,d])=>d.interfaces),features=catalog?.features??details.flatMap(([,d])=>d.features),connections=catalog?.reference_connections??[...new Map(details.flatMap(([,d])=>(d.reference_connections??[]).map(c=>[c.id,c]))).values()];
 const used=new Set(interfaces.map(i=>i.owner_ref)),meshes=new Map(await Promise.all(scene.parts.filter(p=>used.has(p.id)).map(async p=>[p.id,await readFile(path.join(root,...p.geometryUrl.split('/')))])));
 return buildInterfaceAdaptations({parts:scene.parts,interfaces,features,connections,meshes});
}
