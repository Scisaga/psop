import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import {sendFile} from './asset-response.mjs';
import {readPackageEntry} from './dkp.mjs';

test('registered gzip JSON API assets decode transparently through fetch.json and still verify compressed bytes',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'psop-gzip-api-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'details/pairs'),{recursive:true});
  const entry='details/pairs/ab.json.gz',value={schema:'psop.compatibility-pair/1',owner_refs:['part-a','part-b'],candidates:[{id:'candidate',name:'几何候选'}]},bytes=gzipSync(Buffer.from(JSON.stringify(value)));
  const filename=path.join(root,...entry.split('/'));await writeFile(filename,bytes);
  const bundle={root,entries:new Map([[entry,{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]])};
  const server=http.createServer(async(request,response)=>{
    try{sendFile(request,response,await readPackageEntry(bundle,entry),entry);}
    catch(error){response.writeHead(422,{'Content-Type':'application/json'});response.end(JSON.stringify({error:error.message}));}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const url=`http://127.0.0.1:${server.address().port}/api/workspaces/device/snapshots/revision/assets/${entry}`;
  const result=await fetch(url);
  assert.equal(result.status,200);assert.match(result.headers.get('content-type'),/application\/json/);assert.equal(result.headers.get('content-encoding'),'gzip');assert.equal(Number(result.headers.get('content-length')),bytes.length);
  assert.deepEqual(await result.json(),value);
  const ranged=await fetch(url,{headers:{Range:'bytes=0-8'}});assert.equal(ranged.status,200);assert.deepEqual(await ranged.json(),value);
  const head=await fetch(url,{method:'HEAD'});assert.equal(head.headers.get('content-encoding'),'gzip');assert.equal(await head.text(),'');
  const modified=Buffer.from(bytes);modified[modified.length-1]^=1;await writeFile(filename,modified);
  const tampered=await fetch(url);assert.equal(tampered.status,422);assert.match((await tampered.json()).error,/has changed/);
});

test('plain source assets keep byte-range behavior',async t=>{
  const server=http.createServer((request,response)=>sendFile(request,response,Buffer.from('0123456789'),'sources/model.stl'));
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const result=await fetch(`http://127.0.0.1:${server.address().port}/asset`,{headers:{Range:'bytes=2-5'}});
  assert.equal(result.status,206);assert.equal(result.headers.get('content-encoding'),null);assert.equal(result.headers.get('content-range'),'bytes 2-5/10');assert.equal(await result.text(),'2345');
});
