// Local check of the exact committed static files, without requiring a wallet or Next server.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '../../public/bots-playtest');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.mp4': 'video/mp4' };
http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/bots/playtest') {
    response.writeHead(307, { Location: '/bots-playtest/index.html' + (url.search || '?view=practice') }); response.end(); return;
  }
  if (!url.pathname.startsWith('/bots-playtest/')) { response.writeHead(404); response.end(); return; }
  let file;
  try { file = path.resolve(root, decodeURIComponent(url.pathname.slice('/bots-playtest/'.length))); }
  catch { response.writeHead(400); response.end(); return; }
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
  const size = fs.statSync(file).size;
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
  let start = 0, end = size - 1;
  if (range) { start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1; }
  if (start > end || start >= size) { response.writeHead(416, { 'Content-Range': 'bytes */' + size }); response.end(); return; }
  response.writeHead(range ? 206 : 200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
  const stream = fs.createReadStream(file, { start, end });
  stream.on('error', () => response.destroy()); response.on('close', () => stream.destroy()); stream.pipe(response);
}).listen(3160, '127.0.0.1', () => console.log('Packaged playtest: http://127.0.0.1:3160/bots/playtest'));
