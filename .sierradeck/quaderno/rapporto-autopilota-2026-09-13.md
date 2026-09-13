---
titolo: "Rapporto dell'autopilota: controllo completo e correzione dei difetti (13 settembre 2026)"
quando: 2026-09-13T23:55:00+02:00
tag: ["rapporto", "autopilota", "drive", "chat", "workspace", "telefono"]
---

Mandato: `mandato-controllo-completo-2026-09-13.md`. Tutto il lavoro è in
sette commit locali su `main` (da `779268f` a `2c1fd01`), non pubblicati:
la versione in `package.json` resta 0.25.2, in `src/shared/novita.ts` c'è
la voce 0.26.0 pronta. Typecheck a 0, suite vitest 2238 test verdi (168
file). **`android/` è cambiato** (`Drive.kt`): alla prossima release l'APK
va ricompilato e bumpato (2.29.0).

# 1. Cosa ho trovato (le cause vere)

## «Sul portatile la chat dà ancora errore»

- Entrambi i PC giravano sulla **0.25.1** (registro del fisso:
  `sessione avviata · SierraDeck v0.25.1` alle 20:24:58Z). Gli
  aggiornamenti si installano alla chiusura, quindi la correzione della
  0.25.2 (`impostaRisolviCartella` in `src/main/ipc.ts:pty:spawn`) non era
  in esecuzione quando hai provato.
- Ma non bastava: quel gancio sistemava solo la chat che aprivi, e l'elenco
  continuava a mostrare tutte le altre sotto la cartella dell'altro PC
  (`C:\Users\nikof\Documents\Wdeck` del portatile sul fisso, e viceversa).
- Terzo motivo, dal telefono: `/api/sessioni/riprendi`
  (`src/main/client-rotte.ts`) confrontava la cartella con l'elenco ricavato
  dai nomi delle cartelle di Claude Code, che perdono trattini, sottolineature
  e spazi (`Game_ascensore` → `Game\ascensore`): ogni chat con uno di quei
  caratteri rispondeva 403 «cartella non conosciuta».

## «Sul fisso non sono apparse le chat del portatile»

- Le chat c'erano: alle 20:10Z la fusione ha scaricato 532 file, e
  l'indice del fisso (`index.db`, 1272 sessioni) contiene gli slug del
  portatile (`C--Users-nikof-Documents-Portfolio` 539, `…-Wdeck` 9,
  `…-Game-ascensore` 30, …; 621 sono sessioni «observer» del plugin
  claude-mem, non tue chat).
- L'indice però si rileggeva **solo all'avvio** e col pulsante «Rileggi»
  (`src/main/ipc.ts:registerSessionIpc`): fino al riavvio delle 20:24Z
  l'elenco era quello di prima.
- E i workspace del portatile non potevano arrivare: vedi sotto.

## Il salvataggio automatico solo caricava

`salvaSeServe()` chiamava solo `salva()`. Le chat dell'altro PC scendevano
solo con «Fondi» o «Porta qui». Confermato in `src/main/cassaforte/sincronia.ts`.

## «SALVA conflitto su workspaces.json / impostazioni.json: vince questo PC»

- `sierradeck/workspaces.json` è **un file solo sul Drive per tutti i PC**.
  `salvaIncrementale` lo caricava com'è sul disco: ogni salvataggio
  automatico (ogni 5 o 15 minuti, su ogni PC) sovrascriveva sul Drive
  l'archivio dell'altro PC. Il conflitto era la regola, non l'eccezione; e
  `fondiArchivi` in fusione trovava sul Drive il proprio stesso archivio
  appena salvato: niente da unire. **Questo è il motivo per cui i workspace
  del portatile non comparivano mai sul fisso.** Nessuna perdita sui PC (il
  file locale non veniva toccato), perdita continua sul Drive.
- `impostazioni.json` e `istantanee.json` sono file per-PC: che l'altro li
  riscriva sul Drive è normale, e veniva contato e loggato come conflitto.

# 2. Cosa ho cambiato

## `779268f` fix(drive): l'archivio dei workspace sale come unione

- `src/main/cassaforte/incrementale.ts`: `salvaIncrementale` accetta
  `sostituto(percorso, contenuto, base)`: il contenuto da caricare al posto
  del file; un percorso sostituito non è un conflitto; se il Drive ha già
  quell'impronta non sale niente; la voce nel manifesto porta la firma del
  file locale (così il giro dopo non lo rivede come cambiato).
- `src/main/cassaforte/sincronia.ts`: `unioneWorkspace` = `fondiArchivi(mio,
  drive, 'unione')` per `sierradeck/workspaces.json`. I conflitti su file
  `sierradeck/*` non fanno numero e non fanno rumore (una riga «… riscritti
  da un altro PC: sono file per-PC»).
- Test: `tests/main/cassaforte-workspace-unione.test.ts` (tre PC, l'unione
  sul Drive, il locale intatto, nessun conflitto, impostazioni per-PC).
- Cosa vedi: nel registro spariscono i conflitti a ogni giro; nella scheda
  Drive «Per workspace» compaiono i workspace dell'altro PC come «solo sul
  Drive», da portare qui con «Porta qui il workspace».

## `39214be` feat(drive): l'arrivo automatico, e la chat più lunga vince

- `src/main/cassaforte/lavoro-in-corso.ts`: tipo di lavoro `arrivo`
  («Arrivo dal Drive»); `EsitoLavoro.scaricati`; `Presa.fine(..., scaricati)`.
- `src/main/cassaforte/sincronia.ts`: `arrivo()` (guarda prima, prende il
  lavoro solo se c'è qualcosa; solo prefisso `chat`; esclude le chat già qui
  sotto un'altra cartella; niente cancellazioni); `salvaSeServe()` lo chiama
  dopo il salvataggio; `quadroLocale()`/`altroveQui`; il ripristino
  completo esclude anch'esso le chat già qui altrove.
- `src/main/cassaforte/incrementale.ts`: dep `escludi`; per le chat in
  conflitto vince la **più lunga** (non la più recente).
- `src/main/cassaforte/fusione.ts`: nel piano una chat solo-Drive che qui
  sta sotto un'altra cartella diventa «già qui, in un'altra cartella» e si
  salta.
- Etichette e passi: `src/renderer/progresso-sync.ts`, `App.tsx`,
  `src/main/client-pagina.ts`, `android/…/Drive.kt`.
- Test: `tests/main/cassaforte-arrivo.test.ts`.
- Cosa vedi: dopo ogni salvataggio automatico, se c'è qualcosa, la striscia
  «Arrivo dal Drive» con barra e «Annulla»; sul telefono lo stesso.

## `0c3200c` fix(chat): rimappatura in massa e indice aggiornato senza riavvio

- `src/main/progetti/rimappa-di-massa.ts` (puro): `pianificaRimappatura`
  (chat con cwd inesistente → cartella di qui, una domanda per cartella,
  cartelle nascoste degli strumenti escluse), `riscriviCwdRiga`,
  `sostituisciPrefisso`.
- `src/main/index.ts`: `risolviSuDisco`, `riscriviTrascrizione` (a flusso,
  con contropressione), `rimappaChatSulDisco` (sposta la trascrizione sotto
  lo slug di qui; se qui ce n'è una più lunga resta quella), `dopoArrivo`
  (rilettura indice → rimappatura → `rimappaChat()` dei workspace →
  rilettura → evento `chat:arrivate`), e all'avvio dopo la prima lettura.
- `src/main/ipc.ts`: `reindicizzaSessioni()` (letture in fila) e
  `primoIndice()`.
- Renderer: striscia «N chat arrivate dal Drive … Apri l'elenco» in
  `App.tsx`; `impostaCartella` nello store del layout; preload/env.d.ts.
- Test: `tests/main/rimappa-di-massa.test.ts`.
- Cosa vedi: nell'elenco Chat le chat dell'altro PC stanno sotto la
  cartella di qui e si aprono; al primo avvio con la 0.26.0 la rimappatura
  di tutto il pregresso avviene da sola (riga nel registro «N chat rimappate
  nelle cartelle di qui»).

## `5e982c2` docs + alla chiusura si sale soltanto

- `salvaSeServe({ conArrivo: false })` da `before-quit`: c'è un tetto di
  45 s, uno scaricamento troncato non serve. Voce 0.26.0 in `novita.ts`.
  Schede `arrivo-automatico-e-unione-workspace.md` e aggiornamento di
  `chat-di-un-altro-pc-cartella-mancante.md`.

## `2c1fd01` fix(telefono, sistema)

- `/api/sessioni/riprendi` confronta per slug (test in
  `tests/main/client-rotte.test.ts`).
- `attendiLavoroDrive()` prima di installare un aggiornamento o riavviare
  (`sistema:riavvia`): fino a 10 minuti, come la quiete delle chat. Prima
  un aggiornamento poteva chiudere il programma a metà di una fusione.
- `Drive.kt`: l'esito «arrivo» non resta nella scheda, come sul PC.

## `5a119e8`, `b2653d3` test(vitest): la suite misurabile da un file

- `vitest.config.ts`: `testTimeout`/`hookTimeout` a 20 s (sotto carico il
  test dell'autopilot-host che aspetta un servizio vero superava i 5 s) e
  reporter `tests/riepilogo-semplice.ts` in coda a quello di serie: su
  Windows vitest colora anche senza terminale e la riga «Tests N passed»
  cominciava con un codice ANSI, invisibile a `grep '^ *Tests'`. Scheda:
  `autopilota-criteri-e-bash.md`.

# 3. Cosa ho controllato e va bene

- `salvaIncrementale`: le chat non si cancellano mai dal Drive per sparizione
  locale (`copie(prefisso)` solo per i progetti); il manifesto locale è
  sempre filtrato a ciò che sta sul disco (`soloSuDisco`). Confermato.
- La cifratura va a pezzi da 4 MB con cessione del controllo, gzip a
  flusso, letture/scritture con `fs/promises`: il motore non blocca il
  processo. Il blocco visto da Nicholas era il renderer (0.25.2).
- `lavoro-in-corso`: un lavoro alla volta; il salvataggio automatico che
  parte durante una fusione riceve «LAVORO_IN_CORSO» e riprova al giro
  dopo. L'arrivo automatico segue la stessa regola.
- `before-quit`: salva il layout, poi `salvaSeServe` con tetto di 45 s, poi
  chiude PTY host e DB. Coerente.
- Aggiornamenti: dalla 0.25.1 ogni fase è nel registro; i due percorsi
  (finestra con «Installa e riavvia», silenzioso alla chiusura) sono
  documentati in `aggiornare-senza-perdere-lavoro.md`.
- Telefono: pagina e app hanno le stesse etichette dei lavori, la stessa
  finestra di attesa del catalogo, le stesse rotte Drive.
- `rimappaChat()` all'avvio copre i pane dei workspace per i progetti nel
  registro; con l'adozione automatica delle origini ora copre anche le
  cartelle sconosciute.

# 4. Difetti trovati e NON corretti (per gravità)

1. **Ripristino completo e file per-PC** — `sincronia.ripristina()` scarica
   anche `sierradeck/impostazioni.json` e `istantanee.json` se sul Drive
   sono più recenti: «Ripristina dal Drive» su un PC porta qui le
   impostazioni dell'altro (tema, cartella dei progetti, preferenze). Non è
   una perdita silenziosa (c'è la copia `workspaces.prima-del-ripristino`
   solo per i workspace, non per le impostazioni). Correzione proposta: in
   `ripristina()` escludere i due file quando esiste già una copia locale,
   o farne una copia `impostazioni.prima-del-ripristino.json`. Rischio
   basso. Non fatto: è un'azione esplicita e rara, e cambia una semantica
   che Nicholas potrebbe volere (primo avvio di un PC nuovo).
2. **Un workspace cancellato su un PC resta nell'unione sul Drive** e
   ricompare con «Fondi» in modalità unione (come le chat: il Drive è la
   memoria lunga). Correzione proposta: un «Togli il workspace dal Drive»
   nella scheda Drive, accanto a «Togli la cartella». Rischio basso.
3. **La stessa chat sotto due slug sul Drive.** Dopo la rimappatura la chat
   sta qui sotto lo slug locale e il prossimo salvataggio la carica come
   percorso nuovo: sul Drive convive con quello dell'altro PC. Il catalogo la
   mostra una volta («di un altro PC»/`altroveQui`), l'arrivo e la fusione
   non la riscaricano. Costo: spazio doppio sul Drive per le chat che
   viaggiano. Correzione futura: chiave per uuid nel manifesto, o pulizia
   dei percorsi «gemelli» quando il contenuto è identico. Rischio medio.
4. **Sessioni «observer» di claude-mem** (`C:\Users\…\.claude-mem\observer-
   sessions`, 621 sul fisso) sono nell'elenco Chat e viaggiano sul Drive
   come chat. Non si rimappano (cartelle nascoste escluse) e non si aprono
   in modo utile. Correzione proposta: escludere dal prefisso `chat` e
   dall'indice gli slug con `--claude-mem-`, o mostrarli in una sezione a
   parte. Rischio basso, ma va deciso con Nicholas.
5. **Il riquadro non sa che la sua cartella è cambiata finché non riapre.**
   `chat:cartellaCambiata` aggiorna `cwd` nel layout, ma il titolo/percorso
   nell'intestazione si aggiorna al prossimo ridisegno del pane. Cosmetico.
6. **`sistema:riavvia` e aggiornamento aspettano fino a 10 minuti un lavoro
   Drive** senza dirlo nella finestra (solo nel registro). Correzione:
   annunciare la fase «aspetto il Drive» nello stato dell'aggiornamento.
   Cosmetico.
7. **`impostazioni.json` last-writer-wins sul Drive**: innocuo sui PC, ma un
   PC nuovo che fa «Ripristina» prende le impostazioni dell'ultimo che ha
   salvato, non necessariamente quelle che vorresti. Legato al punto 1.

# 5. Cosa deve fare Nicholas

1. **Pubblicare la 0.26.0** (con Claude: bump `package.json` a 0.26.0,
   ricompilare l'APK → 2.29.0 perché `android/Drive.kt` è cambiato,
   `app-android.json`, note dalla voce 0.26.0).
2. Su **tutti e due i PC**: chiudere e riaprire SierraDeck dopo che
   l'aggiornamento è sceso (o «Installa e riavvia»). Verificare in
   Impostazioni che la versione sia 0.26.0 su entrambi: finché uno dei due
   è indietro, quello continua a sovrascrivere `workspaces.json` sul Drive
   con il vecchio metodo.
3. Al primo avvio con la 0.26.0, su ciascun PC: aspettare la fine della
   prima lettura dell'indice; nel registro compare «N chat rimappate nelle
   cartelle di qui». Le chat dell'altro PC stanno ora sotto
   `Documenti\Progetti SierraDeck\<nome>` (o nella cartella del progetto già
   noto) e si aprono dall'elenco Chat.
4. Entro il primo giro automatico (un minuto dopo l'avvio, poi ogni 5 o 15
   minuti) parte l'«Arrivo dal Drive» se c'è qualcosa; in alto compare «N
   chat arrivate dal Drive».
5. Per i workspace dell'altro PC: scheda ☁ Drive → «Per workspace» →
   «Porta qui il workspace». Dopo il primo salvataggio di entrambi i PC con
   la 0.26.0 il Drive contiene l'unione; prima di quel momento la scheda può
   ancora mostrare solo i workspace dell'ultimo PC che ha salvato.
6. Sul telefono: accettare la 2.29.0 quando compare la banda.

# 6. Cose lasciate aperte

- La pubblicazione (vietata dal mandato) e la compilazione dell'APK.
- I sette punti della sezione 4, in particolare il primo e il secondo, che
  richiedono una scelta di prodotto.
- Un controllo dal vivo sul portatile: qui ho i dati del fisso e i test;
  la prova vera è aprire una delle chat che dava errore dopo l'aggiornamento
  di entrambi i PC.
