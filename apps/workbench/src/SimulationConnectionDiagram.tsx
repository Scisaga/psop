import {useEffect,useRef,useState} from 'react';
import {Image,LoaderCircle} from 'lucide-react';
import type {ConnectionCandidate} from './simulate-types';

export default function SimulationConnectionDiagram({candidate,ready,render,label}:{candidate:ConnectionCandidate;ready:boolean;render:(candidate:ConnectionCandidate)=>Promise<string|null>;label?:string}){
 const host=useRef<HTMLSpanElement>(null),[diagram,setDiagram]=useState<{id:string;url:string|null}|null>(null);
 useEffect(()=>{
  if(!ready)return;let frame=0,active=true;
  const observer=new IntersectionObserver(entries=>{if(!entries.some(entry=>entry.isIntersecting))return;observer.disconnect();frame=requestAnimationFrame(()=>{void render(candidate).then(url=>{if(active)setDiagram({id:candidate.id,url});}).catch(()=>{if(active)setDiagram({id:candidate.id,url:null});});});},{root:host.current!.closest('.simulation-card-methods'),rootMargin:'80px'});
  observer.observe(host.current!);return()=>{active=false;observer.disconnect();cancelAnimationFrame(frame);};
 },[candidate.id,ready,render]);
 const current=ready&&diagram?.id===candidate.id?diagram:null;
 return <span ref={host} className="simulation-connection-diagram" data-diagram-ready={!!current?.url}>
  {current?.url?<img src={current.url} width={192} height={128} alt={`${label??candidate.title}的接口对齐图示`} draggable={false}/>:current?<span className="simulation-diagram-fallback"><Image size={20}/>图示暂不可用</span>:<LoaderCircle size={20} className="spin" aria-label="正在生成连接图示"/>}
 </span>;
}
