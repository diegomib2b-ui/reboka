/**
 * Mapa do Reboka: transformar endereço em ponto no mapa e medir a rota entre pontos.
 * Funciona com o Google Maps (segredo GOOGLE_MAPS_KEY) ou com o OpenRouteService (segredo ORS_KEY).
 * A chave fica só aqui no servidor: o navegador nunca a vê. Sem nenhuma chave, as rotas respondem 503
 * e a tela volta a pedir os km digitados, como antes.
 */
export interface EnvMapa { GOOGLE_MAPS_KEY?: string; ORS_KEY?: string }
export type Ponto = { lat: number; lng: number };
export type Endereco = Ponto & { texto: string };
export type Trecho = { km: number; min: number };

const json = (dados: unknown, status = 200) => Response.json(dados, { status, headers: { 'cache-control': 'no-store' } });
export const mapaPronto = (env: EnvMapa) => Boolean(env.GOOGLE_MAPS_KEY || env.ORS_KEY);

const valido = (p: unknown): p is Ponto =>
  !!p && typeof (p as Ponto).lat === 'number' && typeof (p as Ponto).lng === 'number' && Math.abs((p as Ponto).lat) <= 90 && Math.abs((p as Ponto).lng) <= 180;
const arred = (n: number, casas: number) => Math.round(n * 10 ** casas) / 10 ** casas;

/** Guarda a resposta no cache do Cloudflare (grátis), para a mesma busca não gastar a cota do mapa duas vezes. */
async function comCache<T>(chave: string, segundos: number, buscar: () => Promise<T>): Promise<T> {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const req = new Request(`https://cache.reboka.local/${encodeURIComponent(chave)}`);
  if (cache) { const r = await cache.match(req); if (r) return (await r.json()) as T; }
  const dados = await buscar();
  if (cache) await cache.put(req, new Response(JSON.stringify(dados), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${segundos}` } }));
  return dados;
}

// ---------- Google Maps ----------
async function googleEndereco(key: string, q: string, perto?: Ponto): Promise<Endereco[]> {
  const u = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  u.searchParams.set('address', q); u.searchParams.set('region', 'br'); u.searchParams.set('language', 'pt-BR');
  u.searchParams.set('components', 'country:BR'); u.searchParams.set('key', key);
  if (perto) u.searchParams.set('bounds', `${perto.lat - 0.6},${perto.lng - 0.6}|${perto.lat + 0.6},${perto.lng + 0.6}`);
  const r = await fetch(u); const j = (await r.json()) as { status: string; error_message?: string; results?: { formatted_address: string; geometry: { location: Ponto } }[] };
  if (j.status === 'ZERO_RESULTS') return [];
  if (j.status !== 'OK') throw new Error(`O mapa recusou a busca (${j.status}${j.error_message ? `: ${j.error_message}` : ''}).`);
  return (j.results ?? []).slice(0, 5).map((x) => ({ texto: x.formatted_address.replace(/, Brasil$|, Brazil$/, ''), lat: x.geometry.location.lat, lng: x.geometry.location.lng }));
}
async function googleRota(key: string, pts: Ponto[]): Promise<Trecho[]> {
  const ll = (p: Ponto) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    // Só distância e tempo de cada trecho, sem trânsito: é a faixa mais barata (Essentials).
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key, 'x-goog-fieldmask': 'routes.legs.distanceMeters,routes.legs.duration' },
    body: JSON.stringify({ origin: ll(pts[0]), destination: ll(pts[pts.length - 1]), intermediates: pts.slice(1, -1).map(ll), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', languageCode: 'pt-BR' }),
  });
  const j = (await r.json()) as { error?: { message: string }; routes?: { legs: { distanceMeters?: number; duration?: string }[] }[] };
  if (!r.ok) throw new Error(`O mapa recusou a rota: ${j.error?.message ?? r.status}`);
  const legs = j.routes?.[0]?.legs;
  if (!legs?.length) throw new Error('O mapa não achou caminho de carro entre esses pontos.');
  return legs.map((l) => ({ km: arred((l.distanceMeters ?? 0) / 1000, 1), min: Math.round(parseInt(l.duration ?? '0', 10) / 60) }));
}

// ---------- OpenRouteService (OpenStreetMap) ----------
async function orsEndereco(key: string, q: string, perto?: Ponto): Promise<Endereco[]> {
  const u = new URL('https://api.openrouteservice.org/geocode/search');
  u.searchParams.set('api_key', key); u.searchParams.set('text', q); u.searchParams.set('boundary.country', 'BR'); u.searchParams.set('size', '5');
  if (perto) { u.searchParams.set('focus.point.lat', String(perto.lat)); u.searchParams.set('focus.point.lon', String(perto.lng)); }
  const r = await fetch(u); if (!r.ok) throw new Error(`O mapa recusou a busca (${r.status}).`);
  const j = (await r.json()) as { features?: { properties: { label: string }; geometry: { coordinates: [number, number] } }[] };
  return (j.features ?? []).map((f) => ({ texto: f.properties.label.replace(/, Brazil$|, Brasil$/, ''), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }));
}
async function orsRota(key: string, pts: Ponto[]): Promise<Trecho[]> {
  const r = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: key },
    body: JSON.stringify({ coordinates: pts.map((p) => [p.lng, p.lat]) }),
  });
  const j = (await r.json()) as { error?: { message?: string } | string; routes?: { segments: { distance: number; duration: number }[] }[] };
  if (!r.ok) throw new Error(`O mapa recusou a rota: ${typeof j.error === 'string' ? j.error : j.error?.message ?? r.status}`);
  const seg = j.routes?.[0]?.segments;
  if (!seg?.length) throw new Error('O mapa não achou caminho de carro entre esses pontos.');
  return seg.map((s) => ({ km: arred(s.distance / 1000, 1), min: Math.round(s.duration / 60) }));
}

// ---------- Rotas do servidor ----------
/** GET /api/mapa/endereco?q=...&lat=&lng=  → até 5 endereços com o ponto no mapa. lat/lng (opcionais) puxam a busca para perto da base. */
export async function buscarEndereco(env: EnvMapa, url: URL): Promise<Response> {
  if (!mapaPronto(env)) return json({ erro: 'O mapa ainda não foi configurado.', semMapa: true }, 503);
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 160);
  if (q.length < 4) return json({ enderecos: [] });
  const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'));
  const perto = url.searchParams.has('lat') && valido({ lat, lng }) ? { lat: arred(lat, 1), lng: arred(lng, 1) } : undefined;
  const qual = env.GOOGLE_MAPS_KEY ? 'g' : 'o';
  const enderecos = await comCache(`e:${qual}:${q.toLowerCase()}:${perto ? `${perto.lat},${perto.lng}` : ''}`, 60 * 60 * 24 * 30,
    () => (env.GOOGLE_MAPS_KEY ? googleEndereco(env.GOOGLE_MAPS_KEY, q, perto) : orsEndereco(env.ORS_KEY!, q, perto)));
  return json({ enderecos });
}

/** POST /api/mapa/rota { pontos: [{lat,lng}, ...] } (2 a 4 pontos) → km e minutos de cada trecho, na ordem. */
export async function calcularRota(env: EnvMapa, req: Request): Promise<Response> {
  if (!mapaPronto(env)) return json({ erro: 'O mapa ainda não foi configurado.', semMapa: true }, 503);
  const { pontos } = (await req.json().catch(() => ({}))) as { pontos?: unknown[] };
  if (!Array.isArray(pontos) || pontos.length < 2 || pontos.length > 4 || !pontos.every(valido)) return json({ erro: 'Mande de 2 a 4 pontos com lat e lng.' }, 400);
  // 5 casas decimais ≈ 1 metro: a mesma rota pedida de novo sai do cache.
  const pts = (pontos as Ponto[]).map((p) => ({ lat: arred(p.lat, 5), lng: arred(p.lng, 5) }));
  const qual = env.GOOGLE_MAPS_KEY ? 'g' : 'o';
  const trechos = await comCache(`r:${qual}:${pts.map((p) => `${p.lat},${p.lng}`).join(';')}`, 60 * 60 * 24,
    () => (env.GOOGLE_MAPS_KEY ? googleRota(env.GOOGLE_MAPS_KEY, pts) : orsRota(env.ORS_KEY!, pts)));
  return json({ trechos });
}
