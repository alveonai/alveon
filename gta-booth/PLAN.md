# Foto-štand „Uđi u igru”: plan aplikacije za nezavisnu recenziju

> **Za recenzenta:** ovaj dokument je napisan tako da ne zahteva nikakvo prethodno znanje o eventu ni o aplikaciji. Sve odluke su navedene sa obrazloženjem. Na kraju (odeljak 17) su konkretna pitanja na koja tražimo mišljenje. Kod se nalazi u folderu `gta-booth/` pored ovog fajla. Molimo da budete kritični: cilj je da se nađu greške i rizici **pre** eventa.
>
> Datum dokumenta: 14. 11. 2026. Status: aplikacija napravljena i testirana u demo režimu; pravi AI još nije povezan; nije postavljena na produkciju.

---

## 1. Kontekst eventa

| Stavka | Vrednost |
|---|---|
| Šta | Promotivni štand sa temom akcione „open-world” video igre (interno zvan „GTA event”) |
| Gde | Tržni centar Ušće, Beograd, Srbija |
| Kada | **Sreda, 18. 11. 2026**, jedno veče, do 22h |
| Očekivano | ~200 posetilaca, plan za do **300** |
| Organizator / izvođač | Agencija Alveon (pravi aplikaciju i vodi štand) |
| Publika | Prolaznici u tržnom centru, uključujući porodice sa decom |
| Osoblje | 1–2 osobe na štandu, jedan tablet |

**Ideja:** posetilac se slika, a AI od fotografije napravi ilustraciju u kojoj izgleda kao lik sa „loading screen” postera akcione video igre (stil: naslikana ilustracija, jake konture, zalazak sunca, palme, grad). Posetilac dobija sliku digitalno na svoj telefon. **Nema štampe.**

**Važno o brendu:** aplikacija namerno **ne koristi** ime, logo ni vizuelne elemente bilo koje konkretne igre. Prompt opisuje opšti stil. Da li je sam event licenciran od vlasnika brenda, nije poznato autoru ovog plana (otvoreno pitanje, odeljak 16).

---

## 2. Zahtevi

### Funkcionalni
1. Bez instalacije: gost skenira QR i sve radi u browseru telefona.
2. Gost daje pristanak na telefonu, pre slikanja.
3. Gost se slika svojim telefonom (ili ga slika osoblje njegovim telefonom).
4. **Osoblje odobrava svaku fotografiju na tabletu** pre nego što se pošalje AI-ju.
5. Isti, fiksni prompt za sve.
6. Gost preuzima rezultat na svoj telefon.
7. Kontrola troška: jedna generacija po gostu (+1 automatski ponovni pokušaj samo ako tehnički pukne), dnevni limit.
8. Automatsko brisanje podataka.

### Nefunkcionalni
- Što manje delova koji mogu da puknu; event je za 4 dana.
- Mora da radi na slabom mobilnom signalu u tržnom centru.
- Mora da radi na iPhone (Safari) i Android (Chrome).
- Usklađenost sa srpskim Zakonom o zaštiti podataka o ličnosti (ZZPL, usklađen sa GDPR) i uslovima AI provajdera.
- Mora biti izvodljivo i održivo uz Claude Code (AI asistent za programiranje).

---

## 3. Odluke i obrazloženja (istorija odlučivanja)

### 3.1 Odbačeno: ručni rad preko Claude chata
Prvobitna ideja je bila da se slike ručno ubacuju u Claude chat koji je povezan sa Higgsfield-om. Odbačeno: ručni rad po svakoj slici, nema automatske isporuke gostu, usko grlo pri 200+ ljudi. Claude Code se koristi samo za **izradu** aplikacije; na eventu Claude nije u lancu.

### 3.2 Odbačeno: Higgsfield (higgsfield.ai) kao AI provajder
Agencija ima Higgsfield „Ultra” pretplatu. Pročitani su njihovi uslovi (Terms of Use, ažurirani 23. 10. 2026; Privacy Policy, ažurirana 31. 10. 2026). Nalazi:
- Ne preuzimaju vlasništvo nad slikama (ToU 4.4), **ali**: *„Your Content, Inputs, and Outputs may be used by Company to train, develop, enhance, evolve, and improve its (and its affiliates’) AI models”* (ToU 4.4). Isključenje nije moguće; jedini izuzetak je poseban pisani „Enterprise Agreement”.
- Higgsfield sebe definiše kao **rukovaoca** (controller), ne obrađivača (PP 12.3).
- Korisnik garantuje da ima pristanke svih lica na slikama (ToU 4.2(b), 5.3).
- Obrisan sadržaj ostaje do 30 dana + u rezervnim kopijama (PP 5.9). Podaci idu u SAD, Kazahstan i „throughout the world” (PP 16.1).
- Servis nije namenjen mlađima od 18 (PP 9).
- Agencija navodi da Higgsfield ne odgovara na mejlove, pa Enterprise/DPA nije realan.
- „Ultra” plan je samo viši paket pretplate i **nije** Enterprise ugovor.

**Zaključak:** fotografije prolaznika (potencijalno i dece) završile bi u treniranju tuđih modela bez mogućnosti povlačenja. Neprihvatljivo.

### 3.3 Izabrano: Google Gemini API, plaćeni nivo, model Nano Banana 2.1
Pročitani su „Gemini API Additional Terms of Service” (na snazi od 23. 3. 2026), cenovnik i stranice o logovanju i nadzoru zloupotreba (stanje 13–14. 11. 2026). Nalazi:
- **Plaćeni nivo:** *„Google doesn't use your prompts (including … files such as images…) or responses to improve our products”*. Obrada po *Data Processing Addendum for Products Where Google is a Data Processor*: Google je **obrađivač**, DPA važi automatski.
- „Paid Service” = API pozivi kroz Cloud projekat sa **aktivnim billing nalogom**. Bez billinga je besplatni nivo, gde Google **koristi** podatke.
- **Nadzor zloupotreba (ne može se isključiti):** Google čuva upite, kontekst (uključujući slike) i odgovore **55 dana** samo radi otkrivanja kršenja pravila; ljudski pregled samo ako je sadržaj označen; *„not used to train or fine-tune any AI/ML models besides those used specifically for policy enforcement”*. Podaci mogu biti privremeno u bilo kojoj zemlji gde Google ima infrastrukturu.
- **Logovanje projekta:** za projekte napravljene od 26. 10. 2026 je **uključeno po defaultu** (logovi privatni za projekat, rok 55 dana, podesivo 7/14/28/55). Rešenje: isključiti u AI Studiju **i** slati `store: false` u svakom zahtevu. Logove/datasetove nikad ne deliti sa Googleom (tada ih ljudi pregledaju radi poboljšanja modela).
- **Uzrast (ključno ograničenje):** *„You must be 18 years of age or older to use the APIs. You also will not use the Services as part of a website, application, or other service … that is directed towards or is likely to be accessed by individuals under the age of 18.”* Zato je aplikacija **strogo 18+**, a deca se mogu slikati samo uz scenografiju, bez AI obrade.
- Srbija je na listi podržanih regiona. Komercijalna upotreba dozvoljena („professional or business purposes”).
- **Cena** (`gemini-nano-banana-2.1`, standard, plaćeni nivo): izlazna slika 1K $0.0336, **2K $0.0504**, 4K $0.113; ulaz (fotografija + prompt) zanemarljiv (<$0.001). Za poređenje, starija „Nano Banana 2” (`gemini-3.1-flash-image`) 2K je $0.101. Batch režim je jeftiniji, ali nije u realnom vremenu, pa nije upotrebljiv.

### 3.4 Izabrano: Cloudflare (Workers + D1 + R2) kao hosting
- Agencija ima „Alveon hosting”, ali postojeći repozitorijum sadrži samo statičnu stranicu, a nije poznato da li hosting podržava serverski kod. API ključ **mora** biti na serveru.
- Cloudflare daje server, bazu (D1, SQLite), skladište fajlova (R2), periodične zadatke (cron) i statične fajlove na jednom mestu, kod jednog provajdera; objava jednom komandom (`wrangler deploy`). Domen agencije se može povezati poddomenom.
- Odbačeno: Higgsfield-ov „website builder” (gosti bi morali da se prijave Higgsfield nalogom), klasičan VPS (više održavanja).

### 3.5 Izabrano: odobravanje na tabletu (umesto jednokratnog QR koda po gostu)
Razmatrane opcije:
- **A) Jedan isti QR na štandu + osoblje odobrava svaku fotografiju na tabletu** ← izabrano.
- B) Tablet generiše novi, jednokratni QR za svakog gosta; gost sam generiše (bez pregleda).
- C) Isti QR + ograničenje po telefonu (kolačić): lako se zaobilazi (incognito).
- D) Broj telefona + SMS kod: prikuplja lične podatke i košta.

A je izabrano jer je **odobravanje jedina stvarna provera uzrasta** (zahtev Gemini uslova; kućica „18+” sama nije dovoljna), a uz to filtrira neprikladne slike i slike tuđih ljudi pre nego što bilo šta ode Googleu i pre trošenja. B ne štedi rad osoblja (i dalje jedan klik po gostu) a gubi pregled.

**Predloženo, nije implementirano:** posle odobrenja i gotove slike, gost dobija jedno dugme „Probaj još jednom” (ista, već odobrena fotografija, bez novog odobrenja). Trošak u najgorem slučaju ~2×.

### 3.6 Izabrano: generisanje pokreće tablet, telefon gosta je rezerva
Kada osoblje pritisne ✅, isti HTTP zahtev sa tableta odmah poziva AI i čeka rezultat (tablet UI ne čeka taj zahtev, ostaje slobodan). Razlog: tablet je stalno uključen i na stabilnoj vezi; telefon gosta može biti zaključan ili u džepu. Ako tablet ne preuzme posao u roku od 20 s, telefon gosta (koji ionako proverava status) ga preuzima. Preuzimanje je atomično u bazi, pa samo jedan pokretač može da generiše.

---

## 4. Arhitektura

```
 ┌──────────────┐  HTTPS   ┌────────────────────────────── Cloudflare ─────────────────────────────┐
 │ Telefon gosta│─────────▶│ Worker (src/index.js)                                                  │
 │ (browser)    │◀─────────│  ├─ statični fajlovi: public/ (index.html, admin.html, privatnost.html)│
 └──────────────┘ polling  │  ├─ /api/*  → logika                                                   │
                           │  ├─ D1 (SQLite): sesije, statusi, brojač, podešavanja                  │
 ┌──────────────┐  HTTPS   │  ├─ R2: photos/<id> (original), results/<id> (rezultat)                │
 │ Tablet       │─────────▶│  └─ Cron */5 min: brisanje                                             │
 │ (admin.html) │◀─────────│                                                                        │
 └──────────────┘          └───────────────┬────────────────────────────────────────────────────────┘
                                           │ generateContent (store:false), samo posle ✅
                                           ▼
                               Google Gemini API (plaćeni nivo)
                               model gemini-nano-banana-2.1, 2K, 3:4
```

- **Frontend:** čist HTML/CSS/JavaScript, bez framework-a i bez spoljnih biblioteka (osim QR biblioteke na stranici za štampu, `qr.html`, koja se koristi samo pre eventa).
- **Backend:** jedan Cloudflare Worker (JavaScript, ES moduli), `nodejs_compat` uključen.
- **AI poziv:** zvanični Google SDK `@google/genai` 3.3.0 (izabran jer podržava `store` parametar; REST naziv tog polja nije bio dokumentovan).
- **Komunikacija u realnom vremenu:** polling (telefon na 2.5 s, tablet na 2 s). Namerno bez WebSocket-a radi jednostavnosti.

### Struktura repozitorijuma
```
gta-booth/
  PLAN.md              ← ovaj dokument
  README.md            ← uputstvo za postavljanje i kontrolna lista za event
  wrangler.toml        ← Cloudflare konfiguracija i podešavanja (vars)
  schema.sql           ← šema baze
  package.json         ← zavisnosti: @google/genai 3.3.0, wrangler 4.162.0
  src/index.js         ← sav serverski kod (rute, stanja, brisanje)
  src/provider.js      ← jedino mesto koje zna za AI servis (mock + gemini)
  src/prompt.js        ← fiksni prompt
  public/index.html, guest.js   ← aplikacija za gosta
  public/admin.html, admin.js   ← tablet za osoblje
  public/privatnost.html        ← obaveštenje o privatnosti
  public/qr.html                ← QR za štampu
  public/style.css
  scripts/e2e.mjs, e2e-failures.mjs  ← automatski testovi
```

---

## 5. Tok gosta (telefon)

| # | Ekran | Šta se dešava |
|---|---|---|
| 1 | **Pristanak** | Kratak tekst (AI obrada preko Google Gemini API, nema treniranja, Google može čuvati do 55 dana radi bezbednosti, original se briše najkasnije 60 min posle generisanja, rezultat posle 7 dana, pristanak se može povući; link ka punom obaveštenju). Tri kućice: **„Imam 18 ili više godina”** (obavezno), **„Pristajem na obradu moje fotografije AI alatom”** (obavezno), „Pristajem da se slika objavi na društvenim mrežama organizatora” (opciono). Dugme „Nastavi” je neaktivno dok obe obavezne nisu štiklirane; server ponovo proverava. |
| 2 | **Slikanje** | Saveti (osvetljenje, od struka naviše, jedna osoba). Dugme „Otvori kameru” (`<input type=file accept=image/* capture=user>`, prednja kamera) i „Izaberi iz galerije”. Fotografija se na telefonu umanji na najviše 1600 px po dužoj strani i ponovo kodira u JPEG (kvalitet 0.85), čime se uklanjaju EXIF podaci (lokacija, uređaj). Prikaz pregleda, „Pošalji na odobrenje” / „Slikaj ponovo”. |
| 3 | **Čeka odobrenje** | Veliki kod od 3 znaka (npr. `ETD`) koji gost pokazuje osoblju, pozicija u redu, dugme „Promeni fotografiju”. |
| 4 | **Generisanje** | Animacija i poruke koje se smenjuju (do ~1 min). |
| 5 | **Gotovo** | Slika, dugme „Sačuvaj sliku” (Web Share API sa fajlom ako je podržan, inače preuzimanje), uputstvo „pritisni i drži sliku”. |
| — | Odbijeno | „Fotografija nije odobrena” i dugme „Slikaj ponovo” (ista sesija, nova fotografija). |
| — | Isteklo | Ako niko ne odobri za 15 min: povratak na slikanje uz poruku. |
| — | Greška | „Javi se osoblju, kod XYZ”; ostaje na proveri statusa (osoblje može da ponovi). |
| — | Limit / pauza | Odgovarajuća poruka. |

- Sesija se pamti u URL-u (`/#s=<id>`) i u `localStorage`, pa zatvaranje i ponovno otvaranje stranice vraća gosta u isto stanje.
- Na dnu uvek: „Privatnost” i „Obriši moje podatke” (trenutno brisanje sa servera).
- U demo režimu svuda stoji žuta oznaka **DEMO**.

## 6. Tok osoblja (tablet, `/admin.html`)

1. Prijava PIN-om (6+ cifara). Token se čuva u `localStorage`.
2. Gornja traka: generisano danas / limit, procena troška u USD, broj na čekanju, režim (DEMO / UŽIVO + model), dugmad **Pauziraj**, **Zvuk**, **QR za štand**.
3. **Čekaju odobrenje:** kartice sa fotografijom, velikim kodom, vremenom čekanja, oznakom „OK za mreže” ako je gost pristao, i dugmadima **✅ Generiši** / **❌ Odbij**. Zvučni signal za svaki novi zahtev.
4. **U obradi i gotovo:** poslednjih 40 (sličica rezultata, kod, status, greška, vreme), dugme **↻ Ponovi** za neuspele.
5. Upozorenja: „PAUZIRANO”, „Nema veze sa serverom”.
6. **Kraj eventa:** „Obriši sve podatke” (potvrda upisom reči `OBRISI`) briše sve fotografije, rezultate i zapise.

Operativno: gost kaže kod, osoblje proveri da kod i lice na kartici odgovaraju osobi ispred štanda, da osoba izgleda punoletno i da je na slici samo ona, pa pritisne ✅.

---

## 7. Model podataka (D1 / SQLite)

```sql
sessions(
  id TEXT PK,            -- tajni nasumični ID (18 bajtova, base64url), deo gostovog linka
  code TEXT,             -- 3 znaka iz alfabeta bez sličnih znakova (ACDEFHJKMNPRTUVWXY34679)
  status TEXT,           -- vidi 7.1
  created_at, updated_at, consent_at INTEGER (ms),
  consent_social INTEGER, age_confirmed INTEGER,
  submitted_at INTEGER,  -- kada je fotografija poslata na odobrenje
  photo_key TEXT, result_key TEXT, result_mime TEXT,   -- ključevi u R2
  attempts INTEGER, max_attempts INTEGER (default 2),
  started_at INTEGER, error TEXT)
usage(day TEXT PK /* YYYY-MM-DD po Beogradu */, n INTEGER)   -- broj POKRENUTIH generacija
settings(key PK, value)                                      -- 'paused'
login_attempts(minute PK, n)                                 -- zaštita PIN-a
```
Ne čuvaju se ime, e-mail, telefon, IP adresa ni podaci o uređaju.

### 7.1 Stanja i prelazi

```
created ──upload──▶ pending ──✅──▶ approved ──claim──▶ generating ──ok──▶ done
                       │  ▲                ▲                │
                       │  └─re-upload      │                ├─greška, ima pokušaja ──▶ approved (auto ponovo)
                       ├──❌──▶ rejected ──upload──▶ pending  ├─greška, nema pokušaja ─▶ failed ──↻──▶ approved
                       └──15 min──▶ expired ──upload──▶ pending
                                                             └─dnevni limit ─────────▶ limit ──↻──▶ approved
bilo koje ──gost "Obriši"──▶ deleted (fajlovi obrisani)
```
- **Claim** (atomičan `UPDATE … WHERE`): uspeva samo ako je `status='approved'` (i, za telefon gosta, odobreno pre ≥20 s) **ili** `status='generating'` duže od 150 s (zaglavljeno), i `attempts < max_attempts`, i postoji original. Povećava `attempts`.
- **Dnevni limit** (atomičan): `UPDATE usage SET n=n+1 WHERE day=? AND n < DAILY_LIMIT`; ako ne uspe → `limit`, AI se ne poziva.
- **Ponovi** (tablet): `max_attempts = attempts + 1`, status `approved`, odmah pokreće.
- Pogrešan ključ / 400 / 401 / 403 od Gemini-ja: greška se **ne** ponavlja automatski.

---

## 8. API

Gost (bez autentikacije; ID sesije je tajna):

| Metod | Putanja | Opis |
|---|---|---|
| GET | `/api/config` | Javna podešavanja (rukovalac, kontakt, rokovi, demo, pauza) |
| POST | `/api/sessions` | `{age:true, consent:true, social:bool}` → `{id, code}`; 400 bez obaveznih; 503 ako je pauza |
| GET | `/api/s/:id` | Status, kod, pozicija u redu, greška; lenjo ističe stare `pending` |
| POST | `/api/s/:id/photo` | Telo `image/jpeg`, 1 KB–6 MB, mora počinjati sa `FF D8`; samo u `created/pending/rejected/expired`; 503 ako je red pun (40) ili pauza |
| POST | `/api/s/:id/generate` | Rezervni pokretač (vidi 3.6) |
| GET | `/api/s/:id/result` | Rezultat (samo kad je `done`) |
| DELETE | `/api/s/:id` | Gost povlači pristanak: brisanje fajlova, status `deleted` |

Tablet (`Authorization: Bearer <token>`):

| Metod | Putanja | Opis |
|---|---|---|
| POST | `/api/admin/login` | `{pin}` → token; >10 pokušaja/min → 429 |
| GET | `/api/admin/queue` | Na čekanju, poslednji, statistika |
| GET | `/api/admin/s/:id/photo` / `result` | Slike za prikaz |
| POST | `/api/admin/s/:id/approve` | Odobri i **odmah generiši** (zahtev traje dok AI ne završi) |
| POST | `/api/admin/s/:id/reject` | Odbij; original se briše odmah |
| POST | `/api/admin/s/:id/retry` | Još jedan pokušaj za `failed`/`limit` |
| POST | `/api/admin/pause` | `{paused:bool}` |
| POST | `/api/admin/purge` | `{confirm:"OBRISI"}`: briše sve |

---

## 9. Generisanje slike

- Model: `gemini-nano-banana-2.1`, `responseModalities: ['IMAGE']`, `imageConfig: { aspectRatio: '3:4', imageSize: '2K' }`, **`store: false`**, timeout 90 s (AbortController).
- Ulaz: tekst prompta + fotografija kao `inlineData` (JPEG, base64).
- Ako odgovor nema sliku (bezbednosni filter i sl.): greška sa razlogom (`blockReason` / `finishReason`), uz automatski ponovni pokušaj.
- Rezultat se čuva u R2 i servira gostu sa našeg domena (gost nikad ne komunicira direktno sa Googleom).

**Prompt** (`src/prompt.js`, doslovno):
```
Transform the person in this photo into a stylized illustration in the style of a classic open-world crime-action video game loading screen.

Style: bold hand-painted digital illustration, strong clean ink outlines, cel-shaded skin with crisp highlights, slightly exaggerated confident pose, saturated sunset color palette (orange, magenta, purple sky), palm trees and a sunny coastal city skyline in the background, subtle halftone texture, poster composition, vertical framing from the waist up.

Keep the person clearly recognizable: same face, facial features, skin tone, hairstyle, hair color, glasses, facial hair and the same clothing and colors. Keep the same number of people. Do not change age, gender or body type.

Do not add any text, letters, logos, watermarks, weapons, drugs, alcohol or violence.
```
Prompt još **nije testiran** na pravom modelu (nema API ključa). Plan: 5–10 fotografija različitih ljudi i osvetljenja, pa zaključavanje prompta.

**Demo režim** (`PROVIDER="mock"`): posle 4 s vraća originalnu fotografiju; ništa ne troši. `MOCK_FAIL="1"` simulira grešku (samo za testove).

---

## 10. Bezbednost

- Gemini ključ i PIN su Cloudflare „secrets”, nikad u kodu ni u browseru.
- Sesija gosta: 144-bitni nasumični ID (nepogodiv). Bez njega nema pristupa slici.
- Admin token = HMAC-SHA256(PIN, fiksni string); poređenje u konstantnom vremenu. Token ne ističe; za opoziv treba promeniti PIN.
- Zaštita PIN-a: najviše 10 pokušaja u minuti (globalno, ne po IP-u).
- Upload: proverava tip, veličinu i JPEG zaglavlje; telo se ne parsira na serveru.
- Validacija ID-a regularnim izrazom (sprečava putanje tipa `../`).
- Sav HTML se gradi preko `textContent` (bez umetanja korisničkog teksta kao HTML).
- `noindex` na svim stranicama.

---

## 11. Privatnost i usklađenost

**Rukovalac:** agencija (naziv i e-mail se upisuju u `wrangler.toml` pre eventa). **Obrađivači:** Google (Gemini API, plaćeni nivo, DPA), Cloudflare (hosting/skladište). **Pravni osnov:** pristanak.

| Podatak | Gde | Rok |
|---|---|---|
| Neodobrena fotografija | R2 | najviše 15 min |
| Odbijena fotografija | R2 | briše se odmah |
| Original posle generisanja | R2 | najviše 60 min (+ do 5 min do cron-a) |
| Rezultat | R2 | 7 dana |
| Zapis o pristanku (vreme, 18+, mreže) | D1 | 7 dana |
| Kopija kod Google-a (nadzor zloupotreba) | Google | do 55 dana, ne može se isključiti |
| Logovi Gemini projekta | Google | **isključiti** u AI Studiju + `store:false` |

- Gost može sam trenutno obrisati sve podatke („Obriši moje podatke”).
- Na kraju eventa osoblje može obrisati sve.
- Puno obaveštenje: `public/privatnost.html` (rukovalac, svrha, primaoci, prenos van Srbije, rokovi, prava, Poverenik). **Mora ga pregledati pravnik.**
- 18+: kućica + vizuelna provera osoblja + tabla „18+” na štandu i na QR posteru.

---

## 12. Troškovi

| Stavka | Iznos |
|---|---|
| Gemini, 300 gostiju × $0.0504 (2K) | $15.12 |
| Rezerva 20% (ponovni pokušaji) | ~$3 |
| Testiranje prompta | ~$3 |
| **Ukupno Gemini** | **~$21** (preporuka: budžet/limit $30 na Google nalogu) |
| Cloudflare | Besplatno ili $5/mesec (vidi rizik R1) |

Ako se doda „Probaj još jednom”: najviše ~$36 za Gemini.

---

## 13. Konfiguracija (`wrangler.toml` → `[vars]`)

| Promenljiva | Vrednost | Značenje |
|---|---|---|
| PROVIDER | `mock` → `gemini` | Demo ili pravo generisanje |
| GEMINI_MODEL | `gemini-nano-banana-2.1` | |
| IMAGE_SIZE / ASPECT_RATIO | `2K` / `3:4` | |
| DAILY_LIMIT | 360 | Generacija po danu (Beograd) |
| COST_PER_IMAGE_USD | 0.0504 | Samo za prikaz |
| MAX_ATTEMPTS | 2 | 1 + 1 automatski |
| MAX_PENDING | 40 | Najviše na čekanju |
| PENDING_TTL_MIN / ORIGINAL_TTL_MIN / RETENTION_DAYS | 15 / 60 / 7 | Rokovi brisanja |
| CONTROLLER_NAME / CONTACT_EMAIL | popuniti | Za obaveštenje |
| Secrets | `ADMIN_PIN`, `GEMINI_API_KEY` | `wrangler secret put` |

---

## 14. Testiranje: šta je urađeno

Lokalno (`wrangler dev`, Cloudflare runtime „workerd” sa lokalnim D1/R2):

1. **`scripts/e2e.mjs`: 44/44 provera prolazi.** Pristanak (odbijanje bez 18+/pristanka), validacija upload-a, auth tableta (bez prijave, pogrešan PIN, lažni token), red i kod, odobravanje i generisanje, dvostruko odobravanje (409), preuzimanje rezultata, brojač i trošak, zabrana ponovnog upload-a/generisanja posle gotovog, odbijanje i brisanje originala, nova fotografija posle odbijanja, pozicija u redu, pauza, brisanje na zahtev gosta, nevažeći ID.
2. **`scripts/e2e-failures.mjs`: 9/9.** Greška → automatski ponovni pokušaj → `failed`, „Ponovi” sa tableta, dnevni limit (posle limita se ništa ne poziva i brojač ne raste).
3. **Pravi Gemini poziv sa lažnim ključem:** Googleov server je odgovorio „API key not valid”. Time je potvrđeno da se SDK učitava u Cloudflare runtime-u i da zahtev stiže do API-ja. Greška ključa nije automatski ponavljana.
4. **Browser test (Playwright):** emuliran iPhone 13 (gost) i tablet: ceo tok od pristanka do sačuvane slike, bez JavaScript grešaka; posle osvežavanja gost ostaje na rezultatu.

**Nije testirano:**
- pravo generisanje (kvalitet, prepoznatljivost lica, trajanje, bezbednosni filteri),
- pravi telefoni (iOS Safari, Android Chrome, ugrađeni browseri skenera QR koda),
- produkcijski Cloudflare (CPU limiti, cron, domen),
- rad pod opterećenjem (više paralelnih generisanja),
- isticanje i čišćenje kroz stvarni cron (logika postoji, cron nije pokrenut u testu).

---

## 15. Poznati rizici i slabosti (samokritika)

| # | Rizik | Procena / ublažavanje |
|---|---|---|
| R1 | **CPU limit Cloudflare Workers besplatnog plana (10 ms po zahtevu).** Base64 kodiranje fotografije (~0.5–1 MB) i dekodiranje 2K rezultata (nekoliko MB base64) verovatno prelaze 10 ms. | **Preporuka: Workers Paid ($5/mes, 30 s CPU).** Mora se proveriti na produkciji pre eventa. |
| R2 | Zahtev tableta traje dok AI ne završi (do ~3×90 s). Ako tablet izgubi vezu, Worker zahtev može biti prekinut; status ostaje `generating` dok ne prođe 150 s, pa ga preuzme telefon gosta. | Gost čeka duže, a brojač se može uvećati dva puta za istu osobu. Prihvatljivo, ali vredi mišljenje (alternativa: Cloudflare Queues / Durable Objects). |
| R3 | Brojač troška računa **pokrenute** pozive, uključujući neuspele. | Procena je konzervativna (precenjuje). |
| R4 | Uslov Gemini-ja „likely to be accessed by individuals under 18”: javni QR u tržnom centru mogu da skeniraju i maloletnici. | Kućica + odobravanje + tabla 18+. Pravnik treba da potvrdi da je dovoljno. |
| R5 | Bezbednosni filteri modela mogu odbiti neke fotografije (npr. ako izgleda kao da je osoba mlada). | Automatski ponovni pokušaj; poruka osoblju. Proveriti na test slikama. |
| R6 | Kvalitet i prepoznatljivost lica nisu provereni. | Test prompta pre eventa. |
| R7 | Signal u tržnom centru. | Smanjivanje slike na telefonu; sopstveni 4G ruter za tablet. |
| R8 | Ugrađeni browseri aplikacija za QR (Instagram, neki Android skeneri) imaju probleme sa kamerom ili preuzimanjem. | Uputstvo „pritisni i drži”; testirati na stvarnim uređajima. |
| R9 | HEIC fotografije iz iPhone galerije. | Safari obično konvertuje u JPEG; postoji poruka greške ako dekodiranje ne uspe. Netestirano. |
| R10 | Admin token ne ističe i nije vezan za uređaj. | Promena PIN-a ga poništava. |
| R11 | Ograničenje pokušaja prijave je globalno: napadač može privremeno blokirati prijavu osoblja. | Malo verovatno za jedno veče. |
| R12 | Nova fotografija dok gost čeka pomera ga na kraj reda. | Namerno jednostavno. |
| R13 | Nema serverske provere da je na slici jedna punoletna osoba; oslanja se na osoblje. | Svesna odluka. |
| R14 | „Obriši sve podatke” je nepovratno. | Potvrda upisom reči. |
| R15 | Rukovanje brendom/zaštićenim znakom igre i pravo na korišćenje teme. | Aplikacija ne koristi ime ni logo; licenca eventa nepoznata. |
| R16 | Rok: 4 dana, uključujući vikend. | Rezervni plan: ručno generisanje na štandu. |
| R17 | Kod trenutno nije na GitHub-u (Claude nema push pristup repozitorijumu agencije). | Lokalni commit i zip postoje; rešava agencija. |

---

## 16. Otvorena pitanja (za agenciju / pravnika)

1. Da li je event licenciran od vlasnika brenda igre i da li se sme koristiti ime igre u komunikaciji?
2. Ko je rukovalac podacima: agencija ili naručilac (tržni centar / brend)? Da li treba ugovor o obradi između njih?
3. Da li su tekst pristanka i obaveštenje dovoljni po ZZPL-u (posebno prenos van Srbije i rok od 55 dana kod Google-a)?
4. Da li je mera 18+ (kućica + vizuelna provera + tabla) dovoljna za Gemini uslove?
5. Da li dodati „Probaj još jednom” za gosta?
6. Domen (`gta.<domen>`) i Cloudflare nalog: ko otvara i ko ima pristup?

---

## 17. Pitanja za recenzenta

Molimo konkretne odgovore, sa predlogom izmene gde je moguće:

1. **Arhitektura:** da li je Cloudflare Workers + D1 + R2 dobar izbor za ovaj obim (300 korisnika, jedno veče)? Da li je R1 (CPU limit) stvaran problem i da li je Workers Paid dovoljan?
2. **Dugi zahtev (R2):** da li je pokretanje generisanja u okviru HTTP zahteva tableta prihvatljivo, ili bi trebalo Queues / Durable Objects / `waitUntil`? Šta je najjednostavnije pouzdano rešenje?
3. **Stanja (7.1):** vidite li stanje u koje sesija može da se zaglavi, ili trku (race) koja može da dovede do duplog troška ili izgubljene slike?
4. **Bezbednost (10):** da li je model „tajni ID u linku” dovoljan za gosta, a HMAC(PIN) token za tablet? Šta biste minimalno popravili za jedno veče?
5. **Privatnost (11, 3.3):** da li je izbor Gemini plaćenog nivoa i ovakav pristanak razuman? Da li nešto nedostaje u obaveštenju?
6. **Mobilni browseri:** poznati problemi sa `capture="user"`, Web Share API sa fajlovima, HEIC, ugrađenim browserima?
7. **Prompt (9):** sugestije za bolju prepoznatljivost lica i manje odbijanja od bezbednosnih filtera?
8. **Operativa:** da li je tok „gost pokaže kod → osoblje pritisne ✅” dovoljno brz za ~300 ljudi u nekoliko sati (procena: 5–10 s po osobi za osoblje + 20–60 s generisanja u pozadini)?
9. **Šta biste izbacili** da smanjite rizik, i **šta nedostaje** što je neophodno za event?
10. Bilo šta što smo propustili.

---

## 18. Vremenski plan

| Dan | Zadaci |
|---|---|
| Pet 13. 11. | Odluke (provajder, arhitektura) |
| Sub 14. 11. | ✅ Aplikacija napravljena i testirana u demo režimu; ovaj plan; nezavisna recenzija |
| Ned 15. 11. | Cloudflare nalog i postavljanje; Google projekat sa billingom, logovanje isključeno, ključ; test prompta |
| Pon 16. 11. | Test na pravim telefonima (iOS + Android), 10–20 ljudi zaredom; pravnik pregleda tekstove; domen |
| Uto 17. 11. | Proba u tržnom centru (signal, svetlo, QR); zaključavanje koda uveče |
| Sre 18. 11. | Event |

**Rezervni plan:** ako aplikacija nije stabilna do ponedeljka uveče, osoblje ručno generiše slike i deli ih gostima.
