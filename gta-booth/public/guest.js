(() => {
  'use strict';

  const POLL_MS = 2500;
  const MAX_SIDE = 1600; // px, duža strana pre slanja
  const JPEG_QUALITY = 0.85;

  const $ = (id) => document.getElementById(id);
  const views = ['loading', 'consent', 'capture', 'pending', 'generating', 'done', 'rejected', 'message'];

  let sessionId = null;
  let sessionCode = '';
  let pollTimer = null;
  let lastStatus = null;
  let photoBlob = null;
  let photoSize = '';
  let resultUrl = null;
  let resultBlob = null;

  // ---------- pomoćno ----------

  function show(name) {
    for (const v of views) $('v-' + v).classList.toggle('hidden', v !== name);
    window.scrollTo({ top: 0 });
  }

  function message(title, text, { restart = false } = {}) {
    $('msgTitle').textContent = title;
    $('msgText').textContent = text;
    $('b-restart').classList.toggle('hidden', !restart);
    show('message');
  }

  function store(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (_) { /* privatni režim i sl. */ }
  }

  function load(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function setSession(id, code) {
    sessionId = id;
    sessionCode = code || '';
    if (id) {
      history.replaceState(null, '', '#s=' + id);
      store('gtaSession', id);
    } else {
      history.replaceState(null, '', location.pathname);
      store('gtaSession', null);
    }
    $('deleteWrap').classList.toggle('hidden', !id);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, { cache: 'no-store', ...opts });
    let data = null;
    try { data = await res.json(); } catch (_) { /* slika ili prazno */ }
    if (!res.ok) {
      const e = new Error((data && data.error) || 'Greška (' + res.status + ')');
      e.status = res.status;
      e.data = data;
      throw e;
    }
    return data;
  }

  // ---------- konfiguracija ----------

  async function loadConfig() {
    try {
      const cfg = await api('/api/config');
      document.querySelectorAll('[data-cfg]').forEach((el) => {
        const v = cfg[el.dataset.cfg];
        if (v !== undefined) el.textContent = v;
      });
      $('demoBadge').classList.toggle('hidden', !cfg.demo);
      $('socialRow').classList.toggle('hidden', !cfg.socialEnabled);
      return cfg;
    } catch (_) {
      return { paused: false };
    }
  }

  // ---------- pristanak ----------

  function updateConsentButton() {
    $('b-consent').disabled = !($('c-age').checked && $('c-consent').checked);
  }

  async function submitConsent() {
    const btn = $('b-consent');
    btn.disabled = true;
    $('e-consent').classList.add('hidden');
    try {
      const data = await api('/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          age: $('c-age').checked,
          consent: $('c-consent').checked,
          social: !$('socialRow').classList.contains('hidden') && $('c-social').checked,
        }),
      });
      setSession(data.id, data.code);
      showCapture();
    } catch (e) {
      $('e-consent').textContent = e.message;
      $('e-consent').classList.remove('hidden');
      updateConsentButton();
    }
  }

  // ---------- slikanje ----------

  function showCapture(errorText) {
    photoBlob = null;
    $('previewBox').classList.add('hidden');
    $('f-camera').value = '';
    $('f-gallery').value = '';
    $('e-capture').classList.toggle('hidden', !errorText);
    $('e-capture').textContent = errorText || '';
    show('capture');
  }

  async function decodeImage(file) {
    if ('createImageBitmap' in window) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { /* fallback */ }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  async function compress(file) {
    const img = await decodeImage(file);
    const w = img.width || img.naturalWidth;
    const h = img.height || img.naturalHeight;
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    photoSize = canvas.width + 'x' + canvas.height;
    if (img.close) img.close();
    // Ponovno kodiranje uklanja EXIF podatke (lokacija, uređaj).
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', JPEG_QUALITY));
  }

  async function onFile(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    $('e-capture').classList.add('hidden');
    try {
      photoBlob = await compress(file);
      $('preview').src = URL.createObjectURL(photoBlob);
      $('previewBox').classList.remove('hidden');
      $('b-send').disabled = false;
      $('previewBox').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (_) {
      showCapture('Ovaj format slike nije podržan. Probaj ponovo kamerom.');
    }
  }

  async function sendPhoto() {
    if (!photoBlob || !sessionId) return;
    const btn = $('b-send');
    btn.disabled = true;
    btn.textContent = 'Šaljem…';
    try {
      const st = await api('/api/s/' + sessionId + '/photo', {
        method: 'POST',
        headers: { 'content-type': 'image/jpeg', 'x-photo-size': photoSize },
        body: photoBlob,
      });
      render(st);
      startPolling();
    } catch (e) {
      if (e.status === 404) return restart();
      $('e-capture').textContent = e.message || 'Slanje nije uspelo. Proveri internet i pokušaj ponovo.';
      $('e-capture').classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Pošalji na odobrenje';
    }
  }

  // ---------- status ----------

  const genTexts = [
    'Ovo traje do jednog minuta.',
    'Crtamo konture…',
    'Dodajemo zalazak sunca…',
    'Palme na svoje mesto…',
    'Još samo malo…',
  ];
  let genTextIdx = 0;
  setInterval(() => {
    genTextIdx = (genTextIdx + 1) % genTexts.length;
    $('genText').textContent = genTexts[genTextIdx];
  }, 4000);

  function render(st) {
    if (st.code) sessionCode = st.code;
    $('demoBadge').classList.toggle('hidden', !st.demo);
    const prev = lastStatus;
    lastStatus = st.status;

    switch (st.status) {
      case 'created':
        stopPolling();
        if (prev !== 'created') showCapture();
        break;
      case 'pending':
        $('code-pending').textContent = sessionCode;
        $('queueInfo').textContent = st.queuePosition > 1
          ? 'Ispred tebe: ' + (st.queuePosition - 1)
          : 'Ti si sledeći!';
        show('pending');
        break;
      case 'approved':
      case 'generating':
        $('code-gen').textContent = sessionCode;
        show('generating');
        break;
      case 'done':
        stopPolling();
        showResult();
        break;
      case 'rejected':
        stopPolling();
        show('rejected');
        break;
      case 'expired':
        stopPolling();
        showCapture('Vreme za odobrenje je isteklo. Pošalji fotografiju ponovo.');
        break;
      case 'failed':
        message('Nešto nije uspelo 😕', 'Javi se osoblju na štandu i reci kod ' + sessionCode + '. Možemo da pokušamo ponovo.');
        break;
      case 'limit':
        message('Za danas smo završili', 'Dostignut je maksimalan broj slika za danas. Hvala na razumevanju!');
        break;
      default:
        message('Nepoznato stanje', 'Osveži stranicu.');
    }
  }

  async function poll() {
    if (!sessionId) return;
    try {
      const st = await api('/api/s/' + sessionId);
      render(st);
    } catch (e) {
      if (e.status === 404) { stopPolling(); restart(); }
      // mrežne greške: tiho pokušavamo ponovo
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(poll, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  // ---------- rezultat ----------

  async function showResult() {
    show('done');
    if (resultUrl) return;
    try {
      const res = await fetch('/api/s/' + sessionId + '/result', { cache: 'no-store' });
      if (!res.ok) throw new Error('result');
      resultBlob = await res.blob();
      resultUrl = URL.createObjectURL(resultBlob);
      $('result').src = resultUrl;
    } catch (_) {
      message('Slika nije dostupna', 'Možda je istekla. Javi se osoblju na štandu.');
    }
  }

  async function saveResult() {
    if (!resultBlob) return;
    const ext = resultBlob.type.includes('png') ? 'png' : 'jpg';
    const name = 'moj-lik-' + (sessionCode || 'slika') + '.' + ext;
    try {
      const file = new File([resultBlob], name, { type: resultBlob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Moj lik' });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // korisnik zatvorio meni
    }
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---------- ostalo ----------

  function restart() {
    stopPolling();
    setSession(null);
    lastStatus = null;
    resultUrl = null;
    resultBlob = null;
    ['c-age', 'c-consent', 'c-social'].forEach((id) => { $(id).checked = false; });
    updateConsentButton();
    show('consent');
  }

  async function deleteMyData(ev) {
    ev.preventDefault();
    if (!sessionId) return;
    if (!confirm('Obrisati tvoju fotografiju i sliku? Ovo se ne može poništiti.')) return;
    try { await api('/api/s/' + sessionId, { method: 'DELETE' }); } catch (_) { /* već obrisano */ }
    stopPolling();
    setSession(null);
    message('Podaci su obrisani', 'Tvoja fotografija i slika su obrisane sa našeg servera.', { restart: true });
  }

  async function init() {
    $('c-age').addEventListener('change', updateConsentButton);
    $('c-consent').addEventListener('change', updateConsentButton);
    $('b-consent').addEventListener('click', submitConsent);
    $('f-camera').addEventListener('change', onFile);
    $('f-gallery').addEventListener('change', onFile);
    $('b-send').addEventListener('click', sendPhoto);
    $('b-retake').addEventListener('click', () => showCapture());
    $('b-change').addEventListener('click', () => { stopPolling(); showCapture(); });
    $('b-again').addEventListener('click', () => showCapture());
    $('b-save').addEventListener('click', saveResult);
    $('b-restart').addEventListener('click', restart);
    $('b-delete').addEventListener('click', deleteMyData);

    const cfg = await loadConfig();

    const fromHash = (location.hash.match(/s=([A-Za-z0-9_-]{20,40})/) || [])[1];
    const existing = fromHash || load('gtaSession');
    if (existing) {
      setSession(existing);
      try {
        const st = await api('/api/s/' + existing);
        render(st);
        if (['pending', 'approved', 'generating', 'failed', 'limit'].includes(st.status)) startPolling();
        return;
      } catch (_) {
        setSession(null);
      }
    }
    if (cfg.paused) {
      message('Štand je trenutno pauziran', 'Vrati se za par minuta.', { restart: true });
      return;
    }
    show('consent');
  }

  init();
})();
