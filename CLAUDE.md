# CLAUDE.md — Varannan dag (träningsapp)

Kontext för Claude Code för att bygga vidare på träningsappen.

## Vad det är
En tränings-PWA för en otränad 46-åring: logga **armhävningar 10×3** och **squats 10×3**,
**varannan dag**, ett set i taget. **Ren statisk HTML/CSS/JS, ingen byggprocess.**

- **Live:** https://andersbehrens.github.io/varannandag/
- **Repo:** `andersbehrens/varannandag` (publikt, GitHub Pages från `main` / root)
- **Design:** "Varm & vänlig" (vald från `moodboard.html`) — cream-bg (`#fbf3ea`), orange accent
  (`#f08a3c`), rundade kort och pill-knappar. Kalendern ligger UNDER loggningsknapparna
  (en scrollbar sida), enligt uttryckligt önskemål.

## Filstruktur
```
index.html        Hela appen (HTML + CSS + JS inline, en fil)
manifest.json     PWA-manifest (relativa sökvägar → funkar i subpath /varannandag/)
sw.js             Service worker. Bumpa CACHE_NAME (varannandag-vN) vid ändring av index/ikoner
.nojekyll         Så GitHub Pages inte kör Jekyll
icon.svg          Källa för ikonen (orange platta, hantel + bock)
icon-192/512.png  PWA-ikoner (genererade från icon.svg via headless Chrome, se nedan)
moodboard.html    De 4 designriktningarna (referens, ingår ej i appen)
scripts/
  check-app.mjs   Funktionellt röktest i riktig Chrome via CDP (flera tryck, persistens, kalender, layout)
  shot.mjs        Tar helsides-skärmdump med demodata (för visuell koll)
```

## Datamodell (localStorage, versionerad för framtida utbyggnad)
Nyckel `varannandag.v1`:
```jsonc
{
  "version": 1,
  "settings": {
    "startDate": "2026-06-26",      // ankardag för "varannan dag"-rytmen
    "schedule": "everyOtherDay",
    "exercises": [
      { "id": "pushups", "name": "Armhävningar", "reps": 10, "sets": 3 },
      { "id": "squats",  "name": "Squats",       "reps": 10, "sets": 3 }
    ]
  },
  "log": { "2026-06-26": { "pushups": 2, "squats": 1 } }   // antal KLARA set per övning per dag
}
```
- **En dag är träningsdag** om `date >= startDate` och `dagdiff(startDate, date) % 2 === 0`.
- **Klar** = alla övningar nått sitt `sets`-mål. **Påbörjad** = någon progress men ej klar.
  **Missad** = träningsdag i det förflutna utan att ha blivit klar.
- **Framtidssäkring:** loggen är per datum + övnings-id, så gammal historik finns kvar även om
  man lägger till nya övningar eller ändrar mål. Höj `version` + migrera i `load()` vid schemaändring.
- **Idag** läses från `?today=YYYY-MM-DD` om satt (för deterministiska test), annars riktig dag.

## Kör lokalt
```sh
python3 -m http.server 8770    # öppna http://localhost:8770
```

## ⚠️ Verifiera ALLTID innan du säger "klart" (uttryckligt önskemål från användaren)
```sh
node scripts/check-app.mjs http://localhost:8770/index.html
```
Laddar appen i riktig (headless) Chrome via CDP och testar flera knapptryck: dots fylls,
dagen blir klar, tak + Ångra, persistens efter omladdning, seedad historik (done/partial/missed),
månadsbläddring och att layouten inte spiller över på 320–360px. Avslutar med kod 1 vid fel.
Kräver Google Chrome.

### Regenerera ikoner (om icon.svg ändras)
```sh
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for s in 192 512; do "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --default-background-color=00000000 --window-size=$s,$s \
  --screenshot="$PWD/icon-$s.png" "file://$PWD/icon.svg"; done
```

## Deploy / git
- Pushas med den klassiska PAT:en (har `repo` + `workflow`) som ligger i `ekgapp/.git/config`.
  Läs den: `git -C ../ekgapp config --get remote.origin.url` (formen `https://<TOKEN>@github.com/...`).
- **Spara ALDRIG token i `.git/config`** — pusha med engångs-URL och maskera i utskrift:
  ```sh
  TOKEN=$(git -C ../ekgapp config --get remote.origin.url | sed -E 's#https://([^@]+)@.*#\1#')
  git push "https://${TOKEN}@github.com/andersbehrens/varannandag.git" main 2>&1 | sed -E "s#ghp_[A-Za-z0-9_]+#TOKEN#g"
  ```
- `origin` ska peka på den RENA URL:en (utan token). Använd inte `git push -u` med token-URL.
- Ändrar du `index.html`/`sw.js`: bumpa `CACHE_NAME` i `sw.js` (annars syns inte uppdateringen
  för någon som redan installerat appen).
```
