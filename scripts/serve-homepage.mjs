/** Buildless local preview, including byte ranges for local recordings. */
import http from 'node:http';
import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../docs/html/',import.meta.url)));
const args=process.argv.slice(2),index=args.indexOf('--port'),port=Number(index>=0?args[index+1]:8796);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon','.webm':'video/webm','.mp4':'video/mp4','.pdf':'application/pdf','.txt':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const info=await stat(file);if(!info.isFile()){res.writeHead(404).end();return;}
    const headers={'content-type':types[path.extname(file)]||'application/octet-stream','accept-ranges':'bytes','cache-control':'no-cache'};
    const range=req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    let start=0,end=info.size-1,status=200;
    if(range){
      start=range[1]?Number(range[1]):Math.max(0,info.size-Number(range[2]));
      end=range[1]&&range[2]?Math.min(Number(range[2]),info.size-1):info.size-1;
      if(start>=info.size||start>end){res.writeHead(416,{'content-range':`bytes */${info.size}`}).end();return;}
      status=206;headers['content-range']=`bytes ${start}-${end}/${info.size}`;
    }
    headers['content-length']=end-start+1;res.writeHead(status,headers);
    if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).pipe(res);
  }catch{res.writeHead(404).end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`PSOP homepage: http://127.0.0.1:${port}/`));
