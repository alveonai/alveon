# Pokretanje bez Claude-a (na ovom računaru)

Ovo uputstvo pokreće foto-štand na **vašem računaru**, sa pravim AI-jem i tunelom za
telefon. Ništa se ne menja u kodu. Google ključ ostaje isti; on je već upisan u fajl
`gta-booth\.dev.vars`.

Sve je već instalirano (Node.js, paketi, `cloudflared`). Ako je računar nov ili je
folder `node_modules` obrisan, vidi „Ako nešto ne radi” na dnu.

> **Napomena:** ovo je način za **testiranje**. Za sam event plan je da aplikacija bude
> postavljena na Cloudflare (stalna adresa, ne zavisi od računara). Vidi „Važno pre
> eventa” na dnu.

---

## 1. Otvorite prvi PowerShell u folderu aplikacije

1. U File Explorer-u otvorite folder `Documents\ALVEON projekti\GTA usce\gta-booth`.
2. Kliknite u **adresnu traku** na vrhu prozora (gde piše putanja), obrišite tekst,
   upišite `powershell` i pritisnite **Enter**.
3. Otvara se plavi ili crni prozor. On je već „u” folderu `gta-booth`.

Ako je otvorena aplikacija Claude i u njoj radi server, ugasite je pre ovoga, jer
dva servera ne mogu da rade istovremeno na istom računaru.

## 2. Pokrenite server

U taj prozor upišite (ili nalepite desnim klikom) i pritisnite **Enter**:

```
npm run dev:live
```

Sačekajte red u kome piše **`Ready on http://localhost:8787`**. Ovaj prozor ostavite
otvoren sve vreme testa. Ako ga zatvorite, štand prestaje da radi.

Za probu **bez troška** (demo, vraća originalnu fotografiju) umesto toga upišite
`npm run dev`.

## 3. Pokrenite tunel (za telefon)

Otvorite **drugi** PowerShell isto kao u koraku 1 i upišite:

```
cloudflared tunnel --url http://localhost:8787
```

Posle desetak sekundi u tekstu se pojavi okvir sa adresom koja izgleda ovako:

```
https://nesto-nesto-nesto-nesto.trycloudflare.com
```

To je adresa štanda. Označite je mišem, pa kopirajte sa **Ctrl+C**. Adresa je **svaki
put nova**. I ovaj prozor ostavite otvoren.

Ako samo testirate na računaru (bez telefona), ovaj korak preskočite i koristite
`http://localhost:8787`.

## 4. Otvorite tablet i QR

U Chrome-u ili Edge-u na računaru (`<adresa>` = adresa iz koraka 3):

| Šta | Adresa |
|---|---|
| Tablet osoblja | `<adresa>/admin.html` (PIN `123456`). Gore mora da piše **UŽIVO**. |
| QR za skeniranje | `<adresa>/qr.html` |
| Stranica za gosta | `<adresa>` |

Telefonom skenirate QR sa ekrana i ide se kao na eventu: gost se slika, na tabletu
**✅** (AI pravi sliku, 20–60 s) ili **❌** (odbijeno).

**Trošak:** oko **$0.05 po slici**, troši se tek kad pritisnete ✅. Tablet prikazuje
broj generisanih slika i procenu troška. Najviše 360 slika dnevno (zaštita u aplikaciji).

## 5. Gašenje

1. Na tabletu pritisnite **„Obriši sve podatke”** i upišite `OBRISI`. Na ovom računaru
   se fotografije **ne brišu same** posle 15 minuta / 7 dana kao na Cloudflare-u
   (automatsko čišćenje radi tek na pravom serveru), pa ih obrišite ručno.
2. U prozoru sa tunelom pritisnite **Ctrl+C**. Adresa odmah prestaje da radi.
3. U prozoru sa serverom pritisnite **Ctrl+C** (ako pita `Terminate batch job (Y/N)?`,
   upišite `Y` i Enter).
4. Zatvorite oba prozora.

---

## Ako nešto ne radi

| Šta vidite | Šta uraditi |
|---|---|
| `'npm' is not recognized` | Node.js nije instaliran: https://nodejs.org (LTS), pa ponovo otvorite PowerShell. |
| `Cannot find module` ili `wrangler is not recognized` | Upišite `npm install` u prvom prozoru, pa ponovo `npm run dev:live`. |
| `Address already in use` / port 8787 zauzet | Već radi jedan server (u drugom prozoru ili u aplikaciji Claude). Ugasite ga, pa probajte ponovo. |
| `cloudflared is not recognized` | Upišite: `& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:8787` |
| Tablet piše **DEMO** umesto UŽIVO | Server je pokrenut sa `npm run dev`. Ugasite ga (Ctrl+C) i pokrenite `npm run dev:live`. |
| Tablet: „Google preopterećen” odmah za svaku sliku | Najčešće je problem plaćanje ili kvota na Google projektu (aistudio.google.com → Usage / Billing). Kratko preopterećenje Google-a prolazi samo od sebe za minut-dva. |
| Tablet: greška 400/401/403 | Ključ ne važi ili je obrisan. Proverite red `GEMINI_API_KEY=` u fajlu `.dev.vars` (otvoriti u Notepad-u). |
| Telefon ne otvara adresu | Proverite da je prozor sa tunelom otvoren i da ste prekucali tačnu, **današnju** adresu. |
| Pogrešan PIN | PIN je u fajlu `.dev.vars`, red `ADMIN_PIN=`. |
| Sve od početka (prazna baza) | Ugasite server, obrišite folder `.wrangler` u `gta-booth`, upišite `npm run setup:local`, pa ponovo `npm run dev:live`. |

Fajl `.dev.vars` je skriven ako u Explorer-u nije uključeno **View → Show → Hidden items**.
Ključ iz njega nikome ne šaljite.

## Važno pre eventa

Pokretanje sa računara **nije** zamišljeno za sam event:
- adresa tunela se menja pri svakom pokretanju, pa bi odštampani QR prestao da radi;
- računar mora da bude uključen i na internetu celo veče;
- nema automatskog brisanja podataka.

Za event aplikacija ide na Cloudflare (stalna adresa, automatsko brisanje), po
uputstvu u `README.md`. To se radi jednom, pre utorka.
