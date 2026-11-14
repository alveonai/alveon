# Odgovor recenzenta na plan „Uđi u igru” (PLAN.md od 14. 11. 2026)

> **Za autora plana:** ovo je nezavisna recenzija dokumenta `PLAN.md`. Recenzent je video **samo plan, ne i kod**. Stavke označene sa **[kod]** treba proveriti u kodu i, ako problem postoji, ispraviti.
>
> Svaka stavka sadrži: **problem**, **predlog izmene** i **gde ažurirati plan**. Molimo da posle izmena ažurirate i odeljke 14 (testiranje), 15 (rizici) i 18 (vremenski plan).

Opšta ocena: plan je dobro obrazložen. Izbor provajdera, odobravanje na tabletu i automatsko brisanje su dobre odluke. Ispod je 7 izmena koje treba uneti pre eventa.

---

## 1. Trka: zamena fotografije u trenutku odobravanja **[kod]** — kritično

**Problem.** Osoblje na tabletu gleda fotografiju A. Gost u međuvremenu pošalje fotografiju B, što je dozvoljeno dok je status `pending` (`POST /api/s/:id/photo`). Tablet osvežava red tek na 2 s, pa ✅ šalje Googleu fotografiju B, koju niko nije video. To zaobilazi celu proveru uzrasta i sadržaja, a ona je glavni razlog zašto postoji odobravanje (odeljak 3.5).

**Predlog izmene.**
- `POST /api/admin/s/:id/approve` u telu šalje `photo_key` (ili verziju fotografije) koji je osoblje videlo na kartici.
- Odobravanje je atomični upit: `UPDATE sessions SET status='approved', … WHERE id=? AND status='pending' AND photo_key=?`.
- Ako upit ne promeni nijedan red, vratiti **409 „Fotografija je promenjena”** i na tabletu odmah osvežiti karticu.
- Isto važi i za `reject`, da se ne odbije nova fotografija koju osoblje nije videlo.

**Gde ažurirati plan:** 7.1 (uslov za prelaz `pending → approved`), 8 (telo zahteva za approve/reject), 14 (novi e2e test: upload B između prikaza i odobrenja A → 409), 15 (novi rizik, sa oznakom da je rešen).

---

## 2. Trka: brisanje tokom generisanja vraća podatke **[kod]** — kritično

**Problem.** Gost pritisne „Obriši moje podatke” (ili osoblje pokrene „Obriši sve”) dok je status `generating`. Fajlovi se brišu i status postaje `deleted`. Nekoliko sekundi kasnije Gemini vrati sliku, a kod je upiše u R2 i postavi status `done`. Podaci se tako pojavljuju **posle** brisanja, što krši obećanje dato gostu.

Isti problem nastaje i kod preuzimanja zaglavljenog posla (`generating` > 150 s): ako prvi pokretač ipak završi, dva pokretača mogu da upišu rezultat.

**Predlog izmene.**
- Završni upis rezultata treba da bude uslovljen, po principu „fencing tokena”: `UPDATE sessions SET status='done', result_key=? WHERE id=? AND status='generating' AND attempts=?`, gde je `attempts` vrednost koju je ovaj pokretač dobio pri claim-u.
- Ako upit ne promeni nijedan red, **odmah obrisati** upravo upisani R2 objekat i ne menjati ništa drugo.
- Isti uslov primeniti i na upis greške (`failed`) i na povratak u `approved` radi ponovnog pokušaja.
- Proveriti da se `started_at` postavlja iznova pri svakom claim-u.

**Gde ažurirati plan:** 7.1 (napomena o uslovnim upisima), 14 (e2e test: DELETE dok je mock u toku → posle 4 s status ostaje `deleted` i u R2 nema rezultata; isto za purge), 15 (proširiti R2).

---

## 3. Gemini kvote i ograničenje troška — kritično

**Problem.**
- Plan ne pominje **limite poziva** (rate limits). Novi projekat sa billingom počinje na najnižem tier-u, a modeli za slike mogu imati niske limite po minutu i po danu (RPM/RPD). U špicu nekoliko istovremenih generisanja može dobiti 429.
- Odeljak 7.1 navodi samo greške koje se **ne** ponavljaju (400/401/403). Nije jasno šta se dešava sa **429 i 503**. Ako se ponavljaju odmah, troši se jedini automatski pokušaj i sesija završava kao `failed`. **[kod]**
- Odeljak 12 predlaže „budžet/limit $30 na Google nalogu”. Budžet u Google Cloud billing-u **samo šalje upozorenje i ne zaustavlja trošak.**

**Predlog izmene.**
- U nedelju, kada se pravi ključ, u AI Studiju proveriti limite za tačan model i upisati ih u plan. Ako su preniski za ~5 paralelnih zahteva, odmah zatražiti povećanje.
- Za 429/503: ponoviti posle pauze (npr. 5 s, pa 15 s), i to **ne** računati kao potrošen pokušaj iz `max_attempts`. Ako i dalje ne uspe, status `failed` sa jasnom porukom „Google preopterećen” na tabletu.
- Ograničiti broj istovremenih generisanja (npr. 3–4). Vidi stavku 5 (Queues to rešava ugrađeno).
- U odeljku 12 ispraviti tekst: pravi limit troška je `DAILY_LIMIT` u aplikaciji. Google budžet uključiti samo kao upozorenje. Ako AI Studio nudi ograničenje potrošnje po projektu (spend cap), uključiti ga.

**Gde ažurirati plan:** 3.3 (limiti), 7.1 (obrada 429/503), 12 (budžet), 15 (novi rizik: kvote), 18 (nedelja: provera limita).

---

## 4. Kućica „OK za mreže” nema tok podataka

**Problem.** Gost može da pristane na objavu na društvenim mrežama, ali plan ne opisuje kako agencija dolazi do tih slika:
- tablet prikazuje samo poslednjih 40 sesija i nema izvoza;
- rezultat se briše posle 7 dana;
- zapis o pristanku se takođe briše posle 7 dana, a objava na mrežama ostaje trajno. Rukovalac mora moći da **dokaže** pristanak za sve vreme dok je slika objavljena.

**Predlog izmene (izabrati jedno):**
- **A) Napraviti tok:** na tabletu dugme „Preuzmi slike za mreže” (zip ili lista) samo za sesije sa `consent_social=1`. Za te sesije čuvati zapis o pristanku (vreme, ID, bez slike) onoliko dugo koliko je slika objavljena. Obaveštenje (`privatnost.html`) i tekst kućice dopuniti: ko preuzima, gde se čuva, koliko dugo i kako se povlači pristanak za objavu.
- **B) Izbaciti kućicu** ako agencija ne planira objavu. To je jednostavnije i smanjuje rizik.

**Gde ažurirati plan:** 5 (ekran pristanka), 6 (tablet), 7 (rok čuvanja `consent_social`), 11 (tabela rokova), 16 (dodati pitanje za agenciju: A ili B).

---

## 5. Dugi zahtev za generisanje: odgovor na pitanje 17.2

**Problem.** Generisanje se izvršava unutar HTTP zahteva tableta (3.6, R2). Ako tablet izgubi vezu, zahtev se može prekinuti, sesija ostaje `generating` 150 s, a brojač se može uvećati dvaput.

**Napomena:** `ctx.waitUntil()` **nije** rešenje, jer je ograničen na oko 30 s posle odgovora, a generisanje traje 20–60 s ili duže.

**Predlog izmene.**
- **Preporučeno: Cloudflare Queues.** `approve` upiše posao u red i odmah vrati 200. Consumer (`queue()` handler u istom Workeru) radi claim, generiše i upisuje rezultat. Prednosti:
  - generisanje ne zavisi od veze tableta ni telefona gosta;
  - `max_concurrency` ograničava broj paralelnih poziva i štiti od 429 (stavka 3);
  - ponovni pokušaji i odlaganje (`retry` sa `delaySeconds`) su ugrađeni;
  - rezervni pokretač sa telefona gosta (`POST /api/s/:id/generate`) i pravilo „20 s / 150 s” mogu se ukloniti ili ostati samo kao zaštita.
  - Obim: otprilike 50–80 linija. Zahteva Workers Paid ($5), koji je ionako preporučen zbog R1.
- **Ako nema vremena:** zadržati postojeće rešenje, ali obavezno uz uslovne upise iz stavke 2. To je dovoljno za jedno veče.

**Gde ažurirati plan:** 3.6, 4 (dijagram: dodati Queue), 7.1 (claim iz consumera), 8 (`approve` više ne čeka AI), 15 (R2), 17.2 (označiti kao odgovoreno).

---

## 6. Preuzimanje slike na telefonu: odgovor na pitanje 17.6

**Problemi i predlozi:**

1. **Web Share na iOS-u** **[kod]**: `navigator.share({ files })` mora biti pozvan direktno u obradi klika. Ako se slika preuzima (`fetch`) tek posle klika, Safari često baca `NotAllowedError` jer je „user gesture” istekao.
   → Preuzeti sliku kao `Blob`/`File` **unapred**, čim status postane `done`, a u kliku samo pozvati `share`. Ako `share` ne uspe, prikazati uputstvo „pritisni i drži sliku”.
2. **Ugrađeni browseri** (Instagram, neki Android skeneri QR koda): preuzimanje fajla često ne radi, a `localStorage` im je odvojen od pravog browsera. Pritisni-i-drži obično radi.
   → Uputstvo „pritisni i drži” prikazati odmah, ne kao rezervu. Opciono dodati dugme „Otvori u browseru”.
3. **Izgubljen link:** gost koji zatvori tab (posebno u ugrađenom browseru) nema kako da se vrati na rezultat.
   → Na tabletu, u listi „U obradi i gotovo”, dodati dugme **„QR za preuzimanje”**. Ono prikazuje QR sa `/#s=<id>` te sesije, pa gost samo ponovo skenira. Malo koda, a spasava mnogo situacija na štandu.
4. **Format slike:** gosti će slike najčešće deliti u Instagram/TikTok story. Proveriti da li model podržava **9:16** i dogovoriti sa agencijom da li 9:16 umesto 3:4. Ako se menja, prilagoditi i prompt („vertical framing”).

**Gde ažurirati plan:** 5 (ekran „Gotovo”), 6 (dugme „QR za preuzimanje”), 9 i 13 (`ASPECT_RATIO`, ako se menja), 14 (na pravim telefonima testirati: iOS Safari, Android Chrome, iOS kamera → QR, Google Lens, Instagram in-app), 15 (R8).

---

## 7. Prompt: odgovor na pitanje 17.7

**Predlozi izmena:**
- **Izbaciti reč „crime”** iz prve rečenice. Povećava verovatnoću da bezbednosni filter odbije zahtev, a stilu ne doprinosi ništa. Predlog: *„…in the style of a classic open-world action video game loading screen artwork.”*
- **Zahtev za očuvanje lica staviti na početak** prompta, pre opisa stila. Modeli uglavnom daju veću težinu onome što je ranije u tekstu. Npr. prva rečenica: *„Keep the person clearly recognizable: same face, facial features, …”*, pa tek onda transformacija i stil.
- Zadržati *„Do not change age, gender or body type”*. To je dobro i smanjuje rizik da se lice podmladi, što bi moglo da aktivira filtere.

**Test prompta (pre zaključavanja):**
- 10–20 različitih fotografija: svetliji i tamniji ten, naočare, brada, marama ili kapa, dve osobe na slici, slabo i mešovito svetlo kakvo je u tržnom centru.
- Za svaku zabeležiti: prepoznatljivost (da/ne), odbijanje filtera (da/ne, razlog) i **trajanje** (tipično i najsporije). Trajanje je potrebno za stavku 5 i za poruke gostu.
- **Ring svetlo na štandu**: najveći dobitak za prepoznatljivost lica, jeftinije i pouzdanije od menjanja prompta. Dodati ga u spisak opreme.

**Gde ažurirati plan:** 9 (novi prompt i kriterijumi testa), 15 (R5, R6), 18 (test prompta je **prvi** zadatak čim postoji ključ: ako kvalitet nije dobar, ostale odluke se menjaju).

---

## Predloženi redosled rada

1. **Odmah kada postoji ključ:** test prompta (stavka 7) i provera Gemini limita (stavka 3).
2. **Nedelja:** uslovni upisi (stavke 1 i 2, oko sat vremena, sa e2e testovima), obrada 429/503 (stavka 3), zatim Queues (stavka 5) ako ima vremena.
3. **Nedelja/ponedeljak:** preuzimanje slike i dugme „QR za preuzimanje” (stavka 6). Odluka agencije o kućici za mreže (stavka 4).
4. **Ponedeljak:** test na pravim telefonima prema spisku iz stavke 6.
