---
titolo: "La Revisione guarda il ramo, non main: correzioni fatte su main vanno unite nel ramo"
quando: 2026-10-18T00:30:00+02:00
tag: ["revisione", "rami", "trappola", "0.79.0"]
---

Successo nella 0.79.0, con il ramo `ap/ap-f1e631f5/c-1` (motore della gestione delle chat).

## Cosa è successo
- La Revisione aveva chiesto 4 correzioni al ramo:
  - le rotte `/api/chat/gestione/*` fra le `ROTTE_LENTE`;
  - `tolteDaQui` in memoria;
  - lo stato illeggibile che deve voler dire «non si tocca»;
  - l'esito della scrittura dei registri guardato davvero.
- Le ha fatte un'altra chat (la prova di ECC), **direttamente su main** (`8a5f7cd`).
- La Revisione ha continuato a rimandare indietro il ramo: «nessuna delle 4 correzioni è nel ramo». Era vero, perché il ramo non le aveva.
- Lo stesso schema c'era stato prima con `Ponte.kt`: due chat avevano aggiunto le stesse rotte in due punti diversi della lista, e ne era uscito un conflitto.

## Regola
- Prima di dire «già fatto», guarda **nel ramo**, non su main: `git branch --contains <commit>`.
- Se le correzioni sono su main, `git merge main` nel ramo. A parità di contenuto si tiene la versione di main.
- Poi si rilanciano guardia, typecheck, `npm test` e gradle.
- Dopo l'unione, `git diff main --stat` mostra quello che resta solo nel ramo. Qui erano solo schede del quaderno.
