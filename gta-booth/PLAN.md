# Foto-štand „Uđi u igru”: plan aplikacije za nezavisnu recenziju

> **Za recenzenta:** ovaj dokument je napisan tako da ne zahteva nikakvo prethodno znanje o eventu ni o aplikaciji. Sve odluke su navedene sa obrazloženjem. Na kraju (odeljak 17) su konkretna pitanja na koja tražimo mišljenje. Kod se nalazi u folderu `gta-booth/` pored ovog fajla. Molimo da budete kritični: cilj je da se nađu greške i rizici **pre** eventa.
>
> Datum dokumenta: 14. 11. 2026, **verzija 2** (posle prve nezavisne recenzije). Status: aplikacija napravljena i testirana u demo režimu; pravi AI još nije povezan; nije postavljena na produkciju.

---

## 0. Promene posle prve recenzije (v2)

Recenzent je video samo plan. Svaka stavka je proverena u kodu pre izmene.

| # | Nalaz recenzenta | Ocena | Šta je urađeno |
|---|---|---|---|
| 1 | Gost može da zameni fotografiju dok je osoblje gleda; ✅ bi poslao fotografiju koju niko nije video | **Tačno, kritično** (ključ je bio uvek `photos/<id>`, odobravanje ga nije proveravalo) | Svaka fotografija ima svoj ključ (verziju). Tablet šalje ključ koji je video; `approve`/`reject` su atomični `UPDATE … AND photo_key=?`, inače **409 „Fotografija je promenjena”**. Tablet učitava sliku samo za tu verziju. Testirano. |
| 2 | Brisanje (gost ili „Obriši sve”) tokom generisanja: rezultat se ipak upiše | **Tačno, kritično** (upis `done` nije bio uslovljen) | Svi upisi posle AI poziva su uslovljeni „fencing” tokenom (`status='generating' AND attempts=? AND started_at=?`). Ako upis ne prođe, upravo snimljen rezultat se odmah briše. `purge` prvo briše bazu, pa fajlove. Testirano za oba slučaja, uz proveru direktno u R2. |
| 3 | Gemini limiti (429/503) i budžet koji ne zaustavlja trošak | **Tačno** (429 je trošio jedini ponovni pokušaj bez pauze; Google budžet samo upozorava) | 429/503 se ponavljaju posle 5/15/30/60 s, **ne troše** pokušaj i ne ulaze u brojač; posle toga `failed` sa porukom „Google je preopterećen”. Najviše 3 paralelna generisanja. Plan ispravljen: stvarni limit troška je `DAILY_LIMIT`. Provera limita u AI Studiju dodata u nedelju. Testirano. |
| 4 | Kućica „OK za mreže” nema tok podataka ni dugoročni dokaz pristanka | **Tačno** | **Odluka agencije: nema objave na mrežama, samo preuzimanje.** Kućica je isključena (`SOCIAL_CONSENT_ENABLED="0"`), obaveštenje kaže da se slike ne objavljuju (3.7). |
| 5 | Generisanje u HTTP zahtevu tableta je krhko; `waitUntil` nije rešenje | **Tačno** | Uvedeni **Cloudflare Queues**: ✅ samo upiše posao i odmah vrati odgovor; consumer generiše nezavisno od tableta i telefona. Rezervni pokretač sa telefona gosta **uklonjen**. Cron na 5 min ponovo šalje u red zaglavljene poslove. Testirano lokalno. |
| 6.1 | Web Share na iOS-u mora biti u samom kliku | **Već rešeno** | Slika se preuzima kao `Blob` čim je status `done`, pre klika; u kliku se odmah poziva `share` bez čekanja mreže. |
| 6.2 | Uputstvo „pritisni i drži” odmah, ne kao rezerva | **Delimično** (bilo je uvek vidljivo, ali kao „ako ne radi”) | Tekst preformulisan kao ravnopravna opcija („Ili: pritisni i drži…”). „Otvori u browseru” nije dodato (nema pouzdanog načina u svim ugrađenim browserima). |
| 6.3 | Izgubljen link | **Tačno, korisno** | Na tabletu dugme **„QR za preuzimanje”** za svaki gotov rezultat (QR na `/#s=<id>`). QR biblioteka je u projektu, bez CDN-a. Testirano. |
| 6.4 | Format 9:16 za story | **Odluka agencije: isti format kao ulazna fotografija** | Telefon šalje dimenzije fotografije, server bira najbliži format koji Gemini podržava i zadaje ga u `imageConfig.aspectRatio`; prompt to dodatno traži. Testirano. |
| 7 | Prompt: bez reči „crime”, očuvanje lica na početak; test na 10–20 slika; ring svetlo | **Razumno** | Prompt izmenjen. Kriterijumi testa i ring svetlo dodati u plan. |

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
- **Limiti poziva (RPM/RPD):** novi projekat sa billingom počinje na najnižem nivou; tačni limiti za ovaj model **još nisu provereni** (proverava se u AI Studiju u nedelju, čim postoji ključ; ako su ispod ~5 paralelnih zahteva, odmah se traži povećanje). Aplikacija ionako šalje najviše 3 paralelna zahteva i 429/503 obrađuje sa pauzama.
- **Budžet:** budžet u Google Cloud billing-u **samo šalje upozorenje i ne zaustavlja trošak**. Stvarni limit troška je `DAILY_LIMIT` u aplikaciji; Google budžet se postavlja samo kao upozorenje.
- **Cena** (`gemini-nano-banana-2.1`, standard, plaćeni nivo): izlazna slika 1K $0.0336, **2K $0.0504**, 4K $0.113; ulaz (fotografija + prompt) zanemarljiv (<$0.001). Za poređenje, starija „Nano Banana 2” (`gemini-3.1-flash-image`) 2K je $0.101. Batch režim je jeftiniji, ali nije u realnom vremenu, pa nije upotrebljiv.

### 3.4 Izabrano: Cloudflare (Workers + D1 + R2) kao hosting
- Agencija ima „Alveon hosting”, ali postojeći repozitorijum sadrži samo statičnu stranicu, a nije poznato da li hosting podržava serverski kod. API ključ **mora** biti na serveru.
- Cloudflare daje server, bazu (D1, SQLite), skladište fajlova (R2), red poslova (Queues), periodične zadatke (cron) i statične fajlove na jednom mestu, kod jednog provajdera; objava jednom komandom (`wrangler deploy`). Domen agencije se može povezati poddomenom.
- **Workers Paid** plan ($5/mes), **potvrđeno od agencije**: besplatni plan ima 10 ms CPU po zahtevu, što nije dovoljno za kodiranje/dekodiranje slika od nekoliko MB.
- Odbačeno: Higgsfield-ov „website builder” (gosti bi morali da se prijave Higgsfield nalogom), klasičan VPS (više održavanja).

### 3.5 Izabrano: odobravanje na tabletu (umesto jednokratnog QR koda po gostu)
Razmatrane opcije:
- **A) Jedan isti QR na štandu + osoblje odobrava svaku fotografiju na tabletu** ← izabrano.
- B) Tablet generiše novi, jednokratni QR za svakog gosta; gost sam generiše (bez pregleda).
- C) Isti QR + ograničenje po telefonu (kolačić): lako se zaobilazi (incognito).
- D) Broj telefona + SMS kod: prikuplja lične podatke i košta.

A je izabrano jer je **odobravanje jedina stvarna provera uzrasta** (zahtev Gemini uslova; kućica „18+” sama nije dovoljna), a uz to filtrira neprikladne slike i slike tuđih ljudi pre nego što bilo šta ode Googleu i pre trošenja. B ne štedi rad osoblja (i dalje jedan klik po gostu) a gubi pregled.

**Predloženo, nije implementirano:** posle odobrenja i gotove slike, gost dobija jedno dugme „Probaj još jednom” (ista, već odobrena fotografija, bez novog odobrenja). Trošak u najgorem slučaju ~2×.

### 3.6 Izabrano: generisanje preko reda poslova (Cloudflare Queues)
*(v1: generisanje se izvršavalo u HTTP zahtevu tableta, sa telefonom gosta kao rezervom. Promenjeno posle recenzije.)*

- ✅ na tabletu atomično prebaci sesiju u `approved` i upiše poruku `{id}` u red `gta-booth-jobs`, pa **odmah** vrati odgovor.
- Consumer (`queue()` u istom Workeru) preuzima posao, generiše i upisuje rezultat. Ne zavisi od veze tableta ni telefona; ima do 15 min vremena po poslu.
- `max_concurrency = 3`: najviše 3 istovremena poziva ka Google-u (zaštita od 429).
- `max_batch_size = 1`: svaki posao se obrađuje odmah, pojedinačno.
- Ponavljanja: obična greška → ponovo za 2 s (troši pokušaj); 429/503 → posle 5/15/30/60 s (ne troši pokušaj).
- Zaštitna mreža: cron na 5 min ponovo šalje u red sesije koje su `approved` duže od 2 min ili `generating` duže od 3 min.
- Duplirane poruke su bezopasne: preuzimanje posla je atomično, a svi upisi uslovljeni (7.1).

### 3.7 Odlučeno: bez objave na društvenim mrežama (samo preuzimanje)
Kućica je u v1 postojala, ali bez toka: nema izvoza slika za agenciju, a zapis o pristanku se briše posle 7 dana, iako objava ostaje trajno (rukovalac mora moći da dokaže pristanak dok je slika objavljena). Agencija je odlučila: **nema objave, gost samo preuzima sliku.** Kućica je isključena (`SOCIAL_CONSENT_ENABLED="0"`), a obaveštenje kaže da se slike ne objavljuju. Ako bi se odluka ikad promenila, potrebno je: izvoz slika sa `consent_social=1` na tabletu, čuvanje zapisa o pristanku dok je slika objavljena, dopuna obaveštenja i način povlačenja pristanka za objavu.

---

## 4. Arhitektura

```
 ┌──────────────┐  HTTPS   ┌────────────────────────────── Cloudflare ──────────────────────────────┐
 │ Telefon gosta│─────────▶│ Worker (src/index.js)                                                   │
 │ (browser)    │◀─────────│  ├─ statični fajlovi: public/                                           │
 └──────────────┘ polling  │  ├─ fetch(): /api/*  → logika                                           │
                           │  ├─ D1 (SQLite): sesije, statusi, brojač, podešavanja                   │
 ┌──────────────┐  HTTPS   │  ├─ R2: photos/<id>/<verzija> (original), results/<id>/<pokušaj>        │
 │ Tablet       │─────────▶│  ├─ Queue gta-booth-jobs ◀── ✅ (approve/retry, cron)                    │
 │ (admin.html) │◀─────────│  ├─ queue(): consumer, max 3 paralelno ──┐                              │
 └──────────────┘          │  └─ scheduled(): cron */5 min (brisanje, │ ponovno slanje zaglavljenih) │
                           └──────────────────────────────────────────┼──────────────────────────────┘
                                                                      │ generateContent (store:false)
                                                                      ▼
                                                  Google Gemini API (plaćeni nivo)
                                                  model gemini-nano-banana-2.1, 2K, 3:4
```

- **Frontend:** čist HTML/CSS/JavaScript, bez framework-a. Jedina biblioteka je `qrcode-generator` 2.0.4 (MIT), smeštena u projekat (`public/vendor/`), bez CDN-a.
- **Backend:** jedan Cloudflare Worker (JavaScript, ES moduli), `nodejs_compat` uključen.
- **AI poziv:** zvanični Google SDK `@google/genai` 3.3.0 (izabran jer podržava `store` parametar; REST naziv tog polja nije bio dokumentovan).
- **Komunikacija u realnom vremenu:** polling (telefon na 2.5 s, tablet na 2 s). Namerno bez WebSocket-a radi jednostavnosti.

### Struktura repozitorijuma
```
gta-booth/
  PLAN.md              ← ovaj dokument
  README.md            ← uputstvo za postavljanje i kontrolna lista za event
  TESTIRANJE.md        ← lokalno testiranje korak po korak
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
  public/vendor/qrcode.js       ← QR biblioteka (MIT)
  public/style.css
  scripts/e2e.mjs, e2e-failures.mjs  ← automatski testovi
```

---

## 5. Tok gosta (telefon)

| # | Ekran | Šta se dešava |
|---|---|---|
| 1 | **Pristanak** | Kratak tekst (AI obrada preko Google Gemini API, nema treniranja, Google može čuvati do 55 dana radi bezbednosti, original se briše najkasnije 60 min posle generisanja, rezultat posle 7 dana, pristanak se može povući; link ka punom obaveštenju). Dve kućice: **„Imam 18 ili više godina”** (obavezno) i **„Pristajem na obradu moje fotografije AI alatom”** (obavezno). Treća, za objavu na mrežama, postoji u kodu ali je isključena (3.7). Dugme „Nastavi” je neaktivno dok obe obavezne nisu štiklirane; server ponovo proverava. |
| 1a | **Izbor scene** (od 17. 11.) | 14 scena u tri grupe (dokument agencije, vidi 9.1): polje sa slikom (`/scene/<id>.jpg`; dok slika ne postoji, obojeno polje sa brojem), naziv, oznaka „uspravna/položena”, a za scene sa više likova „ti + izmišljeni partner/ekipa”. Dodir na scenu vodi na slikanje. Izbor se pamti u `localStorage` do slanja. |
| 2 | **Slikanje** | Na vrhu izabrana scena i dugme „Promeni”. Saveti iz dokumenta (pravo u kameru, dobro svetlo, bez naočara i kape, lice zauzima dobar deo kadra, jedna osoba). Dugme „Otvori kameru” (`<input type=file accept=image/* capture=user>`, prednja kamera) i „Izaberi iz galerije”. Fotografija se na telefonu umanji na najviše 1600 px po dužoj strani i ponovo kodira u JPEG (kvalitet 0.85), čime se uklanjaju EXIF podaci (lokacija, uređaj). Prikaz pregleda, „Pošalji na odobrenje” / „Slikaj ponovo”. |
| 3 | **Čeka odobrenje** | Veliki kod od 3 znaka (npr. `ETD`) koji gost pokazuje osoblju, naziv scene, pozicija u redu, dugme „Promeni fotografiju”. |
| 4 | **Generisanje** | Animacija i poruke koje se smenjuju (do ~1 min). |
| 5 | **Gotovo** | Slika, dugme „Sačuvaj sliku” (Web Share API sa fajlom, slika je već preuzeta pre klika; inače preuzimanje) i ravnopravno uputstvo „Ili: pritisni i drži sliku”. Napomena da osoblje može ponovo pokazati QR za preuzimanje. |
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
3. **Čekaju odobrenje:** kartice sa fotografijom, velikim kodom, vremenom čekanja i dugmadima **✅ Generiši** / **❌ Odbij**. Zvučni signal za svaki novi zahtev. Ako gost pošalje novu fotografiju, kartica se osvežava i ponovo istakne; ✅/❌ uvek šalju verziju fotografije koja je prikazana (409 ako je zastarela).
4. **U obradi i gotovo:** poslednjih 40 (sličica rezultata, kod, status, greška, vreme), dugme **↻ Ponovi** za neuspele i **▦ QR za preuzimanje** za gotove (gost skenira i vraća se na svoju sliku).
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
  consent_social INTEGER /* uvek 0 dok je 3.7 isključeno */, age_confirmed INTEGER,
  submitted_at INTEGER,  -- kada je fotografija poslata na odobrenje
  photo_key TEXT,        -- R2 ključ sa verzijom: photos/<id>/<vreme>-<nasumično>
  photo_aspect TEXT,     -- format fotografije (npr. "3:4"); koristi se samo ako scena nema svoj format
  scene TEXT,            -- izabrana scena (src/scenes.js, "01".."15"); NULL = podrazumevani prompt (migrations/0002_scene.sql za staru bazu)
  result_key TEXT,       -- results/<id>/<broj pokušaja>
  result_mime TEXT,
  attempts INTEGER, max_attempts INTEGER (default 2),
  started_at INTEGER, error TEXT)
usage(day TEXT PK /* YYYY-MM-DD po Beogradu */, n INTEGER)   -- broj POKRENUTIH generacija
settings(key PK, value)                                      -- 'paused'
login_attempts(minute PK, n)                                 -- zaštita PIN-a
```
Ne čuvaju se ime, e-mail, telefon, IP adresa ni podaci o uređaju.

### 7.1 Stanja i prelazi

```
created ──upload──▶ pending ──✅(ista verzija)──▶ approved ──red/claim──▶ generating ──ok──▶ done
                       │  ▲                ▲                │
                       │  └─re-upload      │                ├─greška, ima pokušaja ──▶ approved (auto ponovo)
                       ├──❌──▶ rejected ──upload──▶ pending  ├─greška, nema pokušaja ─▶ failed ──↻──▶ approved
                                                             ├─429/503 (pokušaj vraćen) ──▶ approved (posle 5–60 s)
                       └──15 min──▶ expired ──upload──▶ pending
                                                             └─dnevni limit ─────────▶ limit ──↻──▶ approved
bilo koje ──gost "Obriši"──▶ deleted (fajlovi obrisani)
```
- **Odobravanje/odbijanje:** `UPDATE … WHERE id=? AND status='pending' AND photo_key=?` sa ključem koji je tablet prikazao; inače 409.
- **Claim** (consumer, atomičan `UPDATE … RETURNING`): uspeva samo ako je `status='approved'` **ili** `status='generating'` duže od 180 s (zaglavljeno), i `attempts < max_attempts`, i postoji original. Postavlja novi `started_at` i povećava `attempts`; par (`attempts`, `started_at`) je **fencing token** tog pokretača.
- **Svi upisi posle AI poziva** (`done`, `failed`, povratak u `approved`, `limit`) imaju uslov `status='generating' AND attempts=? AND started_at=?`. Ako je sesija u međuvremenu obrisana, purgovana ili preuzeta od drugog pokretača, upis ne menja ništa, a upravo snimljen rezultat se briše iz R2.
- **Dnevni limit** (atomičan): `UPDATE usage SET n=n+1 WHERE day=? AND n < DAILY_LIMIT`; ako ne uspe → `limit`, AI se ne poziva.
- **429/503 (Google preopterećen):** sesija se vraća u `approved` sa `attempts-1`, brojač se umanjuje za 1, poruka u redu se ponavlja posle 5/15/30/60 s; posle toga `failed` sa porukom „Google je preopterećen”.
- **Obična greška:** troši pokušaj; ako ima još pokušaja → `approved` i ponovo za 2 s, inače `failed`.
- **400/401/403/404 od Gemini-ja** (ključ, billing, neispravan zahtev): odmah `failed`, bez ponavljanja.
- **Ponovi** (tablet): `max_attempts = attempts + 1`, status `approved`, posao ide u red.
- **Brisanje gosta** i **purge** prvo menjaju bazu, pa brišu fajlove.

---

## 8. API

Gost (bez autentikacije; ID sesije je tajna):

| Metod | Putanja | Opis |
|---|---|---|
| GET | `/api/config` | Javna podešavanja (rukovalac, kontakt, rokovi, demo, pauza) |
| POST | `/api/sessions` | `{age:true, consent:true, social:bool}` → `{id, code}`; 400 bez obaveznih; 503 ako je pauza |
| GET | `/api/s/:id` | Status, kod, pozicija u redu, greška; lenjo ističe stare `pending` |
| POST | `/api/s/:id/photo` | Telo `image/jpeg`, 1 KB–6 MB, mora počinjati sa `FF D8`; zaglavlje `x-photo-size: ŠxV` (opciono) određuje format izlaza; samo u `created/pending/rejected/expired`; 503 ako je red pun (40) ili pauza |
| GET | `/api/s/:id/result` | Rezultat (samo kad je `done`) |
| DELETE | `/api/s/:id` | Gost povlači pristanak: brisanje fajlova, status `deleted` |

Tablet (`Authorization: Bearer <token>`):

| Metod | Putanja | Opis |
|---|---|---|
| POST | `/api/admin/login` | `{pin}` → token; >10 pokušaja/min → 429 |
| GET | `/api/admin/queue` | Na čekanju, poslednji, statistika |
| GET | `/api/admin/s/:id/photo?key=<photo_key>` | Fotografija tačno te verzije (409 ako je zastarela) |
| GET | `/api/admin/s/:id/result` | Rezultat |
| POST | `/api/admin/s/:id/approve` | Telo `{photo_key}`; odobri i upiši u red, **odmah vraća odgovor**; 409 ako je fotografija promenjena |
| POST | `/api/admin/s/:id/reject` | Telo `{photo_key}`; odbij, original se briše odmah; 409 ako je promenjena |
| POST | `/api/admin/s/:id/retry` | Još jedan pokušaj za `failed`/`limit` (u red) |
| POST | `/api/admin/pause` | `{paused:bool}` |
| POST | `/api/admin/purge` | `{confirm:"OBRISI"}`: briše sve |

---

## 9. Generisanje slike

- Model: `gemini-nano-banana-2.1`, `responseModalities: ['IMAGE']`, `imageConfig: { aspectRatio: <format ulazne fotografije>, imageSize: '2K' }`, **`store: false`**, timeout 120 s (AbortController).
- **Format izlazne slike:** od 17. 11. **format izabrane scene** (iz prompta scene, vidi 9.1). Format ulazne fotografije koristi se samo ako scena nije poslata. Ranije (do 16. 11.): **format izlazne slike = format ulazne** (odluka agencije). Telefon posle smanjivanja šalje dimenzije (`x-photo-size: 1200x1600`); server bira najbliži podržani format (`1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9`, poređenje u log razmeri) i čuva ga u `photo_aspect`. Primeri: iPhone 3024×4032 → 3:4, 1080×1920 → 9:16, 1600×1200 → 4:3. Ako dimenzije nisu poznate: `ASPECT_RATIO` (3:4). Samo prompt nije dovoljan, jer dokumentacija ne garantuje da model zadržava format ulaza.
- Ulaz: tekst prompta + fotografija kao `inlineData` (JPEG, base64).
- Ako odgovor nema sliku (bezbednosni filter i sl.): greška sa razlogom (`blockReason` / `finishReason`), uz automatski ponovni pokušaj.
- Rezultat se čuva u R2 i servira gostu sa našeg domena (gost nikad ne komunicira direktno sa Googleom).

**Prompt v3** (`src/prompt.js`, doslovno; 14. 11. 2026, **prompt agencije**, ubačen tačno kako je dat, bez dodataka, na izričit zahtev agencije):
```
Transform this image into a modern Grand Theft Auto VI-inspired visual style.
Preserve the original composition, subject identity, pose, and facial features, but enhance it with a highly polished, next-gen video game aesthetic.
Apply:
- Ultra-realistic rendering with cinematic lighting
- High dynamic range (HDR), realistic shadows and reflections
- Detailed skin textures and natural imperfections (not cartoonish)
- Subtle stylization inspired by GTA VI character design (modern, grounded, semi-realistic - NOT exaggerated or comic-like)
- Vibrant but controlled color grading (Miami/Vice City-inspired tones, warm highlights, teal
shadows.
- Depth of field and environmental atmosphere for immersion
- Clean, sharp focus with AAA video game quality
Environment:
- If applicable, enhance background to feel like a living open-world city (modern Vice City vibe: neon lights, palm trees, urban luxury, night glow or sunset lighting)
Important constraints:
- Do NOT convert into cartoon, comic, or GTA V-style illustration
- Avoid thick outlines or exaggerated proportions
- Maintain realism with subtle stylization only
- Keep the subject recognizable and authentic
Final result:
A cinematic, next-generation GTA VI-style render that looks like a scene from a modern AAA open-world game.
```
Promene u odnosu na v2: stil je sada polurealistični „next-gen” render umesto ilustracije sa konturama; prompt **imenuje igru** (GTA VI, Vice City); **nema** zabrane teksta/logoa/oružja/droge/alkohola/nasilja ni redova „isti broj ljudi” i „ne menjati godine i pol”. Claude je predložio da se ti redovi dodaju na kraj; agencija je odlučila da ide samo njen tekst. Rizici: R5, R6, R15. U testu prompta posebno gledati: logo/natpis igre na slici, oružje, promenu godina, odbijanja zbog imena igre.

Prethodni prompt (v2, ilustracija, bez imena igre) je u git istoriji (`src/prompt.js`). **Od 17. 11. prompt v3 se koristi samo ako zahtev nema scenu** (npr. stari zahtevi, testovi); gost uvek šalje scenu.

### 9.1 Scene (od 17. 11. 2026)

Izvor: Word dokument agencije „GTA promptovi za Nano Banana” (16. 11. 2026). `src/scenes.js` je napravljen automatski iz dokumenta (bez prekucavanja): 15 scena, prompt svake doslovno, sa prelomima redova. **Scena 02 (GTA VI key art) izbačena 17. 11.** (odluka agencije: nema primer sliku, a prezentacija klijentu navodi 14 stilova); u aplikaciji je **14 scena**, ostale zadržavaju svoj broj (01, 03–15), a prva grupa se zove „GTA V”.

| # | Scena | Likova | Format |
|---|---|---|---|
| 01 | GTA V: ulica u Los Santosu | 1 | 4:5 |
| ~~02~~ | ~~GTA VI ilustracija (key art)~~ (izbačena) | 1 | 4:5 |
| 03 | Motor, bežiš od policije | 1 | 3:4 |
| 04 | Naslonjen na prozor auta | 1–2 | 3:4 |
| 05 | Napeti susret u zadimljenom klubu | 1 | 16:9 |
| 06 | Sa pit bulom kod ograde | 1 | 16:9 |
| 07 | Benzinska pumpa noću | 1 | 16:9 |
| 08 | Noćna vožnja | 1–2 | 16:9 |
| 09 | Krupni plan, ruka preko lica | 1 | 16:9 |
| 10 | Pljačka banke | 1–2 | 16:9 |
| 11 | Kiša novca | 1 | 16:9 |
| 12 | Kabriolet noću | 1–2 | 16:9 |
| 13 | Ekipa u garaži | 1–4 | 16:9 |
| 14 | Teretana, sediš na klupi | 1 | 3:4 |
| 15 | Grove Street u sumrak | 1 | 16:9 |

- **Tok:** gost bira scenu → scena ide uz fotografiju (zaglavlje `x-scene`, server proverava da scena postoji, inače 400) → čuva se u `sessions.scene` → tablet prikazuje „Scena N: naziv (format)” na kartici i u listi → AI dobija prompt i format scene. Scena se menja **samo zajedno sa novom fotografijom** (nova verzija `photo_key`), pa osoblje uvek odobrava par fotografija + scena koji je videlo.
- **Format:** iz prompta scene („Vertical 4:5”, „Horizontal 16:9”…), u skladu sa dokumentom („3, 4 i 14 su 3:4, ostali zadržavaju svoj format”). Ovo menja raniju odluku „izlaz = format ulaza” (9, gore).
- **Jedna fotografija po gostu:** dokument predviđa i više fotografija za scene sa više likova (Slika 1 = Lik A…). Aplikacija šalje **jednu** fotografiju; prema pravilima samog dokumenta gost je tada Lik A, a ostali likovi su izmišljeni. Više fotografija po gostu (grupe) **nije urađeno** (rizik pred event).
- **Mesta za popunu** „[npr. …]” u scenama 5, 6 i 12 (odeća) zamenjena su predloženom vrednošću iz dokumenta (npr. „Outfit: worn off-white t-shirt, black watch.”).
- **Scena 15** po dokumentu traži HUD sa tekstom (sat, novac); varijante „bez HUD-a” i „PS2 izgled” iz dokumenta nisu posebne scene.
- **Slike scena** (sličice za izbor): `public/scene/01.jpg` … `15.jpg`, dodaje agencija (uputstvo: `SLIKE_SCENA.md`). Bez slike: obojeno polje sa brojem (radi i tako). Javni API `GET /api/scenes` vraća naziv, grupu, format, broj likova i putanju slike, **bez promptova**.
Prompt još **nije testiran** na pravom modelu (nema API ključa). **Test prompta je prvi zadatak čim postoji ključ**, jer od kvaliteta zavise ostale odluke:
- 10–20 različitih fotografija: svetliji i tamniji ten, naočare, brada, marama ili kapa, dve osobe, slabo i mešovito svetlo kao u tržnom centru;
- za svaku beležiti: prepoznatljivost (da/ne), odbijanje filtera (da/ne, razlog), **trajanje** (tipično i najsporije);
- na štandu **ring svetlo**: najveći dobitak za prepoznatljivost, jeftinije i pouzdanije od menjanja prompta.

**Demo režim** (`PROVIDER="mock"`): posle 4 s vraća originalnu fotografiju; ništa ne troši. `MOCK_FAIL="1"` simulira običnu grešku, a `MOCK_FAIL="429"` preopterećenje (samo za testove).

---

## 10. Bezbednost

- Gemini ključ i PIN su Cloudflare „secrets”, nikad u kodu ni u browseru.
- Sesija gosta: 144-bitni nasumični ID (nepogodiv). Bez njega nema pristupa slici.
- Admin token = HMAC-SHA256(PIN, fiksni string); poređenje u konstantnom vremenu. Token ne ističe; za opoziv treba promeniti PIN.
- Zaštita PIN-a: najviše 10 pokušaja u minuti (globalno, ne po IP-u).
- Upload: proverava tip, veličinu i JPEG zaglavlje; telo se ne parsira na serveru. Prethodna verzija fotografije se briše pri zameni.
- QR za preuzimanje sadrži tajni ID sesije; prikazuje se samo na tabletu, osobi čiji je kod.
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
| Zapis o pristanku (vreme, 18+) | D1 | 7 dana |
| Rezultat generisanja koji stigne posle brisanja | R2 | briše se odmah (uslovni upis) |
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
| **Ukupno Gemini** | **~$21** |
| Cloudflare Workers Paid | $5/mesec (potrebno zbog R1) |

**Kontrola troška:** stvarni limit je `DAILY_LIMIT = 360` u aplikaciji (atomičan, na serveru; 429/503 se ne računaju). Budžet u Google Cloud billing-u ($30) se postavlja **samo kao upozorenje**: ne zaustavlja trošak. Ako AI Studio nudi ograničenje potrošnje po projektu, uključuje se.

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
| TRANSIENT_DELAYS_S | 5,15,30,60 | Pauze pri 429/503 (ne troše pokušaj) |
| SOCIAL_CONSENT_ENABLED | 0 | Kućica za objavu na mrežama (3.7) |
| Queue `gta-booth-jobs` | batch 1, concurrency 3, retries 10 | `wrangler.toml` → `[[queues.*]]` |
| MAX_PENDING | 40 | Najviše na čekanju |
| PENDING_TTL_MIN / ORIGINAL_TTL_MIN / RETENTION_DAYS | 15 / 60 / 7 | Rokovi brisanja |
| CONTROLLER_NAME / CONTACT_EMAIL | popuniti | Za obaveštenje |
| Secrets | `ADMIN_PIN`, `GEMINI_API_KEY` | `wrangler secret put` |

---

## 14. Testiranje: šta je urađeno

Lokalno (`wrangler dev`, Cloudflare runtime „workerd” sa lokalnim D1/R2/Queues). Rezultati v2:

1. **`scripts/e2e.mjs`: 57/57 provera.** Pristanak, validacija upload-a, auth tableta, red i kod, isključena kućica za mreže, verzija fotografije, odobravanje preko reda (odgovor < 2 s, generisanje ~4 s u demo režimu), dvostruko odobravanje (409), preuzimanje, brojač i trošak, odbijanje, pauza, brisanje, nevažeći ID, plus novo:
   - **zamena fotografije:** odobravanje i odbijanje stare verzije → 409, tablet ne može da učita staru verziju, sesija ostaje na čekanju;
   - **format slike:** 1080×1920 → 9:16, 1600×1200 → 4:3, neispravna dimenzija se ignoriše; u browser testu fotografija 1200×1600 sa telefona → 3:4;
   - **brisanje tokom generisanja:** posle završetka AI-ja sesija ostaje obrisana, rezultat ne postoji (provereno i direktno u R2, uz kontrolni objekat koji postoji).
2. **„Obriši sve” tokom generisanja:** baza prazna, rezultat ne postoji u R2; log beleži „result discarded”.
3. **`scripts/e2e-failures.mjs`, MODE=fail: 8/8.** Greška → automatski ponovni pokušaj → `failed`, „Ponovi” sa tableta, dnevni limit (posle limita ništa se ne poziva, brojač ne raste).
4. **`scripts/e2e-failures.mjs`, MODE=429: 4/4.** Posle pauza `failed` sa porukom „preopterećen”; brojač 0; pokušaji 0.
5. **Pravi Gemini poziv sa lažnim ključem (v1):** Googleov server odgovorio „API key not valid”: SDK radi u Cloudflare runtime-u, greška ključa se ne ponavlja.
6. **Browser test (Playwright):** emuliran iPhone 13 (gost) i tablet: ceo tok preko reda, dugme „QR za preuzimanje” prikazuje QR; bez JavaScript grešaka.

**14. 11. 2026, lokalno na računaru agencije (Windows 11, Node 22):**

7. `npm install`, `setup:local`, `dev`: radi; **e2e 57/57** (i posle promene prompta v3). Napomena: e2e očekuje praznu lokalnu bazu; zaostali zahtevi iz ručnog testa pomeraju poziciju u redu (2 lažna pada). Pre testa: tablet „Obriši sve podatke”.
8. **Ručni test u browseru** (cela lista iz `TESTIRANJE.md`, gost + tablet): sve stavke rade (agencija).
9. **Pravi telefon preko `cloudflared` tunela, telefon na mobilnom internetu, računar kao tablet** (demo režim, HTTPS): ceo tok radi (agencija).
10. **Pravi Gemini ključ, besplatni nivo (bez billinga):** ključ važi, model `gemini-nano-banana-2.1` postoji (lista modela). Generisanje: **429, kvota `free_tier` = 0** zahteva/min i /dan za **sve** modele za slike (Nano Banana 2.1, 2, 2 Lite, Pro, 2.5). **Zaključak: bez billinga nema nijedne slike; test prompta zahteva plaćeni nivo.** Aplikacija je grešku obradila kao prolaznu 429 (tablet: „Google preopterećen, novi pokušaj uskoro”), vidi R24.

11. **Billing uključen (14. 11.), prompt v3 na pravom Gemini-ju:** radi (agencija: „sve radi”), preko telefona i tunela.
12. **Izbor scene (17. 11.):** e2e **67/67** (57 + 10 novih: lista od 15 scena bez promptova, putanja sličice, format 16:9/3:4, nepostojeća scena 400, scena vidljiva na tabletu sa nazivom i formatom, promena scene sa novom fotografijom, generisanje, scena u listi „gotovo”). U logu servera: scena 14 → `aspect=3:4` i njen prompt, scena 05 → `aspect=16:9` i njen prompt; bez scene → prompt v3. Browser (emulacija telefona 375×812 + tablet): pristanak → izbor scene → slikanje → čekanje (kod + naziv scene) → tablet „Scena 5: … (16:9)” → ✅ → gost dobija sliku; sličica se prikazuje kad `/scene/05.jpg` postoji, bez nje obojeno polje bez ikonice greške. U konzoli samo 404 za sličice koje još ne postoje. `e2e-failures.mjs` nije ponovo pokrenut (logika grešaka nije menjana).

**Nije testirano:**
- **scene na pravom Gemini-ju** (kvalitet, prepoznatljivost, odbijanja zbog imena igre i scena sa policijom/novcem, trajanje, poštovanje formata 16:9);
- pravo generisanje: stvarni Gemini limiti plaćenog nivoa;
- telefoni: jedan telefon agencije prošao (9); preostalo: drugi OS (iOS/Android), Google Lens, Instagram in-app browser;
- produkcijski Cloudflare (CPU, Queues, cron, domen);
- rad pod opterećenjem (npr. 20 gostiju zaredom);
- cron (isticanje, ponovno slanje zaglavljenih) kroz stvarni okidač: logika postoji, okidač nije pokrenut u testu.

## 15. Poznati rizici i slabosti (samokritika)

| # | Rizik | Procena / ublažavanje |
|---|---|---|
| R1 | **CPU limit Cloudflare Workers besplatnog plana (10 ms po zahtevu).** Kodiranje/dekodiranje slika prelazi 10 ms. | **Odluka: Workers Paid ($5/mes).** Proveriti na produkciji pre eventa. |
| R2 | ~~Generisanje u HTTP zahtevu tableta; prekid veze ostavlja posao zaglavljen.~~ | **Rešeno u v2:** Cloudflare Queues (3.6) + uslovni upisi (7.1) + cron koji ponovo šalje zaglavljene poslove. Preostalo: ako consumer padne usred poziva, Google naplati poziv, a posao se ponovi (najviše jedan dodatni poziv). |
| R3 | Brojač troška računa pokrenute pozive, uključujući neuspele (osim 429/503). | Procena je konzervativna (precenjuje). |
| R18 | ~~Zamena fotografije u trenutku odobravanja.~~ | **Rešeno u v2** (verzija fotografije, 409). Testirano. |
| R19 | ~~Rezultat se upisuje posle brisanja.~~ | **Rešeno u v2** (fencing). Testirano. |
| R20 | **Gemini limiti (RPM/RPD) nisu poznati.** Nizak limit u špicu daje 429. | 3 paralelna poziva, pauze 5–60 s bez trošenja pokušaja. Limiti se proveravaju u nedelju; po potrebi zahtev za povećanje. |
| R21 | Cloudflare Queues: kašnjenje isporuke i ponašanje u produkciji nisu provereni (samo lokalno). | Proveriti u nedelju posle postavljanja; cron je zaštitna mreža. |
| R4 | Uslov Gemini-ja „likely to be accessed by individuals under 18”: javni QR u tržnom centru mogu da skeniraju i maloletnici. | Kućica + odobravanje + tabla 18+. Pravnik treba da potvrdi da je dovoljno. |
| R5 | Bezbednosni filteri modela mogu odbiti neke fotografije (npr. ako izgleda kao da je osoba mlada), a prompt v3 imenuje igru, što može dati dodatna odbijanja. | Prompt v3 nema „Do not change age” ni zabranu oružja/logoa (odluka agencije, 9). Automatski ponovni pokušaj; poruka osoblju. Meri se u testu prompta; ako ima odbijanja ili logoa/oružja, vratiti zaštitne redove. |
| R6 | Kvalitet i prepoznatljivost lica nisu provereni. | Prompt v3: „Preserve … subject identity … facial features”, „Keep the subject recognizable”; test na 10–20 slika; ring svetlo na štandu. |
| R7 | Signal u tržnom centru. | Smanjivanje slike na telefonu; sopstveni 4G ruter za tablet. |
| R8 | Ugrađeni browseri aplikacija za QR (Instagram, neki Android skeneri) imaju probleme sa kamerom ili preuzimanjem; `localStorage` im je odvojen. | Slika se preuzima pre klika; „pritisni i drži” kao ravnopravna opcija; **QR za preuzimanje** na tabletu. Testirati na stvarnim uređajima (14). |
| R9 | HEIC fotografije iz iPhone galerije. | Safari obično konvertuje u JPEG; postoji poruka greške ako dekodiranje ne uspe. Netestirano. |
| R10 | Admin token ne ističe i nije vezan za uređaj. | Promena PIN-a ga poništava. |
| R11 | Ograničenje pokušaja prijave je globalno: napadač može privremeno blokirati prijavu osoblja. | Malo verovatno za jedno veče. |
| R12 | Nova fotografija dok gost čeka pomera ga na kraj reda. | Namerno jednostavno. |
| R22 | Bez objave na mrežama (3.7): agencija nema slike za svoje kanale. | Odluka agencije. |
| R25 | Scene imenuju igru i izdavača (GTA V/VI, San Andreas, Rockstar, Vice City, Los Santos) i opisuju policiju, pljačku, novac. Moguća odbijanja filtera i zaštićeni elementi na slikama (npr. HUD scene 15). | Promptovi agencije, doslovno (odluka agencije). Sve scene osim 15 traže „No HUD, no text” i zabranjuju oružje, krv, alkohol. Proveriti svaku scenu bar jednom na pravom Gemini-ju pre eventa; scenu koja se odbija ili daje loš rezultat skloniti iz `src/scenes.js`. |
| R26 | Scene sa više likova: gost šalje jednu fotografiju; ostali likovi su izmišljeni. Gost u grupi može očekivati da budu svi. | Oznaka na kartici „ti + izmišljeni partner/ekipa”; savet „samo jedna osoba na slici”. Više fotografija po gostu nije urađeno. |
| R27 | Sličice scena: 14 od 15 preuzeto iz prezentacije za klijenta (17. 11., uparivanje u `SLIKE_SCENA.md`); **scena 02 (key art) nije imala sliku i izbačena je**. Natpisi u prezentaciji se delom razlikuju od naziva scena u aplikaciji (npr. „Kazino” = Kiša novca, „Noćna potera” = Motor), broj stilova se sada poklapa (14). | Bez slike radi (obojeno polje sa brojem). Sliku za 02 šalje agencija. Posle dodavanja slika na Cloudflare: ponovo `npm run deploy`. |
| R23 | Najbliži podržani format nije uvek tačan format fotografije (npr. 1080×1350 je tačno 4:5, ali neobičan format se zaokružuje). | Razlika je mala; slika se ne seče, model kadrira u izabranom formatu. |
| R13 | Nema serverske provere da je na slici jedna punoletna osoba; oslanja se na osoblje. | Svesna odluka. |
| R14 | „Obriši sve podatke” je nepovratno. | Potvrda upisom reči. |
| R15 | Rukovanje brendom/zaštićenim znakom igre i pravo na korišćenje teme. | Stranice ne prikazuju ime ni logo. **Prompt v3 imenuje igru** (GTA VI, Vice City) i ne zabranjuje logo/natpis, pa model može da doda zaštićeni logo na slike gostiju. Licenca eventa nepoznata (16, pitanje 1). Proveriti u testu prompta. |
| R24 | Iscrpljena ili nulta Gemini kvota (npr. dnevna, ili besplatni nivo) vraća 429 kao i gužva; aplikacija je tretira kao prolaznu: ~2 min ponavljanja, pa „preopterećen”. Osoblje bi čekalo nešto što neće proći. | Predlog: poruke sa „per day” / „limit: 0” odmah u `failed` sa jasnom porukom „kvota iscrpljena”. Čeka odluku agencije. |
| R16 | Rok: 4 dana, uključujući vikend. | Rezervni plan: ručno generisanje na štandu. |
| R17 | Kod trenutno nije na GitHub-u (Claude nema push pristup repozitorijumu agencije). | Lokalni commit i zip postoje; rešava agencija. |

---

## 16. Otvorena pitanja (za agenciju / pravnika)

1. Da li je event licenciran od vlasnika brenda igre i da li se sme koristiti ime igre u komunikaciji?
2. Ko je rukovalac podacima: agencija ili naručilac (tržni centar / brend)? Da li treba ugovor o obradi između njih?
3. Da li su tekst pristanka i obaveštenje dovoljni po ZZPL-u (posebno prenos van Srbije i rok od 55 dana kod Google-a)?
4. Da li je mera 18+ (kućica + vizuelna provera + tabla) dovoljna za Gemini uslove?
5. Da li dodati „Probaj još jednom” za gosta?
6. Domen (`gta.<domen>`) i Cloudflare nalog (Workers Paid): ko otvara i ko ima pristup?
7. ~~Objava na mrežama?~~ **Odlučeno:** ne, samo preuzimanje.
8. ~~Format slike?~~ **Odlučeno:** isti kao ulazna fotografija.
9. ~~Cloudflare Workers Paid?~~ **Odlučeno:** da.

---

## 17. Pitanja za recenzenta

**Prva recenzija (v1) je odgovorila na pitanja 2, 6 i 7 i našla dve kritične trke (odeljak 0).** Za drugu recenziju posebno nas zanima:

1. Da li je rešenje sa Queues (3.6) i uslovnim upisima (7.1) ispravno? Vidite li i dalje stanje u koje sesija može da se zaglavi, dupli trošak ili izgubljenu sliku?
2. Da li je obrada 429/503 (vraćanje pokušaja i brojača, pauze 5/15/30/60 s, posle toga `failed`) razumna za jedno veče?
3. Bezbednost (10): da li je „tajni ID u linku/QR-u” i HMAC(PIN) token dovoljno za jedno veče?
4. Privatnost (11, 3.3, 3.7): da li nešto nedostaje u obaveštenju?
5. Operativa (6): da li je tok „kod → ✅” dovoljno brz za ~300 ljudi?
6. Šta biste izbacili da smanjite rizik, i šta nedostaje?

## 18. Vremenski plan

| Dan | Zadaci |
|---|---|
| Pet 13. 11. | Odluke (provajder, arhitektura) |
| Sub 14. 11. | ✅ Aplikacija v1; plan; prva nezavisna recenzija; ✅ izmene v2 (trke, Queues, 429/503, QR za preuzimanje, prompt) i testovi; ✅ lokalno na računaru agencije (57/57, ručni test, telefon preko tunela); ✅ ključ besplatnog nivoa: kvota za slike 0 (14, tačka 10); ✅ prompt v3 (agencija) |
| Ned 15. 11. | **Prvo:** uključiti billing na Google projektu (bez njega nema slika), logovanje isključeno → **test prompta v3** (10–20 slika, trajanje, odbijanja, logo/oružje) i **provera Gemini limita**. Zatim Cloudflare nalog (Workers Paid), postavljanje, provera Queues i CPU na produkciji. |
| Pon 16. 11. | Test na pravim telefonima (uputstvo: `TESTIRANJE.md`): iOS Safari, Android Chrome, iOS kamera → QR, Google Lens, Instagram in-app; 10–20 ljudi zaredom; pravnik pregleda tekstove; domen |
| Uto 17. 11. | ✅ Izbor scene (15 scena iz dokumenta agencije), testovi 67/67; ✅ sličice iz prezentacije; ✅ scena 02 izbačena (14 scena). Zatim: sličice scena (agencija), **test svake scene na pravom Gemini-ju**, postavljanje na Cloudflare, proba u tržnom centru (signal, ring svetlo, QR); zaključavanje koda uveče |
| Sre 18. 11. | Event |

**Rezervni plan:** ako aplikacija nije stabilna do ponedeljka uveče, osoblje ručno generiše slike i deli ih gostima.
