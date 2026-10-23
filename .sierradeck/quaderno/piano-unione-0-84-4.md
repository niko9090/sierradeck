---
titolo: "Piano di unione dei rami della 0.84.4 (c-119, c-121, c-120)"
quando: 2026-10-23T12:45:00+02:00
tag: ["0.84.4", "unione", "revisione", "server.ts", "rami"]
---

Pre-revisione in sola lettura fatta da c-122 alle 10:15 UTC sul lavoro **non
ancora salvato in commit** delle tre copie. Quando ogni ramo ha i suoi commit
si rivede il diff vero e si confronta con questo piano.

## Ordine

1. **c-119 (ambiente della copia)**: per primo, così la Revisione non respinge
   gli altri due per `node_modules` mancante.
2. **c-121 (chat che non nasce)**.
3. **c-120 (risposte prese davvero)**: per ultimo. È il più grande (circa 255
   righe in `server.ts`) e l'unico vero conflitto è con c-121.

## Dove si sovrappongono

| File | Cosa tocca | Conflitto |
|---|---|---|
| `server.ts`, import in cima | c-119 riga ~25 (`ambiente-copia`), c-121 ~60 (`non-nata`), c-120 ~65 (`risposte-in-viaggio`) | righe diverse, al massimo un conflitto banale |
| `server.ts`, apertura della Revisione (~1428) e `revisioneDecide` (~2645) | solo c-119 | nessuno |
| `server.ts`, giro mai fermo (~1740) | solo c-121 (il ciclo ora usa `prima`/`letto`) | nessuno |
| `server.ts`, `riprendiChatBloccata`, `suRispostaTardiva`, dialogo (~1110-1420, ~2500, ~4980) | solo c-120 (`avviaLavoro` ora torna `Promise<EsitoAvvio>`) | nessuno: c-121 usa `void avviaLavoro`, tipo compatibile |
| `server.ts`, gestore di `/consegne/esito` (~5054) | c-120 (`esitoConsegnaRisposta`), c-121 (`nonNata` → `rimediaNonNata`) | **sì, testo e logica** (sotto) |
| `shared/autopilota.ts` | c-121: `ChatGovernata.nonNate` + `parseChat`; c-120: `Autopilota.risposteInViaggio` + `parseAutopilota` | punti diversi, nessun conflitto |

## Il conflitto vero: `/consegne/esito` con «non nata»

Con tutti e due dentro, una consegna che porta una risposta di Nicholas a una
chat il cui terminale non nasce fa così: `riportaInCoda` → c-120 vede la chat
ancora «lavoro» e **riconsegna alla chat vecchia**; subito dopo c-121 la
sostituisce. La seconda consegna va a una chat chiusa, fallisce, e la risposta
finisce al supervisore. Non si perde, ma non arriva alla chat nuova che fa il
compito.

Da sistemare all'unione di c-120 (con un test):
- nel gestore, `rimediaNonNata` **prima** di `riportaInCoda`;
- in `esitoConsegnaRisposta`, se la chat della risposta è stata sostituita
  (c'è una chat con `sostituisce === r.chatId`), riconsegnare a quella;
  oppure `conNataAlPosto` rigira anche `risposteInViaggio`, come fa con
  `daConsegnare`.

## Cosa controllare in ogni ramo (criteri 0.84.4)

- **c-119**, caso vero dei rami respinti 4-5 volte (c-95, c-106, 23/10): test
  con `tsc non è riconosciuto`, `npx` che scarica un'altra vitest, gradle senza
  SDK → unito, nessun rimando, nessuna domanda. Controllare anche:
  - un esito rosso per l'ambiente **non** si ricorda per il commit;
  - i difetti veri (`TS2307` su un file del ramo) restano del ramo;
  - `togliCollegamenti` usa `unlinkSync` su una junction: provarlo su
    Windows vero, oppure passare a `rmdirSync` come fanno le schede;
  - la guardia delle cancellazioni resta pulita (niente `rmSync recursive`);
  - `deps.git` sincrono in `revisioneDecide` (`rev-parse --show-toplevel`): è
    un comando solo, ma il servizio non deve tornare ai git sincroni del 21/10.
- **c-121**, caso vero delle 09:47 UTC (Revisione di c-98 nella cartella
  sparita, c-115 → c-117 → c-118): Revisione superata e chiusa al primo giro,
  copia rimessa se il ramo c'è, chat nuova se il terminale non nasce, tetto
  di 3 con una riga a Nicholas e nessuna domanda. Controllare anche:
  - `creaWorktree` su un worktree ancora registrato ma con la cartella
    sparita: senza `git worktree prune` `worktree add` fallisce;
  - se la copia non si rimette, la chat nuova lavora **nella cartella
    principale**: va contro la regola «niente codice in main con
    l'autopilota». Meglio il tetto, o una copia nuova;
  - `nuovaId = c-${chats.length+1}` deve essere lo stesso id che dà
    `chatCheSostituisce`, se no la copia ha un nome e la chat un altro.
- **c-120**, caso vero del «rifallo ancora» detto tre volte senza traccia nel
  registro: una riga `[domande]` per ogni passaggio (ricevuta, in viaggio,
  presa, non presa, riconsegnata, al supervisore), «presa» solo con la
  consegna partita, una sola riconsegna, poi il supervisore. Esito visibile:
  PC e pagina via `esitoRisposta`. **Controllare l'app Android**: deve leggere
  le frasi nuove («Presa: …», «Non presa …», «Ricevuta: la sto portando…»).
  Se `android/` non cambia, va detto nel rapporto perché basta così.

## Dopo le tre unioni

TypeScript, test di main, servizio, renderer, condivisi e pty, Android; poi la
prova di 2 ore (`prova-due-ore-mai-fermo.md`), mai prima.
