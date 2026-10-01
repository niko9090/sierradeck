---
titolo: "Scheda dell'autopilota: linguette Domande e File, finestre pannello su altri schermi (0.38.0)"
quando: 2026-10-01T22:30:00+02:00
tag: ["autopilota", "domande", "file", "finestre", "decisione-nicholas"]
---

# Le decisioni di Nicholas (01/10)

- **Domande:** «sotto dove ci sono i tab aggiungi domande con anche il numerino delle domande non risposte e le voglio vedere singole così viene bene! ma le fai solo lì non nella chat e quando ho risposto domanda e risposta compaiono nella chat chiudendo il tab».
- **File:** una linguetta per controllare i file che l'autopilota cambia.
- **Staccare:** ogni linguetta si stacca in una finestra **vera**, «si su un altro schermo esatto non come chat».

# Linguetta «Domande»

- **La logica pura** sta in `src/shared/domande-autopilota.ts`:
  - `domandeScheda(a, aperte)`: le domande del servizio di quell'autopilota, dalla più vecchia, con l'origine (preparazione, lavoro, «Pubblico adesso?»), più il **via** per ultimo se `pronto`;
  - `richiestaScheda`: `/api/rispondi`, oppure `/api/autopilota/vai` per «Vai», altrimenti dialogo;
  - `tracciaDopoRisposta`, `dopoLaRisposta`, `domandaArrivata`.
- **La traccia «domanda e risposta» la scrive il servizio:**
  - in `POST /domande/:id/risposta` (non per le domande della preparazione, che hanno già l'intervista);
  - in `/vai`, come voci `dialogo` con `traccia: true`.
  - `staPensando` ignora la traccia; `conversazione()` non mostra più la domanda aperta, il via e le note «chiediUtente»: al loro posto c'è una nota che rimanda alla linguetta.
- **PC:** `DomandeAutopilota.tsx` dentro `DiarioAutopilota`.
  - La linguetta compare solo con domande, con il numerino, e si fa avanti quando ne arriva una. Finite le domande, si torna alla linguetta di prima.
  - `ChatAutopilota` non risponde più alle domande: si limita a dialogare.
- **Colonna Domande:**
  - per un autopilota c'è una riga «ti aspetta (N) → apri», che manda l'evento `sierradeck:domande-autopilota` (lo ascolta `DiarioAutopilota`; se nessuno risponde si apre il pannello Autopiloti);
  - `quanteAspettano` somma `quante` (tutte le domande).
- **Pagina e app:**
  - `/api/autopilota` manda `domandeScheda`;
  - la pagina (`richiestaSchedaAp`, provata uguale a `richiestaScheda`) e l'app (`SchedaAutopilota.kt` → `richiestaScheda`, `linguetteAutopilota`) le mostrano una per volta;
  - la scheda Domande del telefono rimanda alla scheda dell'autopilota.

# Linguetta «File»

- **Parti pure** (`src/shared/file-autopilota.ts`):
  - `leggiStatusPorcelain`, `leggiNumstat` (binari, rinominati con le graffe), `leggiNameStatus`;
  - `unisciFile` (in commit e da salvare; un file in tutti e due è «da salvare»);
  - `cartelleDaGuardare` (progetto e worktree delle chat), `leggiDiff`, `percorsoSicuro`.
- **Git nel main** (`src/main/file-autopilota.ts`):
  - solo comandi di lettura, **asincroni** (`execFile`): la linguetta rilegge ogni 4 s e il main non deve fermarsi;
  - tutto dalla radice del repository (`rev-parse --show-toplevel`), perché `status --porcelain` dà i percorsi da lì.
  - IPC `autopilota:file|diff`; rotte `/api/autopilota/file|diff` per telefono e pagina.
  - Il percorso per il diff deve essere fra quelli appena elencati per quella chat.
- **Base del confronto:** `commitBase` (nuovo, scritto alla prima partenza da `avviaAutopilota` con `rev-parse HEAD`). Per gli autopiloti partiti prima si usa `ramoBase`, altrimenti solo le modifiche non salvate (`HEAD`).

# Finestre pannello

- **Funzioni pure** (`src/shared/finestra-pannello.ts`):
  - `sistemaPosizione`: schermo assente → centro del principale; fuori dall'area visibile → dentro; grandezza tra il minimo e lo schermo;
  - `schermoDi`, l'archivio (`posizioni` per `autopilota|linguetta`, `aperti`), `daRiaprire`.
- **Il main** (`src/main/finestre-pannello.ts`): `BrowserWindow` con `contextIsolation`, preload e niente `nodeIntegration`, come le altre (anche `sandbox: false`, come le altre).
  - Carica `?pannello=<linguetta>&autopilota=<id>`.
  - Ricorda posizione e schermo (`chiaveMonitor`) in `pannelli.json`.
  - Chiusa da chi la usa: la linguetta torna nella barra (evento `pannelli:cambiati`).
  - Chiusa l'app (`before-quit`, o l'ultima finestra di chat se ne va: `chiudiPannelliConLApp`): resta segnata e si riapre al riavvio con `riapriPannelli`, se l'autopilota esiste ancora.
- **Trappola importante:** tutto il main trattava ogni `BrowserWindow` come una finestra di chat (slot, layout, tray, conteggio, consegne). Ora `index.ts` e `ipc.ts` usano **`finestreDiChat()`**, che esclude le finestre pannello. Non usare più `BrowserWindow.getAllWindows()` lì; un test lo controlla.
- **Renderer:**
  - `main.tsx` sceglie `FinestraPannello` se c'è `?pannello=`;
  - il contenuto delle linguette è un componente solo (`LinguettaAutopilota.tsx`) per la scheda e la finestra;
  - «⧉ Stacca» o il trascinamento fuori dalla barra staccano la linguetta; la linguetta staccata sparisce dalla barra.

# Test

- `domande-autopilota.test.ts`, `domande-dal-servizio.test.ts` (giro vero: dopo la risposta il dialogo ha domanda e risposta e la linguetta si chiude), `server.test.ts` (traccia del via), `chat-autopilota.test.ts`, `linguetta-domande.test.ts`;
- `file-autopilota.test.ts` (lettori puri e un repository git vero);
- `finestra-pannello.test.ts` (schermo assente, posizione fuori, grandezza minima, riapertura), `finestre-pannello-separate.test.ts`;
- `client-pagina.test.ts`, `client-rotte.test.ts`;
- `SchedaAutopilotaTest.kt`.
