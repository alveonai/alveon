// End-to-end test API toka (radi protiv `wrangler dev`, demo režim).
// Pokretanje: BASE=http://127.0.0.1:8787 PIN=123456 node scripts/e2e.mjs

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const PIN = process.env.PIN || '123456';

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log('  ✔', name); }
  else { failed++; console.log('  ✘', name, extra); }
}

async function call(path, { method = 'GET', body, headers = {}, token, raw = false } = {}) {
  const h = { ...headers };
  if (token) h.authorization = 'Bearer ' + token;
  let payload = body;
  if (body && !(body instanceof Uint8Array)) {
    h['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers: h, body: payload });
  if (raw) return res;
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

function fakeJpeg(size = 4000, seed = 1) {
  const b = new Uint8Array(size);
  for (let i = 0; i < size; i++) b[i] = (i * 31 + seed) & 0xff;
  b[0] = 0xff; b[1] = 0xd8; b[size - 2] = 0xff; b[size - 1] = 0xd9;
  return b;
}

async function upload(id, bytes, type = 'image/jpeg') {
  return call(`/api/s/${id}/photo`, { method: 'POST', body: bytes, headers: { 'content-type': type } });
}

async function newSession(extra = {}) {
  const r = await call('/api/sessions', { method: 'POST', body: { age: true, consent: true, ...extra } });
  return r.data;
}

console.log('E2E protiv', BASE);

// --- pristanak ---
console.log('Pristanak');
let r = await call('/api/sessions', { method: 'POST', body: { consent: true } });
check('bez potvrde 18+ odbijeno (400)', r.status === 400);
r = await call('/api/sessions', { method: 'POST', body: { age: true } });
check('bez pristanka odbijeno (400)', r.status === 400);
const s1 = await newSession({ social: true });
check('sesija napravljena', s1 && s1.id && /^[A-Z0-9]{3}$/.test(s1.code), JSON.stringify(s1));

// --- upload ---
console.log('Upload');
r = await upload(s1.id, fakeJpeg(), 'image/png');
check('pogrešan tip odbijen (415)', r.status === 415);
const notJpeg = fakeJpeg(); notJpeg[0] = 0;
r = await upload(s1.id, notJpeg);
check('ne-JPEG sadržaj odbijen (415)', r.status === 415);
const photo1 = fakeJpeg(5000, 7);
r = await upload(s1.id, photo1);
check('upload prihvaćen, status pending', r.status === 200 && r.data.status === 'pending', JSON.stringify(r));
check('pozicija u redu 1', r.data.queuePosition === 1);
check('demo režim prijavljen', r.data.demo === true);

r = await call(`/api/s/${s1.id}/generate`, { method: 'POST' });
check('gost ne može da generiše pre odobrenja', r.data.status === 'pending');
r = await call(`/api/s/${s1.id}/result`);
check('rezultat nije dostupan pre generisanja (404)', r.status === 404);

// --- admin ---
console.log('Tablet');
r = await call('/api/admin/queue');
check('bez prijave odbijeno (401)', r.status === 401);
r = await call('/api/admin/login', { method: 'POST', body: { pin: '000000' } });
check('pogrešan PIN odbijen (401)', r.status === 401);
r = await call('/api/admin/login', { method: 'POST', body: { pin: PIN } });
check('prijava uspela', r.status === 200 && r.data.token);
const token = r.data.token;
r = await call('/api/admin/queue', { token: 'x'.repeat(64) });
check('lažni token odbijen (401)', r.status === 401);

r = await call('/api/admin/queue', { token });
const inQueue = r.data.pending.find((p) => p.id === s1.id);
check('zahtev vidljiv na tabletu', Boolean(inQueue));
check('kod se poklapa', inQueue && inQueue.code === s1.code);
check('vidljiv pristanak za mreže', inQueue && inQueue.consent_social === 1);
const usedBefore = r.data.stats.used;

const ph = await call(`/api/admin/s/${s1.id}/photo`, { token, raw: true });
check('tablet vidi fotografiju', ph.status === 200 && (await ph.arrayBuffer()).byteLength === photo1.length);

// --- odobravanje i generisanje ---
console.log('Odobravanje i generisanje');
const t0 = Date.now();
r = await call(`/api/admin/s/${s1.id}/approve`, { method: 'POST', token });
check('odobreno i generisano', r.status === 200 && r.data.status === 'done', JSON.stringify(r));
console.log(`    (trajalo ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
r = await call(`/api/admin/s/${s1.id}/approve`, { method: 'POST', token });
check('dvostruko odobravanje odbijeno (409)', r.status === 409);

r = await call(`/api/s/${s1.id}`);
check('gost vidi status done', r.data.status === 'done' && r.data.hasResult === true);
const res = await call(`/api/s/${s1.id}/result`, { raw: true });
const resBytes = new Uint8Array(await res.arrayBuffer());
check('gost preuzima rezultat', res.status === 200 && resBytes.length === photo1.length);
check('rezultat ima content-disposition', (res.headers.get('content-disposition') || '').includes(s1.code));

r = await call('/api/admin/queue', { token });
check('brojač generacija +1', r.data.stats.used === usedBefore + 1, `${usedBefore} -> ${r.data.stats.used}`);
check('procena troška računata', r.data.stats.costUsd >= 0.05);
check('gotov zahtev u listi "gotovo"', r.data.recent.some((x) => x.id === s1.id && x.status === 'done'));
check('gotov zahtev nije više na čekanju', !r.data.pending.some((x) => x.id === s1.id));

r = await upload(s1.id, fakeJpeg());
check('nema ponovnog upload-a posle generisanja (409)', r.status === 409);
r = await call(`/api/s/${s1.id}/generate`, { method: 'POST' });
check('nema ponovnog generisanja posle gotovog', r.data.status === 'done');

// --- odbijanje ---
console.log('Odbijanje');
const s2 = await newSession();
await upload(s2.id, fakeJpeg(3000, 3));
r = await call(`/api/admin/s/${s2.id}/reject`, { method: 'POST', token });
check('odbijeno', r.status === 200);
r = await call(`/api/s/${s2.id}`);
check('gost vidi rejected', r.data.status === 'rejected');
const ph2 = await call(`/api/admin/s/${s2.id}/photo`, { token, raw: true });
check('odbijena fotografija obrisana', ph2.status === 404);
r = await upload(s2.id, fakeJpeg(3000, 4));
check('posle odbijanja može nova fotografija', r.data.status === 'pending');
r = await call(`/api/admin/s/${s2.id}/approve`, { method: 'POST', token });
check('druga fotografija odobrena i generisana', r.data.status === 'done');

// --- red ---
console.log('Red čekanja');
const s3 = await newSession();
const s4 = await newSession();
await upload(s3.id, fakeJpeg(3000, 5));
r = await upload(s4.id, fakeJpeg(3000, 6));
check('drugi u redu vidi poziciju 2', r.data.queuePosition === 2, JSON.stringify(r.data));
r = await upload(s3.id, fakeJpeg(3100, 8));
check('promena fotografije dok čeka je dozvoljena', r.data.status === 'pending');

// --- pauza ---
console.log('Pauza');
r = await call('/api/admin/pause', { method: 'POST', token, body: { paused: true } });
check('pauzirano', r.data.paused === true);
r = await call('/api/sessions', { method: 'POST', body: { age: true, consent: true } });
check('nova sesija odbijena tokom pauze (503)', r.status === 503 && r.data.paused);
r = await call('/api/config');
check('config prijavljuje pauzu', r.data.paused === true);
await call('/api/admin/pause', { method: 'POST', token, body: { paused: false } });
r = await call('/api/config');
check('pauza isključena', r.data.paused === false);

// --- brisanje na zahtev gosta ---
console.log('Brisanje na zahtev gosta');
r = await call(`/api/s/${s1.id}`, { method: 'DELETE' });
check('gost briše podatke', r.data.status === 'deleted');
r = await call(`/api/s/${s1.id}`);
check('posle brisanja sesija ne postoji (404)', r.status === 404);
const gone = await call(`/api/admin/s/${s1.id}/result`, { token, raw: true });
check('rezultat obrisan iz skladišta', gone.status === 404);

// --- nevažeći ID ---
r = await call('/api/s/../../etc');
check('nevažeći ID ne prolazi', r.status === 404);

// --- čišćenje reda za ponovljeno pokretanje ---
await call(`/api/admin/s/${s3.id}/reject`, { method: 'POST', token });
await call(`/api/admin/s/${s4.id}/reject`, { method: 'POST', token });

console.log(`\nRezultat: ${passed} prošlo, ${failed} palo`);
process.exit(failed ? 1 : 0);
