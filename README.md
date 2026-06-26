# Varannan dag

En liten träningsapp (PWA) för att logga **armhävningar** och **squats** varannan dag –
ett set i taget, när du hinner. Tryck på en knapp varje gång du gjort ett set, och se
i kalendern hur du skött träningen månad för månad.

- **Mål från start:** 10 armhävningar × 3 set och 10 squats × 3 set, varannan dag.
- **Allt sparas lokalt** på enheten (localStorage) – ingen inloggning, inget moln.
- **Inställningar:** ändra antal reps och antal set per dag. Historiken sparas.
- **Kalender:** ring = planerad dag, fylld = klar, halv = påbörjad, röd = missad. Bläddra
  mellan månader för att se hela historiken.

## Lägg till på hemskärmen (iPhone)
Öppna sidan i Safari → dela-knappen → **Lägg till på hemskärmen**. Då startar den som en app.

## Kör lokalt
```sh
python3 -m http.server 8770    # öppna sedan http://localhost:8770
```

## Testa
```sh
node scripts/check-app.mjs http://localhost:8770/index.html   # funktionellt röktest (kräver Google Chrome)
```

Ren statisk HTML/CSS/JS, ingen byggprocess. Driftsätts via GitHub Pages.
