#!/usr/bin/env node
/**
 * serwer.mjs — statyczny serwer do testów lokalnych.
 *
 * Gra jest zwykłymi plikami, ale używa modułów ES, a te nie działają spod
 * file:// (przeglądarka blokuje je regułami CORS). Do klikania na własnym
 * telefonie w tej samej sieci: node scripts/serwer.mjs, potem adres z listy.
 *
 * Na GitHub Pages nic z tego nie jest potrzebne — tam pliki serwuje GitHub.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8080;

const TYPY = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const serwer = createServer(async (zadanie, odpowiedz) => {
  const url = new URL(zadanie.url, `http://${zadanie.headers.host}`);
  let sciezka = decodeURIComponent(url.pathname);
  if (sciezka.endsWith('/')) sciezka += 'index.html';

  // Nie wypuszczamy niczego spoza katalogu projektu.
  const plik = path.join(ROOT, sciezka);
  if (!plik.startsWith(ROOT)) {
    odpowiedz.writeHead(403).end('403');
    return;
  }

  try {
    const info = await stat(plik);
    if (info.isDirectory()) throw new Error('katalog');
    const tresc = await readFile(plik);
    odpowiedz.writeHead(200, {
      'Content-Type': TYPY[path.extname(plik).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    odpowiedz.end(tresc);
  } catch {
    odpowiedz.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    odpowiedz.end(`404 — nie ma pliku ${sciezka}`);
  }
});

serwer.listen(PORT, () => {
  console.log(`\nKalendarz muzyczny — serwer testowy\n`);
  console.log(`  laptop:  http://localhost:${PORT}/`);
  for (const [nazwa, adresy] of Object.entries(networkInterfaces())) {
    for (const a of adresy || []) {
      if (a.family === 'IPv4' && !a.internal) {
        console.log(`  telefon: http://${a.address}:${PORT}/   (${nazwa})`);
      }
    }
  }
  console.log('\n  Uwaga: aparat w telefonie działa tylko po HTTPS albo na localhost.');
  console.log('  Do testu skanowania użyj pola „wklej kod ręcznie".\n');
  console.log('  Ctrl+C kończy.\n');
});
