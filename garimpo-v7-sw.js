/* GarimpoApp (TESTE) — Service Worker (modo offline)
   Coloque este arquivo na MESMA pasta do HTML do app (ex.: repositório garimpoapp).
   Para forçar atualização do cache em todos os aparelhos, mude o número em VERSAO. */
const VERSAO = 'gv7-v5.51-1';
const CACHE  = VERSAO;
const PRECACHE = ['./garimpo-v7-manifest.json', './garimpo-icon-192.png', './garimpo-icon-512.png']; // ícones feitos da imagem original do app
const ESPERA_REDE_MS = 5000; // rede ruim no garimpo: após 5s usa a cópia salva

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // add() individual: se um arquivo não existir, os outros continuam
    await Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(n => (n.startsWith('gtest-') || n.startsWith('gv2-') || n.startsWith('gv3-') || n.startsWith('gv4-') || n.startsWith('gv5-') || n.startsWith('gv6-') || n.startsWith('gv7-')) && n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// A página pede para guardar a si mesma (na 1ª visita o SW ainda não controla a página)
self.addEventListener('message', e => {
  if (!e.data || e.data.tipo !== 'cachear' || !e.data.url) return;
  e.waitUntil((async () => {
    try {
      const u = new URL(e.data.url);
      if (u.origin !== self.location.origin) return;
      const r = await fetch(u.origin + u.pathname, { cache: 'reload' });
      if (r && r.ok) (await caches.open(CACHE)).put(u.origin + u.pathname, r);
    } catch (_) {}
  })());
});

const comTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function paginaDoCache(c, url) {
  const base = url.origin + url.pathname;
  const dir  = base.endsWith('/') ? base : base.replace(/[^/]*$/, '');
  return (await c.match(base)) || (await c.match(dir)) || (await c.match(dir + 'index.html')) || null;
}

async function navegacao(req) {
  const url = new URL(req.url);
  const c = await caches.open(CACHE);
  const chave = url.origin + url.pathname; // ignora ?utm_source=... do Instagram
  const guardada = await paginaDoCache(c, url);
  // 'no-cache' = sempre confere com o servidor (ETag), assim a versão nova aparece na abertura seguinte, sem esperar o cache do navegador
  const buscar = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(r => { if (r && r.ok) c.put(chave, r.clone()); return r; });
  try {
    return guardada ? await comTimeout(buscar, ESPERA_REDE_MS) : await buscar;
  } catch (_) {
    if (guardada) return guardada;
    return new Response('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;background:#2A2520;color:#F5F0E8;padding:24px"><h2>⛏️ GarimpoApp</h2><p>Sem internet e ainda sem cópia salva. Abra o app uma vez com internet para ele funcionar offline.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function estatico(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  const rede = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await rede) || new Response('', { status: 504 });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Cotações, clima, diesel e proxies (outros domínios): SEMPRE rede, nunca cache do SW.
  // O app já guarda o último valor no aparelho e marca como "referência" quando offline.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/via-brasil.json') || url.pathname.endsWith('/cotacoes.json')) return;
  if (req.mode === 'navigate' || req.destination === 'document') e.respondWith(navegacao(req));
  else e.respondWith(estatico(req));
});
