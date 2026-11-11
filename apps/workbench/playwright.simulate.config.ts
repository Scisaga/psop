import {defineConfig} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url)),source=path.resolve(root,'../../workspaces/registry.json'),directory=path.join(root,'.runtime/simulate-e2e'),registryFile=path.join(directory,'registry.json');
const registry=JSON.parse(readFileSync(source,'utf8'));
for(const workspace of registry.workspaces)for(const snapshot of workspace.snapshots)snapshot.path=path.resolve(path.dirname(source),snapshot.path);
mkdirSync(directory,{recursive:true});writeFileSync(registryFile,JSON.stringify(registry));
process.env.PSOP_TEST_REGISTRY=registryFile;
process.env.NO_PROXY=[process.env.NO_PROXY,'127.0.0.1','localhost','::1'].filter(Boolean).join(',');
// Verify the delivered bundle: development dependency reloads must not interrupt assembly gestures.
export default defineConfig({testDir:'./tests',testMatch:['simulate.spec.ts','workbench.spec.ts','loading.spec.ts','compatibility-preview.spec.ts','rendering.spec.ts'],timeout:90000,workers:1,reporter:'list',outputDir:'.runtime/simulate-e2e/results',use:{baseURL:'http://127.0.0.1:8792',channel:'chrome',headless:true,viewport:{width:1600,height:1000},actionTimeout:15000,screenshot:'only-on-failure',trace:'retain-on-failure'},webServer:{command:`"${process.execPath}" scripts/serve.mjs --port 8792 --registry "${registryFile}"`,url:'http://127.0.0.1:8792/health',reuseExistingServer:false,timeout:30000}});
