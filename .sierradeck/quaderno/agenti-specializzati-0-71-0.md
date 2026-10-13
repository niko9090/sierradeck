---
titolo: "Agenti specializzati: il coordinatore, i cinque ruoli e l'unione solo dopo la Revisione (0.71.0)"
quando: 2026-10-13T14:10:00+02:00
tag: ["autopilota", "multi-agente", "ruoli", "revisione", "worktree", "0.71.0", "decisione di Nicholas"]
---

# La richiesta

Nicholas, 13/10: «soprattutto li voglio specializzati». Il piano, con la revisione dell'esperto di sistemi multi-agente, è in `piano-autopilota-0-71-0.md`.

# Com'è fatto

- **I ruoli** stanno in `src/shared/ruoli-agenti.ts`: Sviluppo (blu), Interfaccia (viola), Collaudo (verde), Revisione (ambra) e Rilascio (rosso).
  - Ogni ruolo ha le sue istruzioni, che diventano l'inizio del primo messaggio della chat (`preamboloRuolo` in `primoCompito`).
  - Sviluppo, Interfaccia e Collaudo passano dalla Revisione; Revisione e Rilascio no.
- **Il coordinatore** scompone l'obiettivo in `{compito, ruolo, dipendeDa}` (`componiPromptScomposizione`, `leggiScomposizione`).
  - La forma vecchia `["…"]` si legge ancora: il ruolo si ricava dal testo con `ruoloDaTesto`.
  - Il grafo lo tiene il programma, in `Autopilota.ruoliCompiti` (testo del compito → ruolo e compiti che deve aspettare):
    - i cicli si rompono e lo si dice (`grafoSenzaCicli`);
    - il Rilascio aspetta tutti gli altri compiti;
    - la Revisione non la chiede il coordinatore: la crea il programma.
- **Si aprono solo i compiti pronti**: in `apriChatMancanti`, un compito parte quando quelli da cui dipende sono uniti (`compitiFatti`).
- **Si unisce solo dopo la Revisione.**
  - I rami dei ruoli con revisione si salvano (commit) a ogni turno ma non si uniscono più.
  - Con `chiudiChat`, o con «finito», il ramo va alla Revisione: il compito `testoRevisione` dice quale chat; le chat autrici ancora al lavoro si fermano.
  - La Revisione lavora nella cartella del ramo che rivede, in sola lettura. Alla seconda lettura dello stesso ramo riusa la stessa chat, che ricorda cosa aveva chiesto.
- **Il verdetto lo controlla il programma** (`giudicaRevisione` in `server.ts`):
  - senza la riga `REVISIONE: OK|DA RIFARE` si chiede di chiuderla;
  - un «OK» vale solo se i criteri passano **nel ramo** e c'è almeno un file citato (`verdettoAccettato`); allora si fa l'unione;
  - un conflitto all'unione vale «da rifare», con le istruzioni per riallinearsi;
  - «da rifare» rimanda le note alla chat autrice;
  - al terzo rifacimento (`RIFACIMENTI_MAX` = 2) decide Nicholas, con una domanda che ha già la scelta consigliata.
- **La fine.**
  - Quando tutti i rami sono approvati e uniti, la chat autrice dell'ultimo fa un giro senza lavoro («rispondi solo fatto»).
  - Il supervisore misura i criteri sul risultato unito e dichiara «finito»; poi gira il T6 di sempre (worktree tolti, push e pubblicazione secondo la regola).
- **I divieti di ruolo**, imposti dal programma con l'hook PreToolUse (`giudicaRuolo` in `divieti.ts`):
  - la Revisione non usa Edit o Write, non usa i comandi git che cambiano il ramo e non cancella;
  - nessun ruolo esegue l'installatore di SierraDeck né chiama `/api/installa`;
  - leggerne il nome resta permesso (gh release upload, ls, grep).
- **Dove si vede**: `alberoChat` mette nel nodo il ruolo (parola e colore) e «approvato e unito». Lo disegnano il PC (`AlberoChat.tsx`), la pagina (`alberoHtml`, `coloreRuolo`) e l'app (`RigaAlbero`, `RuoloChat`).

# Cosa resta com'era

- Un autopilota con **una chat sola**, senza worktree: nessun ruolo e nessuna revisione.
- Gli autopiloti di prima della 0.71.0: le loro chat non hanno ruolo, quindi niente gate.

# Trappole

- Una chat autrice **già approvata** che fa altri commit (per esempio per correggere i criteri sul risultato unito) viene unita dal T6 senza una seconda revisione. È un punto aperto.
- Il revisore usa la cartella dell'autore: i worktree si tolgono solo nel T6. Non toglierli all'approvazione, o l'ultimo giro non ha più una cartella dove ripartire.

# Test

- `tests/shared/ruoli-agenti.test.ts`: ruoli, scomposizione, cicli, verdetto.
- `tests/shared/ruolo-visibile.test.ts`: TS e pagina.
- `RuoloChatTest.kt`: l'app.
- `server.test.ts`, che copre:
  - «a lavoro finito… finisce solo dopo l’ok della Revisione su ogni ramo»: il percorso completo;
  - «la Revisione decide l’unione, il programma la controlla»: OK con un file, OK con i criteri rossi, troppi rifacimenti, divieti.

La prova dal vero è nel rapporto della 0.71.0.
