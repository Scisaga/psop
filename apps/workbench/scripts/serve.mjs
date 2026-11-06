import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { appRoot, defaultRegistry, findSnapshot, readPackageEntry, workspaceCatalog, workspaceView } from './dkp.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const bind = option('--bind', '127.0.0.1');
const port = Number(option('--port', '8780'));
const registryFile = path.resolve(option('--registry', defaultRegistry));
const development = args.includes('--dev');
const directory = path.join(appRoot, 'dist');
if (!net.isIP(bind) || ['0.0.0.0', '::'].includes(bind) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Use a specific local IP and a port in 1..65535.');
if (!development) await stat(path.join(directory, 'index.html')).catch(() => { throw new Error('Run npm run build before starting the workbench.'); });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf', '.stl': 'model/stl', '.xml': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.step': 'application/octet-stream' };

function json(response, status, value, head = false) {
  const bytes = Buffer.from(JSON.stringify(value));
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes.length });
  response.end(head ? undefined : bytes);
}

function sendFile(request, response, bytes, filename) {
  response.setHeader('Content-Type', mime[path.extname(filename).toLowerCase()] || 'application/octet-stream');
  response.setHeader('Accept-Ranges', 'bytes');
  if (request.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    let start = match?.[1] ? Number(match[1]) : 0;
    let end = match?.[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
    if (match && !match[1] && match[2]) { start = Math.max(0, bytes.length - Number(match[2])); end = bytes.length - 1; }
    if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= bytes.length) {
      response.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }); response.end(); return;
    }
    response.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 });
    response.end(request.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1)); return;
  }
  response.writeHead(200, { 'Content-Length': bytes.length });
  response.end(request.method === 'HEAD' ? undefined : bytes);
}

let vite;
const server = http.createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('Cache-Control', 'no-cache');
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/health') { json(response, 200, { app: 'psop-workbench', mode: development ? 'development' : 'local', dkpSchema: 'psop.dkp/2.0-draft.1' }, request.method === 'HEAD'); return; }
    if (pathname === '/api/workspaces') { json(response, 200, await workspaceCatalog(registryFile), request.method === 'HEAD'); return; }
    const snapshot = /^\/api\/workspaces\/([^/]+)\/snapshots\/([^/]+)\/(view|manifest|knowledge|assets\/(.+))$/.exec(pathname);
    if (snapshot) {
      const [, workspaceId, snapshotId, operation, entry] = snapshot;
      if (operation === 'view') { json(response, 200, await workspaceView(workspaceId, snapshotId, registryFile), request.method === 'HEAD'); return; }
      const bundle = await findSnapshot(workspaceId, snapshotId, registryFile);
      if (operation === 'manifest') { json(response, 200, bundle.manifest, request.method === 'HEAD'); return; }
      const filename = operation === 'knowledge' ? bundle.manifest.entrypoints.knowledge : entry;
      sendFile(request, response, await readPackageEntry(bundle, filename), filename); return;
    }
    if (pathname.startsWith('/api/')) { json(response, 404, { error: 'API route not found.' }); return; }
    if (pathname.startsWith('/data/') || pathname.startsWith('/local-assets/')) { json(response, 404, { error: 'Retired prototype data route. Open a registered v2 DKP workspace.' }); return; }
    if (vite) { vite.middlewares(request, response, () => { response.writeHead(404); response.end(); }); return; }
    const candidate = path.resolve(directory, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!candidate.startsWith(directory + path.sep)) { response.writeHead(403); response.end(); return; }
    const resolved = await realpath(candidate);
    if (!resolved.startsWith(directory + path.sep) || !(await stat(resolved)).isFile()) { response.writeHead(404); response.end(); return; }
    sendFile(request, response, await readFile(resolved), resolved);
  } catch (error) { json(response, error.status || (error.code === 'ENOENT' ? 404 : 422), { error: error.message }, request.method === 'HEAD'); }
});
if (development) {
  const { createServer } = await import('vite');
  vite = await createServer({ root: appRoot, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
}
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use.` : error.message); process.exitCode = 1; });
server.listen(port, bind, () => {
  const url = `http://${net.isIP(bind) === 6 ? `[${bind}]` : bind}:${port}/`;
  console.log(`\n  PSOP Workbench\n  ${url}\n  Device workspaces / v2 DKP\n  Press Ctrl+C to stop.\n`);
  if (args.includes('--open') && process.platform === 'win32') spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process -FilePath '${url}'`], { windowsHide: true, stdio: 'ignore' }).unref();
});
