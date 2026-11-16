# Slike (sličice) scena

Gost posle pristanka bira jednu od 14 scena (scena 02 je izbačena 17. 11.; ostale zadržavaju svoj broj). Svaka scena ima svoje polje sa slikom.
Dok slika ne postoji, polje je obojeno i prikazuje broj scene; čim dodate sliku, ona se
pojavi umesto broja. **Kod se ne menja.**

## Gde i kako

Folder: `gta-booth\public\scene\`

Ime fajla = broj scene sa dve cifre, format **JPG**:

| Fajl | Scena |
|---|---|
| `01.jpg` | GTA V: ulica u Los Santosu |
| `03.jpg` | Motor, bežiš od policije |
| `04.jpg` | Naslonjen na prozor auta |
| `05.jpg` | Napeti susret u zadimljenom klubu |
| `06.jpg` | Sa pit bulom kod ograde |
| `07.jpg` | Benzinska pumpa noću |
| `08.jpg` | Noćna vožnja |
| `09.jpg` | Krupni plan, ruka preko lica |
| `10.jpg` | Pljačka banke |
| `11.jpg` | Kiša novca |
| `12.jpg` | Kabriolet noću |
| `13.jpg` | Ekipa u garaži |
| `14.jpg` | Teretana, sediš na klupi |
| `15.jpg` | Grove Street u sumrak |

Pazite na ime: `05.jpg`, ne `5.jpg`, ne `05.JPG.jpg`, ne `05.png`. (Ako Windows krije
ekstenzije: u Explorer-u **View → Show → File name extensions**.)

## Trenutno stanje (17. 11. 2026)

Slike su preuzete iz prezentacije za klijenta „Alveon-GTA lansiranje event.pdf” i
isečene na 600 × 750 px. Uparene su po sadržaju (odeća, poza i scena iz prompta), ne po
natpisu u prezentaciji:

| Scena | Slika iz prezentacije (strana, natpis) |
|---|---|
| 01 GTA V: ulica u Los Santosu | str. 9, „GTA V” |
| ~~02 GTA VI ilustracija (key art)~~ | izbačena iz aplikacije (nije bilo slike) |
| 03 Motor, bežiš od policije | str. 6, „Noćna potera” |
| 04 Naslonjen na prozor auta | str. 7, natpis „Pumpa, dan” |
| 05 Napeti susret u zadimljenom klubu | str. 7, natpis „Garaža” |
| 06 Sa pit bulom kod ograde | str. 2 (bez natpisa) |
| 07 Benzinska pumpa noću | str. 6, „Pumpa, noć” |
| 08 Noćna vožnja | str. 1 (bez natpisa) |
| 09 Krupni plan, ruka preko lica | str. 8, „Ulica u sumrak” |
| 10 Pljačka banke | str. 7, „Pljačka banke” |
| 11 Kiša novca | str. 6, „Kazino” |
| 12 Kabriolet noću | str. 6, „Kabriolet” |
| 13 Ekipa u garaži | str. 8, „Ekipa” |
| 14 Teretana, sediš na klupi | str. 7, „Teretana” |
| 15 Grove Street u sumrak | str. 9, „San Andreas” |

## Preporuka za slike

- Uspravne, odnos **4:5** (npr. **800 × 1000 px**). Polje je uvek uspravno; slika drugog
  formata se automatski iseče po sredini.
- Do ~200 KB po slici (brže učitavanje na slabom signalu u tržnom centru).
- Najbolje: primer gotove AI slike za tu scenu, da gost vidi šta dobija.

## Posle dodavanja

- **Lokalno:** samo osvežite stranicu gosta (ako se ne vidi: **Ctrl+F5**).
- **Na Cloudflare-u (event):** posle dodavanja ponovo pokrenuti postavljanje
  (`npm run deploy`), jer se slike šalju zajedno sa aplikacijom.

## Promptovi

Promptovi scena su u `src/scenes.js`, preneti iz Word dokumenta „GTA promptovi za Nano
Banana” (16. 11. 2026). Naziv, redosled i prompt scene menjaju se samo tamo.
