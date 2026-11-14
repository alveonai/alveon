// Test grešaka: pokrenuti wrangler dev sa
//   --var MOCK_FAIL:1 --var DAILY_LIMIT:3 --var MOCK_DELAY_MS:300
// BASE=http://127.0.0.1:8788 node scripts/e2e-failures.mjs

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

console.log('Greška pri generisanju');
const s = await pendingSession();
let r = await call(`/api/admin/s/${s.id}/approve`, { method: 'POST', token });
check('posle 2 pokušaja status failed', r.data.status === 'failed', JSON.stringify(r.data));
check('poruka greške vidljiva', (r.data.error || '').includes('MOCK_FAIL'));
r = await call(`/api/s/${s.id}`);
check('gost vidi failed', r.data.status === 'failed');
let q = (await call('/api/admin/queue', { token })).data;
check('potrošena 2 pokušaja (automatski ponovni)', q.stats.used === 2, `used=${q.stats.used}`);

console.log('Ponovi sa tableta + dnevni limit (3)');
r = await call(`/api/admin/s/${s.id}/retry`, { method: 'POST', token });
check('ponovni pokušaj izvršen, opet failed', r.data.status === 'failed');
q = (await call('/api/admin/queue', { token })).data;
check('brojač na 3 (limit)', q.stats.used === 3, `used=${q.stats.used}`);

const s2 = await pendingSession();
r = await call(`/api/admin/s/${s2.id}/approve`, { method: 'POST', token });
check('preko limita: status limit, ništa se ne troši', r.data.status === 'limit', JSON.stringify(r.data));
q = (await call('/api/admin/queue', { token })).data;
check('brojač ostaje 3', q.stats.used === 3, `used=${q.stats.used}`);
r = await call(`/api/s/${s2.id}`);
check('gost vidi limit', r.data.status === 'limit');

console.log(`\nRezultat: ${passed} prošlo, ${failed} palo`);
process.exit(failed ? 1 : 0);
