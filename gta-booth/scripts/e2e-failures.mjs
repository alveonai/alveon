// Test grešaka. Dva servera:
//   A) --var MOCK_FAIL:1 --var DAILY_LIMIT:3 --var MOCK_DELAY_MS:300          (MODE=fail)
//   B) --var MOCK_FAIL:429 --var TRANSIENT_DELAYS_S:1,1,1 --var MOCK_DELAY_MS:200 (MODE=429)
// BASE=http://127.0.0.1:8788 MODE=fail node scripts/e2e-failures.mjs

const BASE = process.env.BASE || 'http://127.0.0.1:8788';
const PIN = process.env.PIN || '123456';
let passed = 0, failed = 0;
const check = (n, c, x = '') => { c ? (passed++, console.log('  ✔', n)) : (failed++, console.log('  ✘', n, x)); };

async function call(path, { method = 'GET', body, headers = {}, token } = {}) {
  const h = { ...headers };
  if (token) h.authorization = 'Bearer ' + token;
  let payload = body;
  if (body && !(body instanceof Uint8Array)) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path, { method, headers: h, body: payload });
  let data = null; try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}
const jpeg = (n = 3000) => { const b = new Uint8Array(n).fill(7); b[0] = 0xff; b[1] = 0xd8; return b; };

async function pendingSession() {
  const s = (await call('/api/sessions', { method: 'POST', body: { age: true, consent: true } })).data;
  await call(`/api/s/${s.id}/photo`, { method: 'POST', body: jpeg(), headers: { 'content-type': 'image/jpeg' } });
  return s;
}

const token = (await call('/api/admin/login', { method: 'POST', body: { pin: PIN } })).data.token;
const MODE = process.env.MODE || 'fail';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitStatus(id, wanted, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs; let last;
  while (Date.now() < end) { last = await call(`/api/s/${id}`); if (wanted.includes(last.data?.status)) return last; await sleep(300); }
  return last;
}
async function approve(id) {
  const q = await call('/api/admin/queue', { token });
  const key = q.data.pending.find((p) => p.id === id)?.photo_key;
  return call(`/api/admin/s/${id}/approve`, { method: 'POST', token, body: { photo_key: key } });
}

if (MODE === '429') {
  console.log('Google preopterećen (429)');
  const s = await pendingSession();
  await approve(s.id);
  const r = await waitStatus(s.id, ['failed', 'done']);
  check('posle pauza status failed', r.data.status === 'failed', JSON.stringify(r.data));
  check('jasna poruka "preopterećen"', /preopterećen/.test(r.data.error || ''), r.data.error);
  const q = (await call('/api/admin/queue', { token })).data;
  check('429 se ne računa u trošak (brojač 0)', q.stats.used === 0, `used=${q.stats.used}`);
  const row = q.recent.find((x) => x.id === s.id);
  check('429 ne troši pokušaje', row && row.attempts === 0, JSON.stringify(row));
  console.log(`\nRezultat: ${passed} prošlo, ${failed} palo`);
  process.exit(failed ? 1 : 0);
}

console.log('Greška pri generisanju');
const s = await pendingSession();
await approve(s.id);
let r = await waitStatus(s.id, ['failed', 'done']);
check('posle 2 pokušaja status failed', r.data.status === 'failed', JSON.stringify(r.data));
check('poruka greške vidljiva', (r.data.error || '').includes('MOCK_FAIL'));
let q = (await call('/api/admin/queue', { token })).data;
check('potrošena 2 pokušaja (automatski ponovni)', q.stats.used === 2, `used=${q.stats.used}`);

console.log('Ponovi sa tableta + dnevni limit (3)');
r = await call(`/api/admin/s/${s.id}/retry`, { method: 'POST', token });
check('ponovni pokušaj prihvaćen', r.status === 200);
await sleep(500);
r = await waitStatus(s.id, ['failed']);
check('ponovni pokušaj izvršen, opet failed', r.data.status === 'failed');
q = (await call('/api/admin/queue', { token })).data;
check('brojač na 3 (limit)', q.stats.used === 3, `used=${q.stats.used}`);

const s2 = await pendingSession();
await approve(s2.id);
r = await waitStatus(s2.id, ['limit', 'failed', 'done']);
check('preko limita: status limit, ništa se ne troši', r.data.status === 'limit', JSON.stringify(r.data));
q = (await call('/api/admin/queue', { token })).data;
check('brojač ostaje 3', q.stats.used === 3, `used=${q.stats.used}`);


console.log(`\nRezultat: ${passed} prošlo, ${failed} palo`);
process.exit(failed ? 1 : 0);
