// ============================================================
// SERVIDOR LOCAL SIMPLES — sem dependências, sem extensões
// ------------------------------------------------------------
// Uso:
//   node server.js
//   node server.js 3000   (para escolher outra porta)
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.argv[2] || 5500;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let filePath = decodeURIComponent(req.url.split('?')[0]);
  if (filePath === '/') filePath = '/index.html';

  const fullPath = path.normalize(path.join(ROOT, filePath));

  // Impede sair da pasta do projeto (segurança básica)
  if (!fullPath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Acesso negado');
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 - Arquivo não encontrado: ' + filePath);
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅ Testly rodando em: http://localhost:${PORT}\n`);
  console.log('Pressione Ctrl+C para parar o servidor.\n');
});
