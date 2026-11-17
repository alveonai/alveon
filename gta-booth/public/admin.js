(() => {
  'use strict';

  const POLL_MS = 2000;
  const $ = (id) => document.getElementById(id);

  let token = null;
  let pollTimer = null;
  let soundOn = true;
  let knownPending = new Set();
  let firstLoad = true;
  let socialOn = false;
  const photoUrls = new Map(); // id -> object URL
  const resultUrls = new Map();
  const busy = new Set(); // id-jevi na kojima je akcija u toku

  function store(key, value) {
    try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (_) {}
  }
  function load(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  async function api(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (token) headers.authorization = 'Bearer ' + token;
    const res = await fetch(path, { cache: 'no-store', ...opts, headers });
    if (res.status === 401 && path !== '/api/admin/login') {
      logout();
      throw new Error('Odjavljeni ste.');
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      if (!res.ok) throw new Error('Greška ' + res.status);
      return res;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Greška ' + res.status);
    return data;
  }

  // ---------- prijava ----------

  async function login() {
    $('e-login').classList.add('hidden');
    try {
      const data = await api('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin: $('pin').value.trim() }),
      });
      token = data.token;
      store('gtaAdminToken', token);
      startApp();
    } catch (e) {
      $('e-login').textContent = e.message;
      $('e-login').classList.remove('hidden');
    }
  }

  function logout() {
    token = null;
    store('gtaAdminToken', null);
    if (pollTimer) clearInterval(pollTimer);
    $('app').classList.add('hidden');
    $('login').classList.remove('hidden');
  }

  // ---------- zvuk ----------

  let audioCtx = null;
  function beep() {
    if (!soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      o.connect(g).connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + 0.35);
    } catch (_) {}
  }

  // ---------- prikaz ----------

  // Fotografija se kešira po ključu (verziji): ako gost pošalje novu, tablet je ponovo učitava.
  async function loadImage(id, kind, img, photoKey) {
    const cache = kind === 'photo' ? photoUrls : resultUrls;
    const cacheKey = kind === 'photo' ? photoKey : id;
    if (cache.has(cacheKey)) { img.src = cache.get(cacheKey); return; }
    try {
      const q = kind === 'photo' ? '?key=' + encodeURIComponent(photoKey) : '';
      const res = await api('/api/admin/s/' + id + '/' + kind + q);
      const blob = await res.blob();
      // Rezultat je 4K (~8 MB): za sličicu u listi čuvamo samo malu kopiju, da tablet
      // tokom večeri ne drži stotine velikih slika u memoriji.
      const url = kind === 'result' ? await smallCopy(blob) : URL.createObjectURL(blob);
      cache.set(cacheKey, url);
      if (kind !== 'photo' || img.closest('[data-key]')?.dataset.key === photoKey) img.src = url;
    } catch (_) {}
  }

  async function smallCopy(blob, maxSide = 240) {
    try {
      const bmp = await createImageBitmap(blob);
      const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      if (bmp.close) bmp.close();
      return c.toDataURL('image/jpeg', 0.8);
    } catch (_) {
      return URL.createObjectURL(blob); // stariji browser: puna slika
    }
  }

  function ago(ts, serverTime) {
    const s = Math.max(0, Math.round((serverTime - ts) / 1000));
    if (s < 60) return s + ' s';
    return Math.floor(s / 60) + ' min';
  }

  function renderPending(list, serverTime) {
    const grid = $('pendingGrid');
    const ids = new Set(list.map((p) => p.id));
    // ukloni kartice koje više nisu na čekanju
    [...grid.children].forEach((el) => { if (!ids.has(el.dataset.id)) el.remove(); });

    for (const p of list) {
      let el = grid.querySelector('[data-id="' + p.id + '"]');
      if (!el) {
        el = document.createElement('div');
        el.className = 'item' + (firstLoad ? '' : ' new');
        el.dataset.id = p.id;
        el.innerHTML =
          '<img alt="Fotografija gosta">' +
          '<div class="code center"></div>' +
          '<div class="scene-tag"></div>' +
          '<div class="meta"></div>' +
          '<div class="actions">' +
          '<button class="btn ok">✅ Generiši</button>' +
          '<button class="btn no">❌ Odbij</button>' +
          '</div>';
        el.querySelector('.code').textContent = p.code;
        el.querySelector('.ok').addEventListener('click', () => approve(p.id, el));
        el.querySelector('.no').addEventListener('click', () => reject(p.id, el));
        grid.appendChild(el);
        setTimeout(() => el.classList.remove('new'), 6000);
      }
      if (el.dataset.key !== p.photo_key) {
        // Nova ili promenjena fotografija: osoblje mora da vidi baš ovu verziju.
        const changed = Boolean(el.dataset.key);
        el.dataset.key = p.photo_key;
        const img = el.querySelector('img');
        img.removeAttribute('src');
        loadImage(p.id, 'photo', img, p.photo_key);
        if (changed) {
          el.classList.add('new');
          setTimeout(() => el.classList.remove('new'), 6000);
        }
      }
      // Scena se menja samo zajedno sa fotografijom, pa uvek odgovara prikazanoj verziji.
      el.querySelector('.scene-tag').textContent = sceneText(p);
      el.querySelector('.meta').textContent =
        'čeka ' + ago(p.submitted_at, serverTime) + (socialOn && p.consent_social ? ' · OK za mreže' : '');
    }
    $('pendingEmpty').classList.toggle('hidden', list.length > 0);
  }

  function sceneText(r) {
    if (!r.scene) return 'Scena: podrazumevana';
    return 'Scena ' + Number(r.scene) + ': ' + (r.scene_title || '?') + (r.scene_aspect ? ' (' + r.scene_aspect + ')' : '');
  }

  const statusLabel = {
    approved: 'Pokreće se', generating: 'Generiše se', done: 'Gotovo', failed: 'Greška', limit: 'Limit',
  };

  function renderRecent(list, serverTime) {
    const body = $('recentBody');
    body.innerHTML = '';
    for (const r of list) {
      const tr = document.createElement('tr');
      const tdImg = document.createElement('td');
      if (r.status === 'done') {
        const img = document.createElement('img');
        img.className = 'thumbresult';
        img.alt = '';
        loadImage(r.id, 'result', img);
        tdImg.appendChild(img);
      }
      const tdCode = document.createElement('td');
      tdCode.className = 'c';
      tdCode.textContent = r.code;
      const sc = document.createElement('div');
      sc.className = 'scene-small';
      sc.textContent = sceneText(r);
      tdCode.appendChild(sc);
      const tdStatus = document.createElement('td');
      const chip = document.createElement('span');
      chip.className = 'chip ' + r.status;
      chip.textContent = statusLabel[r.status] || r.status;
      tdStatus.appendChild(chip);
      if (r.error && r.status !== 'done') {
        const e = document.createElement('div');
        e.className = 'err';
        e.textContent = r.error;
        tdStatus.appendChild(e);
      }
      const tdTime = document.createElement('td');
      tdTime.className = 'muted';
      tdTime.textContent = 'pre ' + ago(r.updated_at, serverTime);
      const tdAct = document.createElement('td');
      tdAct.className = 'row-actions';
      if (r.status === 'done') {
        const b = document.createElement('button');
        b.className = 'btn secondary';
        b.textContent = '▦ QR za preuzimanje';
        b.addEventListener('click', () => showDownloadQr(r.id, r.code));
        // Preuzimanje pune slike na ovaj uređaj (osoblje, za štampu).
        const d = document.createElement('a');
        d.className = 'btn secondary';
        d.textContent = '⬇ Preuzmi';
        d.href = '/api/s/' + encodeURIComponent(r.id) + '/result?download=1';
        d.setAttribute('download', '');
        tdAct.append(b, d);
      }
      if (r.status === 'failed' || r.status === 'limit') {
        const b = document.createElement('button');
        b.className = 'btn';
        b.textContent = busy.has(r.id) ? '…' : '↻ Ponovi';
        b.disabled = busy.has(r.id);
        b.addEventListener('click', () => retry(r.id, b));
        tdAct.appendChild(b);
      }
      tr.append(tdImg, tdCode, tdStatus, tdTime, tdAct);
      body.appendChild(tr);
    }
  }

  function renderStats(st, pendingCount) {
    $('s-used').textContent = st.used;
    $('s-limit').textContent = st.limit;
    $('s-cost').textContent = st.costUsd.toFixed(2);
    $('s-pending').textContent = pendingCount;
    $('s-modeText').textContent = st.demo ? 'DEMO' : 'UŽIVO (' + st.model + ')';
    $('s-mode').style.borderColor = st.demo ? 'var(--yellow)' : 'var(--green)';
    $('pausedBanner').classList.toggle('hidden', !st.paused);
    $('b-pause').textContent = st.paused ? '▶️ Nastavi' : '⏸ Pauziraj';
    $('b-pause').dataset.paused = st.paused ? '1' : '0';
    document.title = (pendingCount ? '(' + pendingCount + ') ' : '') + 'Štand – odobravanje';
  }

  async function refresh() {
    try {
      const data = await api('/api/admin/queue');
      $('offlineBanner').classList.add('hidden');
      const pending = data.pending.filter((p) => !busy.has(p.id));
      const newOnes = pending.filter((p) => !knownPending.has(p.id));
      if (!firstLoad && newOnes.length) beep();
      knownPending = new Set(data.pending.map((p) => p.id));
      socialOn = Boolean(data.stats.socialEnabled);
      renderPending(pending, data.serverTime);
      renderRecent(data.recent, data.serverTime);
      renderStats(data.stats, pending.length);
      firstLoad = false;
    } catch (e) {
      if (token) $('offlineBanner').classList.remove('hidden');
    }
  }

  // ---------- akcije ----------

  // Šalje ključ fotografije koju je osoblje videlo; server odbija (409) ako ju je gost u međuvremenu promenio.
  async function decide(action, id, el) {
    if (busy.has(id)) return;
    const photoKey = el.dataset.key;
    if (!photoKey || !el.querySelector('img').getAttribute('src')) {
      alert('Fotografija se još učitava.');
      return;
    }
    busy.add(id);
    el.remove();
    try {
      await api('/api/admin/s/' + id + '/' + action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ photo_key: photoKey }),
      });
    } catch (e) {
      alert((action === 'approve' ? 'Odobravanje' : 'Odbijanje') + ' nije uspelo: ' + e.message);
    } finally {
      busy.delete(id);
      const u = photoUrls.get(photoKey);
      if (u) { URL.revokeObjectURL(u); photoUrls.delete(photoKey); }
      refresh();
    }
  }

  const approve = (id, el) => decide('approve', id, el);
  const reject = (id, el) => decide('reject', id, el);

  async function retry(id, btn) {
    if (busy.has(id)) return;
    busy.add(id);
    btn.disabled = true;
    btn.textContent = '…';
    try {
      await api('/api/admin/s/' + id + '/retry', { method: 'POST' });
    } catch (e) {
      alert('Ponovni pokušaj nije uspeo: ' + e.message);
    } finally {
      busy.delete(id);
      refresh();
    }
  }

  // QR za preuzimanje: gost koji je izgubio stranicu ponovo skenira i dolazi na svoj rezultat.
  function showDownloadQr(id, code) {
    const q = qrcode(0, 'M');
    q.addData(location.origin + '/#s=' + id);
    q.make();
    $('qrBox').innerHTML = q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
    $('qrCode').textContent = code;
    $('qrModal').classList.remove('hidden');
  }

  async function togglePause() {
    const paused = $('b-pause').dataset.paused !== '1';
    try {
      await api('/api/admin/pause', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paused }),
      });
    } catch (e) { alert(e.message); }
    refresh();
  }

  async function purge() {
    const answer = prompt('Ovo trajno briše SVE podatke. Upiši OBRISI za potvrdu:');
    if (answer !== 'OBRISI') return;
    try {
      const r = await api('/api/admin/purge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: 'OBRISI' }),
      });
      alert('Obrisano fajlova: ' + r.deleted);
    } catch (e) { alert(e.message); }
    refresh();
  }

  function startApp() {
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    firstLoad = true;
    refresh();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refresh, POLL_MS);
  }

  // ---------- start ----------

  $('b-login').addEventListener('click', login);
  $('pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
  $('b-pause').addEventListener('click', togglePause);
  $('b-purge').addEventListener('click', purge);
  $('qrModal').addEventListener('click', () => $('qrModal').classList.add('hidden'));
  $('b-sound').addEventListener('click', () => {
    soundOn = !soundOn;
    $('b-sound').textContent = '🔔 Zvuk: ' + (soundOn ? 'uključen' : 'isključen');
    if (soundOn) beep();
  });

  token = load('gtaAdminToken');
  if (token) startApp();
  else $('login').classList.remove('hidden');
})();
