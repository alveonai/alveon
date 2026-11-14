# Foto-štand „Uđi u igru”

Web aplikacija za event: gost skenira QR, prihvata uslove, slika se svojim telefonom,
osoblje na tabletu odobrava, AI (Google Gemini, Nano Banana 2.1) pravi stilizovanu
sliku, gost je preuzima. Bez instalacije aplikacije.

- **Gost:** `https://<domen>/`
- **Tablet (osoblje):** `https://<domen>/admin.html` (PIN)
- **QR za štampu:** `https://<domen>/qr.html`
- **Privatnost:** `https://<domen>/privatnost.html`

## Kako radi

```
telefon gosta ──▶ Cloudflare Worker ──▶ D1 (statusi) + R2 (slike)
                        ▲                      │
tablet (✅/❌) ─────────┘   posle ✅ ──▶ Gemini API (store=false)
```

- Generisanje pokreće **tablet** u trenutku odobrenja. Telefon gosta je rezerva
  (preuzima posao ako tablet ne krene u roku od 20 s).
- 1 automatski ponovni pokušaj po gostu; posle toga dugme **↻ Ponovi** na tabletu.
- Dnevni limit (`DAILY_LIMIT`) se proverava na serveru, atomično.
- Pauza na tabletu zaustavlja nove goste.
- Brisanje: neodobreno posle 15 min, odbijeno odmah, original 60 min posle
  generisanja, sve ostalo posle 7 dana (cron na 5 min). Gost može sam da obriše
  svoje podatke, a tablet ima dugme „Obriši sve podatke” za kraj eventa.
- Samo 18+ (zahtev Gemini API uslova).

Sav kod za AI je u `src/provider.js`, a prompt u `src/prompt.js`.

## Postavljanje (jednom)

Potrebno: Node 20+, Cloudflare nalog.

```bash
cd gta-booth
npm install
npx wrangler login

# 1. baza i skladište
npx wrangler d1 create gta-booth-db        # upisati dobijeni database_id u wrangler.toml
npx wrangler r2 bucket create gta-booth-photos
npm run db:remote                           # pravi tabele

# 2. tajne
npx wrangler secret put ADMIN_PIN           # min. 6 cifara
npx wrangler secret put GEMINI_API_KEY      # tek kada se prelazi na pravi režim

# 3. u wrangler.toml popuniti CONTROLLER_NAME i CONTACT_EMAIL

# 4. objava
npm run deploy
```

Domen: Cloudflare → Workers → gta-booth → Settings → Domains & Routes →
dodati npr. `gta.<vaš-domen>` (domen mora biti na Cloudflare DNS-u, ili koristiti
dobijenu `*.workers.dev` adresu).

## Prelazak sa demo na pravi režim

1. Google AI Studio: projekat sa **uključenim billingom** (bez toga je besplatni
   nivo, gde Google koristi podatke za poboljšanje proizvoda).
2. AI Studio → **Logs**: isključiti logovanje za projekat. Nikad ne deliti logove
   ni datasetove sa Googleom.
3. `npx wrangler secret put GEMINI_API_KEY`
4. U `wrangler.toml`: `PROVIDER = "gemini"`, pa `npm run deploy`.
5. Na tabletu „Režim” pokazuje **UŽIVO**.

Povratak u demo: `PROVIDER = "mock"` i ponovo deploy.

## Lokalni rad i testovi

```bash
cp .dev.vars.example .dev.vars
npm run db:local
npm run dev                                  # http://127.0.0.1:8787
BASE=http://127.0.0.1:8787 PIN=123456 npm run test:e2e
```

Test grešaka i limita (drugi server):

```bash
npx wrangler dev --port 8788 --persist-to .wrangler/fail \
  --var MOCK_FAIL:1 --var DAILY_LIMIT:3 --var MOCK_DELAY_MS:300
# (pre toga: npx wrangler d1 execute gta-booth-db --local --persist-to .wrangler/fail --file=schema.sql)
BASE=http://127.0.0.1:8788 node scripts/e2e-failures.mjs
```

## Na dan eventa (kontrolna lista)

- [ ] Tablet: `/admin.html`, prijavljen, zvuk uključen, punjač
- [ ] Sopstveni 4G ruter za tablet
- [ ] Odštampan QR (`/qr.html`) i tabla „18+”
- [ ] Režim **UŽIVO**, limit i procena troška vidljivi
- [ ] Probna slika jednog člana tima pre otvaranja
- [ ] Posle eventa: po potrebi „Obriši sve podatke”
