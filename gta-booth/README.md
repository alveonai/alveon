# Foto-štand „Uđi u igru”

Web aplikacija za event: gost skenira QR, prihvata uslove, slika se svojim telefonom,
osoblje na tabletu odobrava, AI (Google Gemini, Nano Banana 2.1) pravi stilizovanu
sliku, gost je preuzima. Bez instalacije aplikacije.

**Postavljeno 17. 11. 2026:** https://gta-booth.gta-booth.workers.dev (pravi režim, UŽIVO)

- **Gost:** `https://gta-booth.gta-booth.workers.dev/`
- **Tablet (osoblje):** `https://gta-booth.gta-booth.workers.dev/admin.html` (PIN je Cloudflare tajna, nije u kodu)
- **QR za štampu:** `https://gta-booth.gta-booth.workers.dev/qr.html`
- **Privatnost:** `https://gta-booth.gta-booth.workers.dev/privatnost.html`

## Kako radi

```
telefon gosta ──▶ Cloudflare Worker ──▶ D1 (statusi) + R2 (slike)
                        ▲         │
tablet (✅/❌) ─────────┘         └─ posle ✅ ─▶ Queue ─▶ consumer ─▶ Gemini API (store=false)
```

- ✅ na tabletu samo upiše posao u **Cloudflare Queue** i odmah vrati odgovor;
  generisanje radi consumer nezavisno od veze tableta/telefona, najviše 3 paralelno.
- Tablet šalje verziju fotografije koju je video; ako ju je gost u međuvremenu
  promenio, server vraća 409 i ništa ne odobrava.
- Upisi posle AI poziva su uslovni (fencing): brisanje tokom generisanja ostaje brisanje.
- 1 automatski ponovni pokušaj po gostu; posle toga dugme **↻ Ponovi** na tabletu.
- Google 429/503: ponavlja se posle 5/15/30/60 s, ne troši pokušaj ni brojač.
- Dugme **QR za preuzimanje** na tabletu za gosta koji je izgubio stranicu.
- Dnevni limit (`DAILY_LIMIT`) se proverava na serveru, atomično.
- Pauza na tabletu zaustavlja nove goste.
- Brisanje: neodobreno posle 15 min, odbijeno odmah, original 60 min posle
  generisanja, sve ostalo posle 7 dana (cron na 5 min). Gost može sam da obriše
  svoje podatke, a tablet ima dugme „Obriši sve podatke” za kraj eventa.
- Samo 18+ (zahtev Gemini API uslova).

Sav kod za AI je u `src/provider.js`, a prompt u `src/prompt.js`.

## Postavljanje (jednom)

Potrebno: Node 20+, Cloudflare nalog sa **Workers Paid** planom ($5/mes; besplatni
plan ima 10 ms CPU po zahtevu, što nije dovoljno za obradu slika).

```bash
cd gta-booth
npm install
npx wrangler login

# 1. baza i skladište
npx wrangler d1 create gta-booth-db --location eeur   # upisati dobijeni database_id u wrangler.toml (urađeno)
npx wrangler r2 bucket create gta-booth-photos
npx wrangler queues create gta-booth-jobs
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
4. U AI Studiju proveriti limite (RPM/RPD) za `gemini-nano-banana-2.1`; ako su
   ispod ~5 paralelnih zahteva, zatražiti povećanje.
5. U `wrangler.toml`: `PROVIDER = "gemini"`, pa `npm run deploy`.
6. Na tabletu „Režim” pokazuje **UŽIVO**.

Izmena koda ili sličica scena posle postavljanja: `npm run deploy` (u PowerShell-u `npm.cmd run deploy`).

Napomena: budžet u Google Cloud billing-u samo šalje upozorenje i **ne zaustavlja**
trošak. Stvarni limit troška je `DAILY_LIMIT` u aplikaciji.

Povratak u demo: `PROVIDER = "mock"` i ponovo deploy.

## Lokalni rad i testovi

Detaljno uputstvo, uključujući test na pravom telefonu: **`TESTIRANJE.md`**.

```bash
npm run setup:local                          # .dev.vars (PIN 123456) + lokalna baza
npm run dev                                  # http://127.0.0.1:8787
BASE=http://127.0.0.1:8787 PIN=123456 npm run test:e2e
```

Test grešaka i limita (posebni serveri):

```bash
npx wrangler d1 execute gta-booth-db --local --persist-to .wrangler/fail --file=schema.sql
npx wrangler dev --port 8788 --persist-to .wrangler/fail \
  --var MOCK_FAIL:1 --var DAILY_LIMIT:3 --var MOCK_DELAY_MS:300
BASE=http://127.0.0.1:8788 MODE=fail node scripts/e2e-failures.mjs

npx wrangler d1 execute gta-booth-db --local --persist-to .wrangler/t429 --file=schema.sql
npx wrangler dev --port 8790 --persist-to .wrangler/t429 \
  --var MOCK_FAIL:429 --var TRANSIENT_DELAYS_S:1,1,1 --var MOCK_DELAY_MS:200
BASE=http://127.0.0.1:8790 MODE=429 node scripts/e2e-failures.mjs
```

## Na dan eventa (kontrolna lista)

- [ ] Tablet: `/admin.html`, prijavljen, zvuk uključen, punjač
- [ ] Sopstveni 4G ruter za tablet
- [ ] Ring svetlo na štandu (najveći dobitak za prepoznatljivost lica)
- [ ] Odštampan QR (`/qr.html`) i tabla „18+”
- [ ] Režim **UŽIVO**, limit i procena troška vidljivi
- [ ] Probna slika jednog člana tima pre otvaranja
- [ ] Posle eventa: po potrebi „Obriši sve podatke”
