import { generateStylized, ProviderError } from './provider.js';
import { getScene, publicScenes } from './scenes.js';

// ---------- pomoćne funkcije ----------

const CODE_ALPHABET = 'ACDEFHJKMNPRTUVWXY34679'; // bez sličnih znakova (0/O, 1/I...)
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const GENERATION_STALE_MS = 180_000; // "generating" duže od ovoga smatra se zaglavljenim
const REQUEUE_AFTER_MS = 120_000; // cron ponovo šalje u red "approved" starije od ovoga

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
const socialEnabled = (env) => env.SOCIAL_CONSENT_ENABLED === '1';
const isDemo = (env) => (env.PROVIDER || 'mock') !== 'gemini';

// Formati koje Gemini podržava za izlaznu sliku (bez ekstremnih panorama).
const SUPPORTED_ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

// Najbliži podržani format za datu širinu i visinu (poređenje u log razmeri).
function nearestAspect(w, h) {
  if (!(w > 0 && h > 0)) return null;
  const target = Math.log(w / h);
  let best = null;
  let bestDiff = Infinity;
  for (const a of SUPPORTED_ASPECTS) {
    const [aw, ah] = a.split(':').map(Number);
    const diff = Math.abs(Math.log(aw / ah) - target);
    if (diff < bestDiff) { bestDiff = diff; best = a; }
  }
  return best;
}

function parsePhotoSize(header) {
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(String(header || ''));
  return m ? nearestAspect(Number(m[1]), Number(m[2])) : null;
}

function transientDelays(env) {
  return String(env.TRANSIENT_DELAYS_S || '5,15,30,60').split(',').map((x) => num(x.trim(), 10));
}

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

async function enqueue(env, id) {
  await env.JOBS.send({ id });
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
    demo: isDemo(env),
    scene: s.scene || null,
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
    const r = await env.DB.prepare(
      "UPDATE sessions SET status = 'expired', photo_key = NULL, updated_at = ? WHERE id = ? AND status = 'pending' AND photo_key = ?",
    ).bind(now(), s.id, s.photo_key).run();
    if (r.meta.changes) await deleteObjects(env, s.photo_key);
    return { ...s, status: 'expired', photo_key: null };
  }
  return s;
}

// ---------- generisanje (Cloudflare Queue consumer) ----------
//
// Svaki upis posle poziva AI-ja je uslovljen "fencing" tokenom (attempts + started_at
// iz trenutka preuzimanja). Ako je sesija u međuvremenu obrisana, odbijena, purgovana
// ili preuzeta od drugog pokretača, upis ne menja ništa i rezultat se odmah briše.

async function processJob(env, id, deliveryAttempt) {
  const s = await getSession(env, id);
  if (!s) return { ack: true };
  const t = now();

  if (s.status === 'generating' && s.started_at > t - GENERATION_STALE_MS) {
    // Neko drugi radi (ili je pokretač pao) – proveri ponovo kasnije.
    return { retryDelay: 60 };
  }
  if (s.status !== 'approved' && s.status !== 'generating') return { ack: true };

  // 1) Atomično preuzimanje posla.
  const claim = await env.DB.prepare(
    `UPDATE sessions SET status = 'generating', started_at = ?, attempts = attempts + 1, updated_at = ?, error = NULL
     WHERE id = ? AND attempts < max_attempts AND photo_key IS NOT NULL
       AND (status = 'approved' OR (status = 'generating' AND started_at < ?))
     RETURNING attempts, started_at, photo_key, photo_aspect, scene`,
  ).bind(t, t, id, t - GENERATION_STALE_MS).first();
  if (!claim) {
    const fresh = await getSession(env, id);
    if (fresh && fresh.status === 'approved' && fresh.attempts >= fresh.max_attempts) {
      await env.DB.prepare(
        "UPDATE sessions SET status = 'failed', error = COALESCE(error, 'Iskorišćeni svi pokušaji'), updated_at = ? WHERE id = ? AND status = 'approved'",
      ).bind(now(), id).run();
    }
    return { ack: true };
  }
  const fence = [id, claim.attempts, claim.started_at];
  const FENCE = "WHERE id = ? AND status = 'generating' AND attempts = ? AND started_at = ?";

  // 2) Dnevni limit (atomično).
  const day = belgradeDay(t);
  await env.DB.prepare('INSERT OR IGNORE INTO usage (day, n) VALUES (?, 0)').bind(day).run();
  const used = await env.DB.prepare('UPDATE usage SET n = n + 1 WHERE day = ? AND n < ?')
    .bind(day, num(env.DAILY_LIMIT, 360)).run();
  if (!used.meta.changes) {
    await env.DB.prepare(`UPDATE sessions SET status = 'limit', error = 'Dostignut dnevni limit', updated_at = ? ${FENCE}`)
      .bind(now(), ...fence).run();
    return { ack: true };
  }

  // 3) Poziv AI-ja.
  try {
    const obj = await env.PHOTOS.get(claim.photo_key);
    if (!obj) throw new ProviderError('Originalna slika ne postoji', { retryable: false });
    const photo = new Uint8Array(await obj.arrayBuffer());
    // Izabrana scena određuje prompt i format; bez scene: podrazumevani prompt i format fotografije.
    const scene = getScene(claim.scene);
    const result = await generateStylized(env, photo, obj.httpMetadata?.contentType || 'image/jpeg', {
      aspectRatio: scene?.aspect || claim.photo_aspect || env.ASPECT_RATIO || '3:4',
      prompt: scene?.prompt,
    });

    const resultKey = `results/${id}/${claim.attempts}`;
    await env.PHOTOS.put(resultKey, result.bytes, { httpMetadata: { contentType: result.mime } });
    const done = await env.DB.prepare(
      `UPDATE sessions SET status = 'done', result_key = ?, result_mime = ?, error = NULL, updated_at = ? ${FENCE}`,
    ).bind(resultKey, result.mime, now(), ...fence).run();
    if (!done.meta.changes) {
      // Sesija obrisana/promenjena tokom generisanja: ne ostavljati ništa iza sebe.
      await deleteObjects(env, resultKey);
      console.log('result discarded (fenced)', id);
    }
    return { ack: true };
  } catch (e) {
    const message = String(e?.message || e).slice(0, 300);
    console.error('generation failed', id, message);

    if (e instanceof ProviderError && e.transient) {
      // 429/503: Google preopterećen. Ne troši pokušaj i ne računa se u trošak.
      const back = await env.DB.prepare(
        `UPDATE sessions SET status = 'approved', attempts = attempts - 1, error = ?, updated_at = ? ${FENCE}`,
      ).bind('Google preopterećen, novi pokušaj uskoro', now(), ...fence).run();
      if (back.meta.changes) {
        await env.DB.prepare('UPDATE usage SET n = MAX(n - 1, 0) WHERE day = ?').bind(day).run();
      }
      const delays = transientDelays(env);
      if (back.meta.changes && deliveryAttempt <= delays.length) {
        return { retryDelay: delays[deliveryAttempt - 1] };
      }
      await env.DB.prepare(
        "UPDATE sessions SET status = 'failed', error = 'Google je preopterećen. Pokušajte ponovo za minut.', updated_at = ? WHERE id = ? AND status = 'approved'",
      ).bind(now(), id).run();
      return { ack: true };
    }

    // Obična greška: troši pokušaj; ako ima još pokušaja, ponovo za 2 s, inače "failed".
    const retryable = e instanceof ProviderError ? e.retryable : true;
    const upd = await env.DB.prepare(
      `UPDATE sessions SET status = CASE WHEN ? = 1 AND attempts < max_attempts THEN 'approved' ELSE 'failed' END,
              error = ?, updated_at = ? ${FENCE} RETURNING status`,
    ).bind(retryable ? 1 : 0, message, now(), ...fence).first();
    if (upd?.status === 'approved') return { retryDelay: 2 };
    return { ack: true };
  }
}

// ---------- rute za goste ----------

async function handleGuest(request, env, path) {
  const method = request.method;

  if (path === '/api/config' && method === 'GET') {
    return json({
      controller: env.CONTROLLER_NAME,
      contactEmail: env.CONTACT_EMAIL,
      retentionDays: num(env.RETENTION_DAYS, 7),
      originalTtlMin: num(env.ORIGINAL_TTL_MIN, 60),
      pendingTtlMin: num(env.PENDING_TTL_MIN, 15),
      socialEnabled: socialEnabled(env),
      demo: isDemo(env),
      paused: await isPaused(env),
    });
  }

  if (path === '/api/scenes' && method === 'GET') {
    return json({ scenes: publicScenes() }, 200, { 'cache-control': 'public, max-age=300' });
  }

  if (path === '/api/sessions' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (body.age !== true) return err(400, 'Potrebno je potvrditi da imate 18 ili više godina.');
    if (body.consent !== true) return err(400, 'Potreban je pristanak na obradu fotografije.');
    if (await isPaused(env)) return err(503, 'Štand je trenutno pauziran.', { paused: true });
    const id = randomId();
    const code = randomCode();
    const t = now();
    const social = socialEnabled(env) && body.social === true ? 1 : 0;
    await env.DB.prepare(
      `INSERT INTO sessions (id, code, status, created_at, updated_at, consent_at, consent_social, age_confirmed, max_attempts)
       VALUES (?, ?, 'created', ?, ?, ?, ?, 1, ?)`,
    ).bind(id, code, t, t, t, social, num(env.MAX_ATTEMPTS, 2)).run();
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
    // Scena se šalje uz svaku fotografiju; menja se samo zajedno sa fotografijom (nova verzija),
    // pa tablet uvek odobrava par fotografija + scena koji je video.
    const sceneId = request.headers.get('x-scene');
    if (sceneId !== null && !getScene(sceneId)) return err(400, 'Izaberi scenu.');
    const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE status = 'pending'").first();
    if (s.status !== 'pending' && (pending?.n || 0) >= num(env.MAX_PENDING, 40)) {
      return err(503, 'Red je trenutno pun. Pokušajte ponovo za nekoliko minuta.');
    }
    const type = (request.headers.get('content-type') || '').split(';')[0].trim();
    if (type !== 'image/jpeg') return err(415, 'Slika mora biti JPEG.');
    const buf = new Uint8Array(await request.arrayBuffer());
    if (buf.length < 1000 || buf.length > MAX_UPLOAD_BYTES) return err(413, 'Slika je prevelika ili oštećena.');
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return err(415, 'Neispravan JPEG.');
    const t = now();
    // Svaka fotografija ima svoj ključ (verziju), da tablet odobri baš onu koju je video.
    const key = `photos/${id}/${t}-${randomId(6)}`;
    // Telefon šalje dimenzije fotografije; izlazna slika dobija isti (najbliži podržani) format.
    const aspect = parsePhotoSize(request.headers.get('x-photo-size'));
    await env.PHOTOS.put(key, buf, { httpMetadata: { contentType: 'image/jpeg' } });
    const upd = await env.DB.prepare(
      `UPDATE sessions SET status = 'pending', photo_key = ?, photo_aspect = ?, scene = ?, submitted_at = ?, error = NULL, updated_at = ?
       WHERE id = ? AND status IN ('created','pending','rejected','expired')`,
    ).bind(key, aspect, sceneId, t, t, id).run();
    if (!upd.meta.changes) {
      await deleteObjects(env, key);
      return err(409, 'Slika je već odobrena i ne može se menjati.');
    }
    if (s.photo_key && s.photo_key !== key) await deleteObjects(env, s.photo_key);
    return json(await publicStatus(env, await getSession(env, id)));
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
        'content-disposition': `inline; filename="moj-lik-${s.code}.${ext}"`,
      },
    });
  }

  if (action === '' && method === 'DELETE') {
    // Gost povlači pristanak: brišemo sve odmah. Generisanje u toku ne može ništa
    // da upiše posle ovoga (uslovni upis u processJob).
    await env.DB.prepare(
      "UPDATE sessions SET status = 'deleted', photo_key = NULL, result_key = NULL, updated_at = ? WHERE id = ?",
    ).bind(now(), id).run();
    await deleteObjects(env, s.photo_key, s.result_key);
    return json({ status: 'deleted' });
  }

  return err(405, 'Metod nije dozvoljen');
}

// ---------- rute za tablet ----------

async function handleAdmin(request, env, path) {
  const method = request.method;
  const url = new URL(request.url);

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
      "SELECT id, code, submitted_at, consent_social, photo_key, photo_aspect, scene FROM sessions WHERE status = 'pending' ORDER BY submitted_at ASC LIMIT 60",
    ).all();
    const recent = await env.DB.prepare(
      `SELECT id, code, status, attempts, max_attempts, error, updated_at, consent_social, scene
       FROM sessions WHERE status IN ('approved','generating','done','failed','limit')
       ORDER BY updated_at DESC LIMIT 40`,
    ).all();
    const withScene = (rows) => rows.map((r) => {
      const sc = getScene(r.scene);
      return { ...r, scene_title: sc ? sc.title : null, scene_aspect: sc ? sc.aspect : null };
    });
    const day = belgradeDay();
    const usage = await env.DB.prepare('SELECT n FROM usage WHERE day = ?').bind(day).first();
    const used = usage?.n || 0;
    return json({
      pending: withScene(pending.results),
      recent: withScene(recent.results),
      stats: {
        day,
        used,
        limit: num(env.DAILY_LIMIT, 360),
        costUsd: Math.round(used * num(env.COST_PER_IMAGE_USD, 0.0504) * 100) / 100,
        paused: await isPaused(env),
        demo: isDemo(env),
        model: env.GEMINI_MODEL,
        socialEnabled: socialEnabled(env),
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
    // Tablet traži tačnu verziju fotografije koju prikazuje na kartici.
    const key = url.searchParams.get('key');
    if (!s.photo_key || (key && key !== s.photo_key)) return err(409, 'Fotografija je promenjena.');
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

  if ((action === 'approve' || action === 'reject') && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const seenKey = String(body.photo_key || '');
    if (!seenKey) return err(400, 'Nedostaje photo_key.');
    if (action === 'approve') {
      const r = await env.DB.prepare(
        "UPDATE sessions SET status = 'approved', updated_at = ? WHERE id = ? AND status = 'pending' AND photo_key = ?",
      ).bind(t, id, seenKey).run();
      if (!r.meta.changes) return err(409, conflictMessage(s, seenKey));
      try {
        await enqueue(env, id);
      } catch (e) {
        // Red nedostupan: vrati na čekanje da osoblje može ponovo.
        await env.DB.prepare("UPDATE sessions SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'approved'")
          .bind(now(), id).run();
        return err(503, 'Red za generisanje trenutno nije dostupan. Pokušajte ponovo.');
      }
      return json({ ok: true, status: 'approved' });
    }
    const r = await env.DB.prepare(
      "UPDATE sessions SET status = 'rejected', photo_key = NULL, updated_at = ? WHERE id = ? AND status = 'pending' AND photo_key = ?",
    ).bind(t, id, seenKey).run();
    if (!r.meta.changes) return err(409, conflictMessage(s, seenKey));
    await deleteObjects(env, seenKey);
    return json({ ok: true, status: 'rejected' });
  }

  if (action === 'retry' && method === 'POST') {
    if (!['failed', 'limit'].includes(s.status)) return err(409, 'Ponovni pokušaj nije moguć u ovom stanju.');
    if (!s.photo_key) return err(409, 'Originalna slika više ne postoji.');
    const r = await env.DB.prepare(
      "UPDATE sessions SET status = 'approved', max_attempts = attempts + 1, error = NULL, updated_at = ? WHERE id = ? AND status IN ('failed','limit')",
    ).bind(t, id).run();
    if (!r.meta.changes) return err(409, 'Stanje se promenilo.');
    await enqueue(env, id);
    return json({ ok: true, status: 'approved' });
  }

  return err(405, 'Metod nije dozvoljen');
}

function conflictMessage(s, seenKey) {
  if (s.status === 'pending' && s.photo_key !== seenKey) return 'Fotografija je promenjena. Pogledajte novu.';
  return 'Zahtev više nije na čekanju.';
}

// ---------- čišćenje ----------

async function expirePending(env) {
  const t = now();
  const stale = await env.DB.prepare(
    "SELECT id, photo_key FROM sessions WHERE status = 'pending' AND submitted_at < ?",
  ).bind(t - num(env.PENDING_TTL_MIN, 15) * 60_000).all();
  for (const r of stale.results) {
    const u = await env.DB.prepare(
      "UPDATE sessions SET status = 'expired', photo_key = NULL, updated_at = ? WHERE id = ? AND status = 'pending' AND photo_key = ?",
    ).bind(t, r.id, r.photo_key).run();
    if (u.meta.changes) await deleteObjects(env, r.photo_key);
  }
}

async function cleanup(env) {
  const t = now();
  const originalCut = t - num(env.ORIGINAL_TTL_MIN, 60) * 60_000;
  const retentionCut = t - num(env.RETENTION_DAYS, 7) * 86_400_000;

  // 1) Neodobrene slike koje čekaju predugo.
  await expirePending(env);

  // 2) Zaštitna mreža: odobreno a nije preuzeto, ili zaglavljeno u "generating".
  const stuck = await env.DB.prepare(
    `SELECT id FROM sessions WHERE (status = 'approved' AND updated_at < ?)
        OR (status = 'generating' AND started_at < ?)`,
  ).bind(t - REQUEUE_AFTER_MS, t - GENERATION_STALE_MS).all();
  for (const r of stuck.results) await enqueue(env, r.id);

  // 3) Originali posle uspešnog generisanja.
  const originals = await env.DB.prepare(
    "SELECT id, photo_key FROM sessions WHERE status = 'done' AND photo_key IS NOT NULL AND updated_at < ?",
  ).bind(originalCut).all();
  for (const r of originals.results) {
    await env.DB.prepare('UPDATE sessions SET photo_key = NULL WHERE id = ?').bind(r.id).run();
    await deleteObjects(env, r.photo_key);
  }

  // 4) Sve starije od roka čuvanja (uključujući neuspele i odbijene).
  const old = await env.DB.prepare('SELECT id, photo_key, result_key FROM sessions WHERE created_at < ?')
    .bind(retentionCut).all();
  for (const r of old.results) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(r.id).run();
    await deleteObjects(env, r.photo_key, r.result_key);
  }

  // 5) Napuštene sesije bez slike (starije od 1 dana).
  await env.DB.prepare("DELETE FROM sessions WHERE photo_key IS NULL AND result_key IS NULL AND status IN ('created','rejected','expired','deleted') AND updated_at < ?")
    .bind(t - 86_400_000).run();

  await env.DB.prepare('DELETE FROM login_attempts WHERE minute < ?').bind(Math.floor(t / 60_000) - 60).run();
}

async function purgeAll(env) {
  // Prvo baza (da generisanje u toku ne može da upiše rezultat), pa fajlovi.
  await env.DB.prepare('DELETE FROM sessions').run();
  let deleted = 0;
  let cursor;
  do {
    const list = await env.PHOTOS.list({ cursor, limit: 1000 });
    const keys = list.objects.map((o) => o.key);
    if (keys.length) await env.PHOTOS.delete(keys);
    deleted += keys.length;
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  return deleted;
}

// ---------- ulaz ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith('/api/admin/')) return await handleAdmin(request, env, path);
      if (path.startsWith('/api/')) return await handleGuest(request, env, path);
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error('unhandled', path, e?.stack || e);
      return err(500, 'Greška na serveru. Pokušajte ponovo.');
    }
  },

  async queue(batch, env) {
    for (const msg of batch.messages) {
      try {
        const r = await processJob(env, msg.body?.id, msg.attempts);
        if (r.retryDelay) msg.retry({ delaySeconds: r.retryDelay });
        else msg.ack();
      } catch (e) {
        console.error('queue job crashed', msg.body?.id, e?.stack || e);
        msg.retry({ delaySeconds: 10 });
      }
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanup(env));
  },
};

export { cleanup, belgradeDay, processJob, nearestAspect };
