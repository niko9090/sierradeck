---
titolo: "Chat arrivate dal Drive con la cartella di un altro PC: dove si aprono (0.25.2)"
quando: 2026-09-13T21:30:00+02:00
tag: ["drive", "chat", "progetti", "cwd", "portatile", "prestazioni"]
---

# Il difetto

Nicholas (2026-09-13, dal portatile): «quando entro in una chat che ha
scaricato dal cloud mi dà errore perché la directory non viene trovata:
puntano alla directory dell'altro PC». Una chat fonduta/ripristinata dal
Drive porta la `cwd` del PC d'origine dentro il `.jsonl` e nel layout; su un
altro PC la cartella non esiste e lo spawn di Claude Code fallisce.
`rimappaChat` (all'avvio) copriva solo i pane dei workspace **e** solo i
progetti già nel registro: una chat qualunque aperta dall'elenco no.

# Com'è fatto

- `src/main/progetti/cartella-di-chat.ts` (puro, provato):
  `risolviCartellaDiChat({cwd, registro, pcId, cartellaProgetti, esiste, adesso})`
  → `esiste` / `progetto` (via `rimappaCwd`: percorso di un altro PC o
  origine adottata → stessa sottocartella nel progetto di qui) / `adottata`
  (progetto nuovo in `<Progetti SierraDeck>\<ultima cartella>` con
  `adottaOrigine`, registro aggiornato da scrivere). `nomeCartella` accetta
  percorsi di qualunque PC e toglie i caratteri vietati.
- `ipc.ts`: gancio `impostaRisolviCartella(f)`; `pty:spawn` apre in
  `risolviCartella(req.cwd, sessionUuid)` e, se cambia, manda alla finestra
  `chat:cartellaCambiata {sessionUuid, da, a}` (oggi nessuno lo ascolta; il
  pane tiene la cwd vecchia finché il riavvio non la rimappa).
- `index.ts`: il risolutore vero crea la cartella (`mkdirSync`), scrive il
  registro, copia la trascrizione da `projects/<slug(da)>` a
  `projects/<slug(a)>` (altrimenti `--resume` riparte da zero) e scrive nel
  registro «la cartella … qui non c'è: la chat … lavora in …». Qualunque
  errore → resta la cwd chiesta (l'errore di prima, non uno nuovo).
- Limite: la cartella adottata è vuota; il codice arriva da git o da «Porta
  qui». Vale anche dal telefono (passa dallo stesso spawn).

# «La sync blocca il programma»

Il lavoro col Drive era già asincrono (fs/promises, cifratura a pezzi da
4 MB con `cediControllo`, gzip a flusso). A bloccare era il **renderer**:
`sync:lavoro` arrivava a ogni file (6 in parallelo) e `App.tsx` faceva
`setLavoroDrive` su tutto + un orologio a 1 s → ridisegno dell'intera App
(Console e riquadri) di continuo. Rimedi 0.25.2:
- `creaLavoro(adesso, coalescenzaMs)`: nella stessa fase un annuncio ogni
  200 ms (l'ultimo stato vince); inizio/fine/annulla/cambio fase subito. In
  `index.ts` è 200, nei test 0. `sync:progresso` era già a 150 ms.
- `soloTransizioni(prima, dopo)` in `progresso-sync.ts`: l'App cambia stato
  solo su inizio/fine/tipo/esito nuovo; `components/StrisciaLavoroDrive.tsx`
  si iscrive da sola a `onLavoro`, tiene l'orologio e il modale «Dettagli».
- Restano iscritti per intero `PannelloDrive` e `ModaleFusione` (sono
  modali/pannelli, e servono i dettagli): se il catalogo aperto con 1400
  chat espanse dovesse ancora scattare, memoizzare le righe lì.

# Anche in massa, per le chat già scaricate (0.26.0)

Nicholas (2026-09-13): «nel portatile la chat ancora dà errore, deve anche
applicarsi la fix per chat già scaricate». Due cose vere: (1) entrambi i PC
giravano ancora sulla 0.25.1 (gli aggiornamenti si installano alla
chiusura), quindi il gancio allo spawn non era in esecuzione; (2) il gancio
sistemava solo la chat aperta, e l'elenco continuava a mostrare le altre
sotto la cartella dell'altro PC.

Ora `src/main/progetti/rimappa-di-massa.ts` (puro, provato) pianifica gli
spostamenti per tutte le chat dell'indice con una cwd che qui non esiste
(escluse le cartelle nascoste degli strumenti, es. `.claude-mem`), e
`index.ts` li esegue all'avvio (dopo la prima lettura dell'indice) e dopo
ogni lavoro Drive che ha scaricato: trascrizione riscritta riga per riga
(`riscriviCwdRiga`, solo il campo `cwd`, a flusso) sotto lo slug della
cartella di qui, poi rilettura dell'indice. Se sotto lo slug di qui c'è già
una copia più lunga, resta quella e si toglie solo quella dell'altro PC. La
finestra aggiorna la cartella del riquadro (`chat:cartellaCambiata` →
`impostaCartella`). Dettagli del ciclo in
`arrivo-automatico-e-unione-workspace.md`.
