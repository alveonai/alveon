# Lokalno testiranje (na vašem računaru)

Sve radi na vašem računaru, bez Cloudflare naloga i bez Google ključa (demo režim:
umesto AI slike vraća se originalna fotografija, ništa se ne plaća).

## 1. Jednom: priprema

1. Instalirajte **Node.js 20 ili noviji** (LTS) sa https://nodejs.org.
2. Raspakujte projekat (zip) ili klonirajte git paket:
   `git clone alveon.bundle alveon` (pa `cd alveon`).
3. U terminalu uđite u folder aplikacije i instalirajte:

```bash
cd gta-booth
npm install
npm run setup:local
```

`setup:local` pravi `.dev.vars` (lokalni PIN je **123456**) i lokalnu bazu.

## 2. Pokretanje

```bash
npm run dev
```

Kad piše `Ready on http://localhost:8787`, otvorite dva prozora u browseru:

| Prozor | Adresa | Uloga |
|---|---|---|
| 1 | http://localhost:8787 | gost (najbolje u režimu telefona: F12 → ikonica telefona) |
| 2 | http://localhost:8787/admin.html | tablet, PIN `123456` |

**Šta probati:**
- [ ] Gost: bez obe kućice dugme „Nastavi” ne radi
- [ ] Gost: izaberite sliku iz galerije, pošaljite, zapamtite kod (npr. `ETD`)
- [ ] Tablet: pojavi se kartica sa istim kodom i zvukom
- [ ] Gost pošalje drugu fotografiju dok kartica stoji: kartica se osveži; ✅ uvek ide za prikazanu fotografiju
- [ ] Tablet ✅: gost vidi „Pravimo tvoj lik…”, pa sliku posle ~4 s
- [ ] Gost: „Sačuvaj sliku”, osvežavanje stranice (ostaje na slici)
- [ ] Tablet: „QR za preuzimanje” kod gotove slike
- [ ] Tablet ❌: gost vidi „Fotografija nije odobrena” i može ponovo
- [ ] Tablet „Pauziraj”: novi gost ne može da počne
- [ ] Gost „Obriši moje podatke”
- [ ] Tablet „Obriši sve podatke” (upisati OBRISI)
- [ ] `http://localhost:8787/qr.html`: QR za štampu
- [ ] `http://localhost:8787/privatnost.html`: obaveštenje

## 3. Na pravom telefonu

**Ista Wi-Fi mreža (najbrže):**

```bash
npm run dev:lan
```

Na telefonu otvorite `http://<IP-računara>:8787` (IP: Windows `ipconfig`, Mac
`ipconfig getifaddr en0`). Kamera radi. Napomena: preko `http://` telefon ne nudi
„Podeli/Sačuvaj” meni, pa se slika čuva preuzimanjem ili sa „pritisni i drži”.

**Pravi HTTPS kao na eventu:** instalirajte Cloudflare-ov alat `cloudflared`
(https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/),
pa pored `npm run dev` pokrenite:

```bash
cloudflared tunnel --url http://localhost:8787
```

Dobijate privremenu `https://….trycloudflare.com` adresu koja radi na svakom
telefonu, i preko mobilnog interneta. Ugasite je kad završite (Ctrl+C).

Probati na: iPhone (Safari), Android (Chrome), skeniranje QR-a iPhone kamerom,
Google Lens, i otvaranje linka iz Instagrama.

## 4. Automatski testovi

Dok `npm run dev` radi, u drugom terminalu:

```bash
BASE=http://127.0.0.1:8787 PIN=123456 npm run test:e2e
```

Očekivano: `57 prošlo, 0 palo`. (Windows PowerShell:
`$env:BASE="http://127.0.0.1:8787"; $env:PIN="123456"; npm run test:e2e`)

Testovi grešaka, limita i Google 429 su u `README.md`.

## 5. Pravi AI lokalno (troši novac, ~$0.05 po slici)

Kad dobijete Google ključ (projekat sa billingom, logovanje isključeno):

1. U `.dev.vars` dodajte red `GEMINI_API_KEY=vaš-ključ`.
2. Pokrenite: `npx wrangler dev --var PROVIDER:gemini`
3. Tablet tada pokazuje režim **UŽIVO**.

Ovo je način da se testira prompt pre postavljanja na Cloudflare.

## Ispočetka

Obrišite folder `.wrangler` u `gta-booth` i ponovo pokrenite `npm run setup:local`.
