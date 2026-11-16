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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitStatus(id, wanted, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    last = await call(`/api/s/${id}`);
    if (last.status !== 200 || wanted.includes(last.data.status)) return last;
    await sleep(300);
  }
  return last;
}

async function keyOf(id, token) {
  const q = await call('/api/admin/queue', { token });
  return q.data.pending.find((p) => p.id === id)?.photo_key;
}

async function decide(action, id, token, key) {
  return call(`/api/admin/s/${id}/${action}`, { method: 'POST', token, body: { photo_key: key ?? (await keyOf(id, token)) } });
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
check('nema rute za generisanje sa telefona (404/405)', r.status === 404 || r.status === 405);
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
check('kućica za mreže isključena: pristanak se ne beleži', inQueue && inQueue.consent_social === 0);
check('tablet dobija verziju fotografije (photo_key)', inQueue && /^photos\//.test(inQueue.photo_key || ''));
const usedBefore = r.data.stats.used;

const ph = await call(`/api/admin/s/${s1.id}/photo?key=${encodeURIComponent(inQueue.photo_key)}`, { token, raw: true });
check('tablet vidi fotografiju', ph.status === 200 && (await ph.arrayBuffer()).byteLength === photo1.length);

// --- odobravanje i generisanje ---
console.log('Odobravanje i generisanje');
r = await call(`/api/admin/s/${s1.id}/approve`, { method: 'POST', token, body: {} });
check('odobravanje bez photo_key odbijeno (400)', r.status === 400);
const t0 = Date.now();
r = await decide('approve', s1.id, token, inQueue.photo_key);
check('odobravanje odmah vraća odgovor (red)', r.status === 200 && r.data.status === 'approved' && Date.now() - t0 < 2000, JSON.stringify(r));
r = await decide('approve', s1.id, token, inQueue.photo_key);
check('dvostruko odobravanje odbijeno (409)', r.status === 409);
r = await waitStatus(s1.id, ['done', 'failed']);
check('generisano preko reda', r.data.status === 'done', JSON.stringify(r.data));
console.log(`    (trajalo ${((Date.now() - t0) / 1000).toFixed(1)} s)`);

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

// --- odbijanje ---
console.log('Odbijanje');
const s2 = await newSession();
await upload(s2.id, fakeJpeg(3000, 3));
r = await decide('reject', s2.id, token);
check('odbijeno', r.status === 200);
r = await call(`/api/s/${s2.id}`);
check('gost vidi rejected', r.data.status === 'rejected');
const ph2 = await call(`/api/admin/s/${s2.id}/photo`, { token, raw: true });
check('odbijena fotografija obrisana', ph2.status === 409 || ph2.status === 404);
r = await upload(s2.id, fakeJpeg(3000, 4));
check('posle odbijanja može nova fotografija', r.data.status === 'pending');
await decide('approve', s2.id, token);
r = await waitStatus(s2.id, ['done', 'failed']);
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

// --- trka: zamena fotografije u trenutku odobravanja (recenzija, stavka 1) ---
console.log('Zamena fotografije dok osoblje gleda');
const keyA = await keyOf(s3.id, token);
await upload(s3.id, fakeJpeg(3300, 9)); // gost šalje B posle nego što je tablet video A
const keyB = await keyOf(s3.id, token);
check('nova fotografija ima novu verziju', keyA && keyB && keyA !== keyB);
r = await decide('approve', s3.id, token, keyA);
check('odobravanje stare verzije odbijeno (409)', r.status === 409 && /promenjena/.test(r.data.error), JSON.stringify(r));
r = await decide('reject', s3.id, token, keyA);
check('odbijanje stare verzije odbijeno (409)', r.status === 409);
r = await call(`/api/admin/s/${s3.id}/photo?key=${encodeURIComponent(keyA)}`, { token });
check('tablet ne može da učita staru verziju (409)', r.status === 409);
r = await call(`/api/s/${s3.id}`);
check('sesija i dalje čeka', r.data.status === 'pending');

// --- trka: brisanje tokom generisanja (recenzija, stavka 2) ---
console.log('Brisanje tokom generisanja');
await decide('approve', s4.id, token);
await waitStatus(s4.id, ['generating', 'done']);
r = await call(`/api/s/${s4.id}`, { method: 'DELETE' });
check('gost briše dok traje generisanje', r.data.status === 'deleted');
await sleep(6000); // demo generisanje traje 4 s
r = await call(`/api/s/${s4.id}`);
check('posle završetka AI-ja sesija ostaje obrisana', r.status === 404, JSON.stringify(r));
r = await call(`/api/s/${s4.id}/result`);
check('rezultat nije upisan posle brisanja', r.status === 404);
console.log('    R2_CHECK_DELETED=' + s4.id);

// --- format izlazne slike = format ulazne ---
console.log('Format slike');
const s5 = await newSession();
await call(`/api/s/${s5.id}/photo`, { method: 'POST', body: fakeJpeg(3000, 11), headers: { 'content-type': 'image/jpeg', 'x-photo-size': '1080x1920' } });
let q5 = await call('/api/admin/queue', { token });
check('uspravna 1080x1920 → 9:16', q5.data.pending.find((p) => p.id === s5.id)?.photo_aspect === '9:16');
await call(`/api/s/${s5.id}/photo`, { method: 'POST', body: fakeJpeg(3000, 12), headers: { 'content-type': 'image/jpeg', 'x-photo-size': '1600x1200' } });
q5 = await call('/api/admin/queue', { token });
check('položena 1600x1200 → 4:3', q5.data.pending.find((p) => p.id === s5.id)?.photo_aspect === '4:3');
await call(`/api/s/${s5.id}/photo`, { method: 'POST', body: fakeJpeg(3000, 13), headers: { 'content-type': 'image/jpeg', 'x-photo-size': 'abc' } });
q5 = await call('/api/admin/queue', { token });
check('neispravna dimenzija se ignoriše (podrazumevani format)', q5.data.pending.find((p) => p.id === s5.id)?.photo_aspect === null);
await decide('reject', s5.id, token);

// --- scene (izbor scene od 17. 11. 2026) ---
console.log('Scene');
r = await call('/api/scenes');
const sceneList = r.data?.scenes || [];
check('lista scena: 14 scena, bez izbačene 02', r.status === 200 && sceneList.length === 14 && !sceneList.some((sc) => sc.id === '02'), JSON.stringify(r.data).slice(0, 200));
check('lista scena ne otkriva promptove', sceneList.every((sc) => !('prompt' in sc)));
check('svaka scena ima sličicu /scene/<id>.jpg', sceneList.every((sc) => sc.image === `/scene/${sc.id}.jpg`));
check('scena 05 je položena 16:9, scena 03 uspravna 3:4',
  sceneList.find((sc) => sc.id === '05')?.aspect === '16:9' && sceneList.find((sc) => sc.id === '03')?.aspect === '3:4');
const s6 = await newSession();
r = await call(`/api/s/${s6.id}/photo`, { method: 'POST', body: fakeJpeg(3000, 21), headers: { 'content-type': 'image/jpeg', 'x-scene': '99' } });
check('nepostojeća scena odbijena (400)', r.status === 400);
r = await call(`/api/s/${s6.id}/photo`, { method: 'POST', body: fakeJpeg(3000, 22), headers: { 'content-type': 'image/jpeg', 'x-scene': '05', 'x-photo-size': '1200x1600' } });
check('fotografija sa scenom prihvaćena', r.status === 200 && r.data.status === 'pending' && r.data.scene === '05', JSON.stringify(r.data));
let q6 = await call('/api/admin/queue', { token });
let p6 = q6.data.pending.find((p) => p.id === s6.id);
check('tablet vidi scenu, naziv i format', p6?.scene === '05' && /klubu/.test(p6?.scene_title || '') && p6?.scene_aspect === '16:9', JSON.stringify(p6));
r = await call(`/api/s/${s6.id}/photo`, { method: 'POST', body: fakeJpeg(3000, 23), headers: { 'content-type': 'image/jpeg', 'x-scene': '14' } });
q6 = await call('/api/admin/queue', { token });
p6 = q6.data.pending.find((p) => p.id === s6.id);
check('promena scene stiže sa novom fotografijom', p6?.scene === '14' && r.data.scene === '14');
await decide('approve', s6.id, token);
r = await waitStatus(s6.id, ['done', 'failed']);
check('scena generisana', r.data.status === 'done' && r.data.scene === '14');
q6 = await call('/api/admin/queue', { token });
check('scena vidljiva i u listi "gotovo"', q6.data.recent.some((x) => x.id === s6.id && x.scene === '14' && x.scene_title));
console.log('    SCENE_CHECK_LOG: u logu servera treba "mock generate aspect=3:4 prompt=Use the person"');

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
await decide('reject', s3.id, token);

console.log(`\nRezultat: ${passed} prošlo, ${failed} palo`);
process.exit(failed ? 1 : 0);
