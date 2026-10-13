---
titolo: "«Sposta su ▾» nel dettaglio dei Progetti: da qualsiasi PC verso qualsiasi PC (0.71.0)"
quando: 2026-10-13T13:15:00+02:00
tag: ["progetti", "trasloco", "ponte", "pagina", "app", "decisione di Nicholas", "0.71.0"]
---

# La richiesta

Nicholas, 13/10: «come faccio nella scheda Progetti a cambiare un progetto da un PC all'altro?? deve essere lì che gestisco tutto».

Prima c'erano due strade, entrambe parziali:
- «Lavora su questo PC» spostava il progetto solo verso il PC dove sei;
- «Sposta progetto…» era nascosto negli Strumenti e andava solo da questo PC a un altro.

Spostare da A a B stando su C non si poteva.

# Com'è fatto

- **Nel dettaglio**, sotto lo stato, c'è la riga «Dove vive: X» con «Sposta su ▾» accanto (PC, pagina e app).
  - L'elenco mostra tutti i PC della stessa chiave di casa: questo PC per primo, poi gli altri per nome.
  - Per ognuno si vede se è acceso o spento (battito più vecchio di 5 minuti = spento).
  - Il PC dove il progetto vive adesso è nell'elenco ma non si può scegliere.
- **Conferma**: un riquadro con il riassunto, scritto dal PC (`riassuntoSposta`). Dice:
  - da dove e verso dove;
  - quante chat e quanti file;
  - cosa succede alle chat aperte;
  - quando le copie degli altri PC vanno nel recupero;
  - un avviso se il PC di arrivo risulta spento.
- **Dove parte** (`comeSpostare`): il trasloco di sempre (`src/main/trasloco.ts`) gira **sul PC di arrivo**.
  - Se l'arrivo è questo PC, parte qui con `trasloco.avvia`.
  - Se no, la richiesta va al PC di arrivo per il ponte (`spostaVerso` → `/api/trasloco/avvia`). Prima si salva qui sul Drive; se il salvataggio o il PC di arrivo non rispondono, «qui non è cambiato niente».
- **Un'azione sola**: `sposta-su {progetto, pc}` in `azioneDriveGlobale`. Il telefono la manda con `/api/drive/azione`.
- **I dati per pagina e app**: il PC aggiunge a ogni riga `spostaSu`, cioè le destinazioni (`destinazioniSposta`) ciascuna con il suo riassunto.
- **L'avanzamento si vede su tutti i PC con una copia.** Nella richiesta `/api/trasloco/salva` il PC di arrivo manda anche `trasloco` e `verso`. Chi la riceve mette il trasloco fra i `traslochiSeguiti` e ne legge lo stato ogni 3 s, come fa già il PC che l'ha chiesto. «Annulla tutto» e il recupero di 30 giorni sono quelli del trasloco.
- **«Sposta progetto…»** resta negli Strumenti come scorciatoia: fa la stessa cosa partendo da una cartella di questo PC.

# Prove

- **Test:**
  - `tests/shared/sposta-su.test.ts`: elenco, qui o ponte, riassunto, PC spento;
  - `tests/main/sposta-su-pagina.test.ts`: la pagina;
  - `SpostaSuTest.kt`: l'app;
  - `pannello-drive-app.test.ts`: aggiornato.
- **Clic veri nella copia di prova:**
  - l'elenco mostra questo PC come «dove vive adesso» (non sceglibile) e il PC d'esempio come spento;
  - la conferma riporta il riassunto e l'avviso;
  - la conferma senza Drive dà «Il salvataggio sul Drive non è riuscito…: qui non è cambiato niente».
- **Da fare dopo che Nicholas installa la 0.71.0 sui PC:** la prova vera via ponte fra due PC veri, su un progetto «SierraDeck-prova-…». La strada del ponte (`/api/trasloco/avvia`) è quella provata dal vero il 12/10 con la 0.65.0.
