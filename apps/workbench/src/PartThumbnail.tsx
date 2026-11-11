import {useEffect,useState} from 'react';
import {Box,Cpu,Settings2} from 'lucide-react';
import type {Part} from './types';

export function PartThumbnail({part,ready,renderThumbnail}:{part:Part;ready:boolean;renderThumbnail:(id:string)=>string|null}){
 const key=`${part.geometryUrl}:${part.id}`;
 const [image,setImage]=useState<{key:string;url:string}|null>(null);
 useEffect(()=>{
  if(!ready)return;
  const frame=requestAnimationFrame(()=>{
   try{const url=renderThumbnail(part.id);setImage(url?{key,url}:null);}catch{setImage(null);}
  });
  return()=>cancelAnimationFrame(frame);
 },[key,part.id,ready,renderThumbnail]);
 const url=ready&&image?.key===key?image.url:null;
 const Icon=part.kind==='actuator'?Settings2:part.kind==='electronics'?Cpu:Box;
 return <div className={`object-symbol object-thumbnail kind-${part.kind}`} data-thumbnail-ready={!!url}>
  {url?<img src={url} alt={`${part.name}的三维缩略图`} width={64} height={64} draggable={false}/>:<Icon size={25} aria-hidden="true"/>}
 </div>;
}
