// Local test server: node serve.mjs [port]
// Serves this folder on every network interface so a phone on the same Wi-Fi can open it.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.argv[2]) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(req.url.split(/[?#]/)[0]);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root) || file.slice(root.length).split(sep).some((p) => p.startsWith('.'))) {
      res.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
  console.log(`${res.statusCode} ${req.method} ${req.url}`);
}).listen(port, '0.0.0.0', () => {
  console.log(`\nOn this computer: http://localhost:${port}/`);
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`On your phone:    http://${a.address}:${port}/`);
    }
  }
  console.log('\nPhone and computer must be on the same Wi-Fi. Ctrl+C to stop.\n');
});
