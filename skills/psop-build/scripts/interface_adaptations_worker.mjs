import {parentPort,workerData} from 'node:worker_threads';
import {analyzeInterfaceAdaptations} from './interface-adaptation-source.mjs';
if(parentPort){
 try{parentPort.postMessage({result:await analyzeInterfaceAdaptations(workerData)});}catch(error){parentPort.postMessage({error:error.message});}
}else{
 try{const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);process.stdout.write(JSON.stringify(await analyzeInterfaceAdaptations(JSON.parse(Buffer.concat(chunks).toString('utf8'))))+'\n');}catch(error){process.stderr.write(error.stack+'\n');process.exitCode=1;}
}
