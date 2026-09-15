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

# 15/09: la regola nuova, «una volta per tutte»

Nicholas: «ci sono ancora delle chat che quando vengono passate dal cloud e
si avviano mostrano directory che non vengono trovate e errori in rosso
praticamente sempre». Diagnosi dal registro del fisso (14-15/09): dopo ogni
arrivo dal Drive «63/48/13 chat rimappate», e la chat «fionda apl» del
portatile (`E:\Documents\Progetti SierraDeck\fionda apl`) stava qui in
`C:\Users\nikof\Progetti SierraDeck\fionda apl`, **vuota**. Il meccanismo
del 13-14/09 era sbagliato in un caso: **adottava anche le cartelle che un
altro PC ha davvero**, rapendo la chat in una cartella senza file. In più
`altroveQui` escludeva per sempre gli aggiornamenti della copia vera
(stesso uuid sotto un'altra cartella), e le due copie divergevano; e i
subagenti (`<uuid>/subagents/`) restavano sotto lo slug vecchio.

## Com'è adesso

- **Chi ha una cartella** (`src/shared/posta.ts`): `pcCheHaLaCartella(cwd,
  battiti, me)` guarda i battiti `pc-<id>` degli altri PC (`cartelle` +
  `chat`), anche vecchi (un PC spento ha ancora le sue cartelle). Il
  battito ora elenca **tutte le cartelle dell'indice che esistono su quel
  PC**, non solo i progetti collegati. Il postino ricorda gli altri PC in
  `pc-altrui.json` (`memoria`) e li rilegge ogni 2 minuti (`altrui()`).
- **`altrove(cwd)`** in `index.ts`, tre fonti: battiti; registro dei
  progetti (percorso di un altro pcId); `sincronia.slugRecenti(7 giorni)`
  (una cartella con chat toccate sul Drive di recente è viva su qualche PC,
  serve finché l'altro PC non ha la 0.27.0).
- **`risolviCartellaDiChat`** ha `altrove` e `forza`: se la cartella non
  c'è ed è di un altro PC → `motivo: 'altrove'`, nessuna cartella creata.
  `pty:spawn` allora fallisce con `CHAT_DI_UN_ALTRO_PC:{json}`
  (`messaggioChatAltrove`/`leggiChatAltrove` in shared); `aggancio.ts` lo
  riconosce (`suAltrove`) e `Terminal.tsx` mostra il riquadro «Questa chat
  lavora su X» con «Scrivile là» (`ModalePosta` con `presel`) e «Aprila qui
  lo stesso» (`forzaQui: true` nella richiesta, `aggancio.rilancia()`).
- **Prima di risolvere, la cartella vera è dove sta la trascrizione**: se il
  riquadro chiede una cartella che esiste ma non ha quel `.jsonl`, si parte
  dalla cwd dell'indice (altrimenti `--session-id` = chat vuota).
- **Il ritorno** (`pianificaRitorno` in `rimappa-di-massa.ts`): le chat
  sotto una cartella adottata qui la cui `origine` (registro) è di un altro
  PC tornano sotto l'origine, cwd riscritto all'indietro, tiene la più
  lunga. Gira insieme alla rimappatura (avvio e dopo ogni arrivo). La
  rimappatura salta le cartelle altrui (`risolvi` → undefined).
- **`spostaSidecar`**: la cartella `<uuid>/` va con la chat (rename, o i
  file mancanti uno a uno).
- **`altroveQui(p, sizeDrive)`** esclude solo se la mia copia sotto l'altra
  cartella è almeno lunga quanto quella del Drive: la copia più avanti
  dell'altro PC arriva, e la rimappatura/ritorno tiene la più lunga.
- **Telefono**: `/api/sessioni` ha `altrove: nome`; `/api/sessioni/riprendi`
  → 409 spiegato. Pagina: «· su X»; app: `SessioneRipresa.altrove` + nota
  d'errore globale.
- **`fondiRegistri`**: stessa origine = stesso progetto (id più vecchio).
- I riquadri del layout con una cartella altrui non vengono più rimappati
  all'avvio (`altroveRiquadro`).

## Limiti

- Un'origine che **nessun** PC ha (vecchio percorso di questo PC, disco
  scollegato da più di 7 giorni) si adotta ancora in una cartella vuota: è
  il caso «la cartella non esiste più da nessuna parte». Un disco di rete
  (`Z:`) staccato da poco è protetto dalla regola dei 7 giorni; staccato da
  più, la chat viene adottata.
- Il PC che ha la cartella deve aver girato almeno una volta con la 0.27.0
  e il Drive collegato per lasciare il battito.
