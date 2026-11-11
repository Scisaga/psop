import path from 'node:path';

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/vnd.microsoft.icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf', '.stl': 'model/stl', '.xml': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.step': 'application/octet-stream' };

/** bytes are the exact registered representation, checked before this response. */
export function sendFile(request, response, bytes, filename) {
  const gzipJson = filename.toLowerCase().endsWith('.json.gz');
  response.setHeader('Content-Type', gzipJson ? mime['.json'] : mime[path.extname(filename).toLowerCase()] || 'application/octet-stream');
  response.setHeader('Accept-Ranges', gzipJson ? 'none' : 'bytes');
  if (gzipJson) response.setHeader('Content-Encoding', 'gzip');
  // A partial gzip stream cannot be parsed by response.json(). Return the full
  // representation if a client sends a Range header for these JSON assets.
  if (request.headers.range && !gzipJson) {
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
