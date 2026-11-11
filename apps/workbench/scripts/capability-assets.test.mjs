import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {mountCapabilityIndex,readDescriptor,relativeEntry,DKP_SCHEMA} from './dkp.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);

test('mounts every 1.15 capability entry through registered snapshot assets without changing frozen paths',()=>{
 const original={parts:{'part:a':{path:'indexes/parts/a.json',feature_count:100,interface_count:4,candidate_count:12}},compatibility:{index_path:'indexes/compatibility.json'},review_path:'indexes/coverage.json'};
 const before=JSON.stringify(original),entries=new Set(['indexes/parts/a.json','indexes/compatibility.json','indexes/coverage.json']);
 const base='/api/workspaces/device/snapshots/revision/assets/';
 const assetUrl=entry=>{relativeEntry(entry);if(!entries.has(entry))throw new Error('Unregistered package asset');return base+entry.split('/').map(encodeURIComponent).join('/');};
 const mounted=mountCapabilityIndex(original,assetUrl,base);
 assert.equal(JSON.stringify(original),before);assert.equal(mounted.asset_base,base);
 assert.equal(mounted.parts['part:a'].path,base+'indexes/parts/a.json');assert.equal(mounted.parts['part:a'].feature_count,100);
 assert.equal(mounted.compatibility.index_path,base+'indexes/compatibility.json');assert.equal(mounted.review_path,base+'indexes/coverage.json');
 assert.throws(()=>mountCapabilityIndex({...original,review_path:'indexes/not-registered.json'},assetUrl,base),/Unregistered/);
 assert.throws(()=>mountCapabilityIndex({...original,review_path:'../secret.json'},assetUrl,base),/contained/);
 assert.equal(mountCapabilityIndex(undefined,assetUrl,base),undefined);
});

test('accepts the explicit 1.15 descriptor and preserves the additional public entrypoints',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'psop-capability-descriptor-'));
 const unsigned={schema:DKP_SCHEMA,profile:'psop.hardware.source-model/1.15',device:{id:'device',name:'Device'},entrypoints:{scene:'indexes/scene.json',capabilities:'indexes/capabilities.json',compatibility:'indexes/compatibility.json',coverage:'indexes/coverage.json'},files:['indexes/scene.json','indexes/capabilities.json','indexes/compatibility.json','indexes/coverage.json'].map(path=>({path,bytes:2,sha256:hash('{}')}))};
 const manifest={...unsigned,package_digest:hash(canonical(unsigned))};await writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest));
 const descriptor=await readDescriptor(root);assert.equal(descriptor.manifest.profile,unsigned.profile);assert.equal(descriptor.entries.size,4);
 assert.equal(descriptor.manifest.entrypoints.compatibility,'indexes/compatibility.json');
 const unsupported={...unsigned,profile:'psop.hardware.source-model/1.150'};await writeFile(path.join(root,'manifest.json'),JSON.stringify({...unsupported,package_digest:hash(canonical(unsupported))}));
 await assert.rejects(readDescriptor(root),/Unsupported DKP knowledge profile/);
});
