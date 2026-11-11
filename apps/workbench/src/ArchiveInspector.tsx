import {useState} from 'react';
import type {PrototypeData} from './types';

// Historical packages stay byte-for-byte readable; their reports are never
// interpreted as current interfaces or replayed through the retired UI engine.
export default function ArchiveInspector({data,owner,requested}:{data:PrototypeData;owner:string;requested?:string}){
 const [opened,setOpened]=useState<string|null>(requested||null);
 const analysis=(data as unknown as {analysis?:Record<string,unknown>}).analysis;
 const records=Object.values(analysis||{}).flatMap(value=>Array.isArray(value)?value:[]).filter((item):item is Record<string,unknown>=>!!item&&typeof item==='object'&&typeof item.id==='string');
 const exact=records.find(item=>item.id===opened);
 const related=records.filter(item=>['installation-hypothesis:','connection-review:','connection-finding:','mounting-interface:'].some(prefix=>String(item.id).startsWith(prefix))&&JSON.stringify(item).includes(owner));
 return <section className="assembly-archive"><h3>历史知识记录</h3><p>此版本保留原研究及来源。当前接口目录使用新装配合同，请通过版本选择器打开新版。</p>
  {opened&&!exact&&<p>该旧目录身份未对应单条原始记录，请选择相关研究。</p>}
  {related.map(item=><button key={String(item.id)} onClick={()=>setOpened(String(item.id))}>{String(item.title||item.label||item.name||item.id)}</button>)}
  {exact&&<details open><summary>{String(exact.title||exact.label||exact.name||exact.id)}</summary><pre>{JSON.stringify(exact,null,2)}</pre></details>}
 </section>;
}
