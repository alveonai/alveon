import { generateStylized, ProviderError } from './provider.js';

// ---------- pomoćne funkcije ----------

const CODE_ALPHABET = 'ACDEFHJKMNPRTUVWXY34679'; // bez sličnih znakova (0/O, 1/I...)
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const GENERATION_STALE_MS = 150_000; // ako "generating" visi duže, može ponovo

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

const err = (status, message, extra = {}) => json({ error: message, ...extra }, status);

const now = () => Date.now();
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

function randomId(bytes = 18) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomCode(len = 3) {
  const a = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(a, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function belgradeDay(ts = now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Belgrade', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(ts));
}

const isValidId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{20,40}$/.test(id);

async function getSetting(env, key, fallback = null) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row ? row.value : fallback;
}

async function setSetting(env, key, value) {
  await env.DB.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).bind(key, String(value)).run();
}

const isPaused = async (env) => (await getSetting(env, 'paused', '0')) === '1';

async function getSession(env, id) {
  if (!isValidId(id)) return null;
  return env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first();
}

async function deleteObjects(env, ...keys) {
  const list = keys.filter(Boolean);
  if (list.length) await env.PHOTOS.delete(list);
}

// ---------- admin autentikacija ----------

async function adminToken(env) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.ADMIN_PIN), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('gta-booth-admin-v1'));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  return crypto.subtle.timingSafeEqual(ea, eb);
}

async function isAdmin(request, env) {
  if (!env.ADMIN_PIN) return false;
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  return safeEqual(token, await adminToken(env));
}

async function tooManyLogins(env) {
  const minute = Math.floor(now() / 60_000);
  await env.DB.prepare(
    'INSERT INTO login_attempts (minute, n) VALUES (?, 1) ON CONFLICT(minute) DO UPDATE SET n = n + 1',
  ).bind(minute).run();
  const row = await env.DB.prepare('SELECT n FROM login_attempts WHERE minute = ?').bind(minute).first();
  return (row?.n || 0) > 10;
}

// ---------- javni prikaz statusa ----------

async function publicStatus(env, s) {
  const out = {
    status: s.status,
    code: s.code,
    hasResult: Boolean(s.result_key) && s.status === 'done',
    demo: (env.PROVIDER || 'mock') !== 'gemini',
  };
  if (s.status === 'pending') {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM sessions WHERE status = 'pending' AND submitted_at < ?",
    ).bind(s.submitted_at || 0).first();
    out.queuePosition = (row?.n || 0) + 1;
  }
  if (s.status === 'failed' || s.status === 'limit') out.error = s.error;
  return out;
}

async function expireIfStale(env, s) {
  const ttl = num(env.PENDING_TTL_MIN, 15) * 60_000;
  if (s.status === 'pending' && s.submitted_at && now() - s.submitted_at > ttl) {
    await deleteObjects(env, s.photo_key);
    await env.DB.prepare(
      "UPDATE sessions SET status = 'expired', photo_key = NULL, updated_at = ? WHERE id = ? AND status = 'pending'",
    ).bind(now(), s.id).run();
    return { ...s, status: 'expired', photo_key: null };
  }
  return s;
}

// ---------- generisanje ----------

// Pokreće generisanje sa automatskim ponovnim pokušajem. Glavni pokretač je tablet
// (odmah posle odobrenja); telefon gosta je rezerva (minApprovedAgeMs > 0).
async function generateWithRetries(env, id, { minApprovedAgeMs = 0 } = {}) {
  let s = await runGeneration(env, id, { minApprovedAgeMs });
  for (let i = 0; i < 3 && s?.status === 'approved'; i++) {
    s = await runGeneration(env, id);
  }
  return s;
}

async function runGeneration(env, id, { minApprovedAgeMs = 0 } = {}) {
  const t = now();
  // Atomično preuzimanje posla: samo jedan zahtev može da generiše.
  const claim = await env.DB.prepare(
    `UPDATE sessions SET status = 'generating', started_at = ?, attempts = attempts + 1, updated_at = ?, error = NULL
     WHERE id = ? AND attempts < max_attempts AND photo_key IS NOT NULL
       AND ((status = 'approved' AND updated_at <= ?) OR (status = 'generating' AND started_at < ?))`,
  ).bind(t, t, id, t - minApprovedAgeMs, t - GENERATION_STALE_MS).run();
  if (!claim.meta.changes) return getSession(env, id);

  // Dnevni limit (atomično).
  const day = belgradeDay(t);
  await env.DB.prepare('INSERT OR IGNORE INTO usage (day, n) VALUES (?, 0)').bind(day).run();
  const used = await env.DB.prepare('UPDATE usage SET n = n + 1 WHERE day = ? AND n < ?')
    .bind(day, num(env.DAILY_LIMIT, 360)).run();
  if (!used.meta.changes) {
    await env.DB.prepare(
      "UPDATE sessions SET status = 'limit', error = 'Dostignut dnevni limit', updated_at = ? WHERE id = ?",
    ).bind(now(), id).run();
    return getSession(env, id);
  }

  const s = await getSession(env, id);
  try {
    const obj = await env.PHOTOS.get(s.photo_key);
    if (!obj) throw new ProviderError('Originalna slika ne postoji', { retryable: false });
    const photo = new Uint8Array(await obj.arrayBuffer());
    const result = await generateStylized(env, photo, obj.httpMetadata?.contentType || 'image/jpeg');
    const resultKey = `results/${id}`;
    await env.PHOTOS.put(resultKey, result.bytes, { httpMetadata: { contentType: result.mime } });
    await env.DB.prepare(
      "UPDATE sessions SET status = 'done', result_key = ?, result_mime = ?, error = NULL, updated_at = ? WHERE id = ?",
    ).bind(resultKey, result.mime, now(), id).run();
  } catch (e) {
    const message = String(e?.message || e).slice(0, 300);
    const retryable = e instanceof ProviderError ? e.retryable : true;
    const fresh = await getSession(env, id);
    const canRetry = retryable && fresh.attempts < fresh.max_attempts;
    await env.DB.prepare('UPDATE sessions SET status = ?, error = ?, updated_at = ? WHERE id = ?')
      .bind(canRetry ? 'approved' : 'failed', message, now(), id).run();
    console.error('generation failed', id, message);
  }
  return getSession(env, id);
}

// ---------- rute za goste ----------

async function handleGuest(request, env, path, ctx) {
  const method = request.method;

  if (path === '/api/config' && method === 'GET') {
    return json({
      controller: env.CONTROLLER_NAME,
      contactEmail: env.CONTACT_EMAIL,
      retentionDays: num(env.RETENTION_DAYS, 7),
      originalTtlMin: num(env.ORIGINAL_TTL_MIN, 60),
      pendingTtlMin: num(env.PENDING_TTL_MIN, 15),
      demo: (env.PROVIDER || 'mock') !== 'gemini',
      paused: await isPaused(env),
    });
  }

  if (path === '/api/sessions' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (body.age !== true) return err(400, 'Potrebno je potvrditi da imate 18 ili više godina.');
    if (body.consent !== true) return err(400, 'Potreban je pristanak na obradu fotografije.');
    if (await isPaused(env)) return err(503, 'Štand je trenutno pauziran.', { paused: true });
    const id = randomId();
    const code = randomCode();
    const t = now();
    await env.DB.prepare(
      `INSERT INTO sessions (id, code, status, created_at, updated_at, consent_at, consent_social, age_confirmed, max_attempts)
       VALUES (?, ?, 'created', ?, ?, ?, ?, 1, ?)`,
    ).bind(id, code, t, t, t, body.social === true ? 1 : 0, num(env.MAX_ATTEMPTS, 2)).run();
    return json({ id, code });
  }

  const m = path.match(/^\/api\/s\/([^/]+)(\/[a-z]+)?$/);
  if (!m) return err(404, 'Nepoznata ruta');
  const id = m[1];
  const action = m[2] || '';
  let s = await getSession(env, id);
  if (!s || s.status === 'deleted') return err(404, 'Sesija ne postoji ili je obrisana.');

  if (action === '' && method === 'GET') {
    s = await expireIfStale(env, s);
    return json(await publicStatus(env, s));
  }

  if (action === '/photo' && method === 'POST') {
    if (!['created', 'pending', 'rejected', 'expired'].includes(s.status)) {
      return err(409, 'Slika je već odobrena i ne može se menjati.');
    }
    if (await isPaused(env)) return err(503, 'Štand je trenutno pauziran.', { paused: true });
    const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE status = 'pending'").first();
    if (s.status !== 'pending' && (pending?.n || 0) >= num(env.MAX_PENDING, 40)) {
      return err(503, 'Red je trenutno pun. Pokušajte ponovo za nekoliko minuta.');
    }
    const type = (request.headers.get('content-type') || '').split(';')[0].trim();
    if (type !== 'image/jpeg') return err(415, 'Slika mora biti JPEG.');
    const buf = new Uint8Array(await request.arrayBuffer());
    if (buf.length < 1000 || buf.length > MAX_UPLOAD_BYTES) return err(413, 'Slika je prevelika ili oštećena.');
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return err(415, 'Neispravan JPEG.');
    const key = `photos/${id}`;
    await env.PHOTOS.put(key, buf, { httpMetadata: { contentType: 'image/jpeg' } });
    const t = now();
    await env.DB.prepare(
      "UPDATE sessions SET status = 'pending', photo_key = ?, submitted_at = ?, error = NULL, updated_at = ? WHERE id = ?",
    ).bind(key, t, t, id).run();
    return json(await publicStatus(env, await getSession(env, id)));
  }

  if (action === '/generate' && method === 'POST') {
    if (s.status !== 'approved' && s.status !== 'generating') return json(await publicStatus(env, s));
    // Rezerva: telefon pokreće samo ako tablet nije preuzeo posao u roku od 20 s.
    const done = await generateWithRetries(env, id, { minApprovedAgeMs: 20_000 });
    return json(await publicStatus(env, done));
  }

  if (action === '/result' && method === 'GET') {
    if (s.status !== 'done' || !s.result_key) return err(404, 'Slika još nije spremna.');
    const obj = await env.PHOTOS.get(s.result_key);
    if (!obj) return err(404, 'Slika je istekla.');
    const ext = (s.result_mime || '').includes('png') ? 'png' : 'jpg';
    return new Response(obj.body, {
      headers: {
        'content-type': s.result_mime || 'image/png',
        'cache-control': 'private, max-age=3600',
        'content-disposition': `inline; filename="gta-portret-${s.code}.${ext}"`,
      },
    });
  }

  if (action === '' && method === 'DELETE') {
    // Gost povlači pristanak: brišemo sve odmah.
    await deleteObjects(env, s.photo_key, s.result_key);
    await env.DB.prepare(
      "UPDATE sessions SET status = 'deleted', photo_key = NULL, result_key = NULL, updated_at = ? WHERE id = ?",
    ).bind(now(), id).run();
    return json({ status: 'deleted' });
  }

  return err(405, 'Metod nije dozvoljen');
}

// ---------- rute za tablet ----------

async function handleAdmin(request, env, path) {
  const method = request.method;

  if (path === '/api/admin/login' && method === 'POST') {
    if (!env.ADMIN_PIN) return err(500, 'ADMIN_PIN nije podešen na serveru.');
    if (await tooManyLogins(env)) return err(429, 'Previše pokušaja. Sačekajte minut.');
    const body = await request.json().catch(() => ({}));
    if (!safeEqual(String(body.pin || ''), env.ADMIN_PIN)) return err(401, 'Pogrešan PIN.');
    return json({ token: await adminToken(env) });
  }

  if (!(await isAdmin(request, env))) return err(401, 'Niste prijavljeni.');

  if (path === '/api/admin/queue' && method === 'GET') {
    await expirePending(env); // lenjo istekni stare zahteve

    const pending = await env.DB.prepare(
      "SELECT id, code, submitted_at, consent_social FROM sessions WHERE status = 'pending' ORDER BY submitted_at ASC LIMIT 60",
    ).all();
    const recent = await env.DB.prepare(
      `SELECT id, code, status, attempts, max_attempts, error, updated_at, consent_social
       FROM sessions WHERE status IN ('approved','generating','done','failed','limit')
       ORDER BY updated_at DESC LIMIT 40`,
    ).all();
    const day = belgradeDay();
    const usage = await env.DB.prepare('SELECT n FROM usage WHERE day = ?').bind(day).first();
    const used = usage?.n || 0;
    return json({
      pending: pending.results,
      recent: recent.results,
      stats: {
        day,
        used,
        limit: num(env.DAILY_LIMIT, 360),
        costUsd: Math.round(used * num(env.COST_PER_IMAGE_USD, 0.0504) * 100) / 100,
        paused: await isPaused(env),
        demo: (env.PROVIDER || 'mock') !== 'gemini',
        model: env.GEMINI_MODEL,
      },
      serverTime: now(),
    });
  }

  if (path === '/api/admin/pause' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    await setSetting(env, 'paused', body.paused ? '1' : '0');
    return json({ paused: Boolean(body.paused) });
  }

  if (path === '/api/admin/purge' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (body.confirm !== 'OBRISI') return err(400, 'Potrebna potvrda.');
    const deleted = await purgeAll(env);
    return json({ deleted });
  }

  const m = path.match(/^\/api\/admin\/s\/([^/]+)\/([a-z]+)$/);
  if (!m) return err(404, 'Nepoznata ruta');
  const [, id, action] = m;
  const s = await getSession(env, id);
  if (!s) return err(404, 'Sesija ne postoji.');
  const t = now();

  if (action === 'photo' && method === 'GET') {
    if (!s.photo_key) return err(404, 'Nema slike.');
    const obj = await env.PHOTOS.get(s.photo_key);
    if (!obj) return err(404, 'Nema slike.');
    return new Response(obj.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' } });
  }

  if (action === 'result' && method === 'GET') {
    if (!s.result_key) return err(404, 'Nema rezultata.');
    const obj = await env.PHOTOS.get(s.result_key);
    if (!obj) return err(404, 'Nema rezultata.');
    return new Response(obj.body, { headers: { 'content-type': s.result_mime || 'image/png', 'cache-control': 'no-store' } });
  }

  if (action === 'approve' && method === 'POST') {
    const r = await env.DB.prepare(
      "UPDATE sessions SET status = 'approved', updated_at = ? WHERE id = ? AND status = 'pending'",
    ).bind(t, id).run();
    if (!r.meta.changes) return err(409, 'Zahtev više nije na čekanju.');
    const done = await generateWithRetries(env, id);
    return json({ ok: true, status: done?.status, error: done?.error || null });
  }

  if (action === 'reject' && method === 'POST') {
    if (s.status !== 'pending') return err(409, 'Zahtev više nije na čekanju.');
    await deleteObjects(env, s.photo_key);
    await env.DB.prepare(
      "UPDATE sessions SET status = 'rejected', photo_key = NULL, updated_at = ? WHERE id = ? AND status = 'pending'",
    ).bind(t, id).run();
    return json({ ok: true });
  }

  if (action === 'retry' && method === 'POST') {
    if (!['failed', 'limit'].includes(s.status)) return err(409, 'Ponovni pokušaj nije moguć u ovom stanju.');
    if (!s.photo_key) return err(409, 'Originalna slika više ne postoji.');
    await env.DB.prepare(
      "UPDATE sessions SET status = 'approved', max_attempts = attempts + 1, error = NULL, updated_at = ? WHERE id = ?",
    ).bind(t, id).run();
    const done = await generateWithRetries(env, id);
    return json({ ok: true, status: done?.status, error: done?.error || null });
  }

  return err(405, 'Metod nije dozvoljen');
}

// ---------- čišćenje ----------

async function expirePending(env) {
  const t = now();
  const stale = await env.DB.prepare(
    "SELECT id, photo_key FROM sessions WHERE status = 'pending' AND submitted_at < ?",
  ).bind(t - num(env.PENDING_TTL_MIN, 15) * 60_000).all();
  for (const r of stale.results) {
    await deleteObjects(env, r.photo_key);
    await env.DB.prepare(
      "UPDATE sessions SET status = 'expired', photo_key = NULL, updated_at = ? WHERE id = ? AND status = 'pending'",
    ).bind(t, r.id).run();
  }
}

async function cleanup(env) {
  const t = now();
  const originalCut = t - num(env.ORIGINAL_TTL_MIN, 60) * 60_000;
  const retentionCut = t - num(env.RETENTION_DAYS, 7) * 86_400_000;

  // 1) Neodobrene slike koje čekaju predugo.
  await expirePending(env);

  // 2) Originali posle uspešnog generisanja.
  const originals = await env.DB.prepare(
    "SELECT id, photo_key FROM sessions WHERE status = 'done' AND photo_key IS NOT NULL AND updated_at < ?",
  ).bind(originalCut).all();
  for (const r of originals.results) {
    await deleteObjects(env, r.photo_key);
    await env.DB.prepare('UPDATE sessions SET photo_key = NULL WHERE id = ?').bind(r.id).run();
  }

  // 3) Sve starije od roka čuvanja (uključujući neuspele i odbijene).
  const old = await env.DB.prepare('SELECT id, photo_key, result_key FROM sessions WHERE created_at < ?')
    .bind(retentionCut).all();
  for (const r of old.results) {
    await deleteObjects(env, r.photo_key, r.result_key);
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(r.id).run();
  }

  // 4) Napuštene sesije bez slike (starije od 1 dana).
  await env.DB.prepare("DELETE FROM sessions WHERE photo_key IS NULL AND result_key IS NULL AND status IN ('created','rejected','expired','deleted') AND updated_at < ?")
    .bind(t - 86_400_000).run();

  await env.DB.prepare('DELETE FROM login_attempts WHERE minute < ?').bind(Math.floor(t / 60_000) - 60).run();
}

async function purgeAll(env) {
  let deleted = 0;
  let cursor;
  do {
    const list = await env.PHOTOS.list({ cursor, limit: 1000 });
    const keys = list.objects.map((o) => o.key);
    if (keys.length) await env.PHOTOS.delete(keys);
    deleted += keys.length;
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  await env.DB.prepare('DELETE FROM sessions').run();
  return deleted;
}

// ---------- ulaz ----------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith('/api/admin/')) return await handleAdmin(request, env, path);
      if (path.startsWith('/api/')) return await handleGuest(request, env, path, ctx);
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error('unhandled', path, e?.stack || e);
      return err(500, 'Greška na serveru. Pokušajte ponovo.');
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanup(env));
  },
};

export { cleanup, belgradeDay };
