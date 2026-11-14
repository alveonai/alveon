(() => {
  'use strict';

  const POLL_MS = 2000;
  const $ = (id) => document.getElementById(id);

  let token = null;
  let pollTimer = null;
  let soundOn = true;
  let knownPending = new Set();
  let firstLoad = true;
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

  async function loadImage(id, kind, img) {
    const cache = kind === 'photo' ? photoUrls : resultUrls;
    if (cache.has(id)) { img.src = cache.get(id); return; }
    try {
      const res = await api('/api/admin/s/' + id + '/' + kind);
      const url = URL.createObjectURL(await res.blob());
      cache.set(id, url);
      img.src = url;
    } catch (_) {}
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
          '<div class="meta"></div>' +
          '<div class="actions">' +
          '<button class="btn ok">✅ Generiši</button>' +
          '<button class="btn no">❌ Odbij</button>' +
          '</div>';
        el.querySelector('.code').textContent = p.code;
        el.querySelector('.ok').addEventListener('click', () => approve(p.id, el));
        el.querySelector('.no').addEventListener('click', () => reject(p.id, el));
        loadImage(p.id, 'photo', el.querySelector('img'));
        grid.appendChild(el);
        setTimeout(() => el.classList.remove('new'), 6000);
      }
      el.querySelector('.meta').textContent =
        'čeka ' + ago(p.submitted_at, serverTime) + (p.consent_social ? ' · OK za mreže' : '');
    }
    $('pendingEmpty').classList.toggle('hidden', list.length > 0);
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
      renderPending(pending, data.serverTime);
      renderRecent(data.recent, data.serverTime);
      renderStats(data.stats, pending.length);
      firstLoad = false;
    } catch (e) {
      if (token) $('offlineBanner').classList.remove('hidden');
    }
  }

  // ---------- akcije ----------

  function approve(id, el) {
    if (busy.has(id)) return;
    busy.add(id);
    el.remove();
    // Zahtev traje dok se slika ne generiše; ne čekamo ga, tablet ostaje slobodan.
    api('/api/admin/s/' + id + '/approve', { method: 'POST' })
      .catch((e) => alert('Odobravanje nije uspelo: ' + e.message))
      .finally(() => { busy.delete(id); refresh(); });
    setTimeout(refresh, 300);
  }

  async function reject(id, el) {
    if (busy.has(id)) return;
    busy.add(id);
    el.remove();
    try {
      await api('/api/admin/s/' + id + '/reject', { method: 'POST' });
    } catch (e) {
      alert('Odbijanje nije uspelo: ' + e.message);
    } finally {
      busy.delete(id);
      const u = photoUrls.get(id);
      if (u) { URL.revokeObjectURL(u); photoUrls.delete(id); }
      refresh();
    }
  }

  function retry(id, btn) {
    if (busy.has(id)) return;
    busy.add(id);
    btn.disabled = true;
    btn.textContent = '…';
    api('/api/admin/s/' + id + '/retry', { method: 'POST' })
      .catch((e) => alert('Ponovni pokušaj nije uspeo: ' + e.message))
      .finally(() => { busy.delete(id); refresh(); });
    setTimeout(refresh, 300);
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
  $('b-sound').addEventListener('click', () => {
    soundOn = !soundOn;
    $('b-sound').textContent = '🔔 Zvuk: ' + (soundOn ? 'uključen' : 'isključen');
    if (soundOn) beep();
  });

  token = load('gtaAdminToken');
  if (token) startApp();
  else $('login').classList.remove('hidden');
})();
