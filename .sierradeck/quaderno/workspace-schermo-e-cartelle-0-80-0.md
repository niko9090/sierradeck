---
titolo: "Workspace: chi può cambiare lo schermo, e quando nasce una cartella (0.80.0)"
quando: 2026-10-19T16:30:00+02:00
tag: ["0.80.0", "workspace", "autopilota", "regola", "trappola"]
---

I casi del 19/10 sono quattro:
- lo schermo cambiava workspace da solo;
- un progetto di un altro PC creava qui una cartella vuota;
- il primo messaggio all'autopilota diventava il nome di un workspace;
- un workspace nuovo nasceva senza autopilota e senza un modo di dargliene uno.

## Lo schermo cambia solo quando lo sceglie Nicholas

- **Un solo punto.** `src/renderer/cambio-schermo.ts` (`cambiaSchermo(nome, causa, dettaglio)`), con la regola in `src/shared/cambio-schermo.ts`.
- **Il registro.** Ogni decisione scrive una riga `[schermo] «A» → «B» (causa)`, anche i rifiuti.
- **Le cause.**
  - Accettate: `nicholas`, `telefono`, `ripresa`, `eliminato`.
  - Rifiutate: `autopilota`, `consegna`, `adozione`.
- **Per cambiare lo schermo da codice nuovo** si passa da qui. Un test (`tests/renderer/cambio-schermo.test.ts`) fallisce se nel renderer compare un altro `.cambia(`.
- **Le consegne.** Una consegna per un workspace che non è davanti lavora in sottofondo (`comePortare` → `'sottofondo'`): si vede in «Al lavoro in sottofondo», con Guarda. Solo «Guarda» porta la finestra là.
  - Era la causa principale del «cambia da solo»: dalla 0.72.0 la finestra ci andava dopo 45 s di tastiera ferma.
- **`client:apri`.** Accetta un campo `causa`. Se manca vale `ripresa`. Se la causa è di un autopilota, la chat va nel suo workspace con `spostaChat` e lo schermo resta.

## Quando nasce la cartella di un progetto

`progettoPerWorkspaceGlobale(nome, { crea })` decide con `sceltaCartellaWorkspace` (in shared):
- la cartella **qui**, se c'è;
- **altrove**: residenza, cartella registrata su un altro PC, riquadri remoti del workspace o un workspace con lo stesso nome nei battiti. In questo caso qui non nasce niente e il registro dice «vive su <PC>»;
- altrimenti **crea**.

Altre regole:
- **Chi chiede soltanto non crea.** `sistema:cartelleBase` (a ogni apertura della finestra della chat nuova) passa `crea: false`.
- **Il workspace di un autopilota** creato dal pannello porta la sua cartella e non crea un progetto nuovo.
- **Il ripristino di tutti i progetti** salta quelli in mano ad altri PC. «Ripristina» di un solo progetto prepara solo quello.

## Il nome del workspace di un autopilota

Il nome scritto da Nicholas, oppure il nome della cartella: mai le parole del messaggio (`nomeScritto`, `nomeDaCartella` in `azioni-telefono.ts`).

**Trappola:** il telefono manda il nome già ricavato dalle prime 8 parole dell'obiettivo. Per questo `nomeScritto` lo confronta con `nomeDaObiettivo`.

## Workspace senza autopilota

La Panoramica dice «Questo workspace non ha ancora un autopilota.» e mostra il tasto «Crea l'autopilota», con il suo «?». Il tasto apre il pannello Autopiloti con il modulo già aperto (`src/renderer/nuovo-autopilota.ts`).
