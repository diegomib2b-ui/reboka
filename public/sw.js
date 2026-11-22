// Service worker do Reboka — instalação como app e funcionamento offline básico.
// Network-first em TUDO que é same-origin (sempre a versão nova quando online);
// cache só como reserva offline. Navegações ignoram o cache HTTP (cache:'reload').
// Cross-origin (Supabase/Auth) passa direto, sem interceptar.
const CACHE = 'reboka-v1';
const CORE = ['/app', '/entrar/', '/offline.html', '/favicon.svg', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(CORE.map((u) => c.add(new Request(u, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Supabase e externos: sem interceptar

  e.respondWith((async () => {
    try {
      // Navegação ignora o cache HTTP do navegador; assets buscam rede primeiro.
      const r = await fetch(req.mode === 'navigate' ? new Request(req.url, { cache: 'reload' }) : req);
      if (r && r.status === 200) { const c = await caches.open(CACHE); c.put(req, r.clone()); }
      return r;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') return caches.match('/offline.html');
      return Response.error();
    }
  })());
});
