---
titolo: "Rapporto dell'autopilota 2: dialogo con gli autopiloti e controllo completo delle 11 aree (14 settembre 2026)"
quando: 2026-09-14T06:30:00+02:00
tag: ["rapporto", "autopilota", "controllo", "dialogo", "drive", "progetti", "aggiornamenti", "telefono"]
---

Mandato: `mandato-controllo-completo-2-2026-09-14.md`. Tutto il lavoro è in
sette commit locali su `main`, da `97d985b` a quello che contiene questo
rapporto, non pubblicati: `package.json` resta 0.26.0, in
`src/shared/novita.ts` la voce **0.27.0** è in cima con tutte le righe.
Typecheck a 0, suite vitest verde (2275 test in 171 file, riga «Tests N
passed» del reporter in chiaro). **`android/` è cambiato** (`Lavori.kt`,
`Modelli.kt`, `Api.kt`, `Computer.kt`, `Drive.kt`): alla prossima release
l'APK va ricompilato e bumpato (2.30.0). Ho lavorato nella mia chat, aperta
nuova dall'autopilota; non ho trovato dentro la storia di nessun altro.

Il metodo: per la Parte B ho lanciato sei revisori di sola lettura, uno per
coppia di aree, che hanno tracciato i percorsi con file:riga; ho verificato
ogni sospetto sul codice prima di correggere, e ho corretto solo ciò che si
poteva provare con un test o con il typecheck. Ciò che non ho corretto sta
nella sezione 4 con scenario, causa, correzione proposta e rischio.

# 1. Cosa ho trovato (le cause vere)

## Perché il mandato 1 è finito nella chat di Nicholas (sessione ffea9ea8-…)

`eseguiConsegna` in `src/renderer/consegne-autopilota.ts`: quando nessun
riquadro aveva la sessione decisa dal servizio (cioè **sempre**, per una chat
che deve nascere) chiamava `ponte.adottabile(cwd, autopilotaId, workspace)`,
che restituiva **la prima chat aperta sulla stessa cartella e nello stesso
workspace** non governata da un altro autopilota. Era una scelta di prodotto
scritta nel commento («chi attiva un autopilota smette di operare lui: quella
chat è sua», 0.12.x). `adotta()` assegnava il riquadro all'autopilota,
uccideva il terminale (`iberna` + `pty.kill`) e lo faceva rinascere con
`--resume <sessione di Nicholas>` e gli hook `?ap=<id>`; al primo `Stop`,
`suStop` in `server.ts` riscriveva `sessionId` con quello della sua chat,
buttando via il `randomUUID` scelto alla creazione. Il filtro sul workspace
non bastava: il mandato è stato lanciato dallo stesso workspace in cui
Nicholas lavorava sulla stessa cartella, il caso più normale. Scheda:
`autopilota-chat-sbagliata-adozione.md`.

## Il resto, in ordine di gravità

- **Ogni chat parlava con Anthropic qualunque fornitore fosse impostato**:
  `src/pty-host/host.ts` ometteva `env` nello spawn (campo facoltativo, nessun
  errore).
- **L'updater non ha mai aggiornato Claude Code**: `execFileSync('npm.cmd')`
  senza shell dà `EINVAL` da Node 22 (Electron 43 porta Node 24), e il catch
  lo trasformava in «non lo so». Provato con il Node della macchina.
- **«Togli» su A + «Prendi il testimone» su B cancellava la cartella di B**,
  `.git` compreso: con nessuna voce sul Drive sotto il prefisso,
  `ripristinaIncrementale({ elimina: true })` leggeva ogni file del manifesto
  locale come «tolto dall'altro PC».
- **Rinominare un workspace lo sdoppiava al primo salvataggio**: le ricevute
  delle finestre (`consegne-layout.ts`) tenevano il nome vecchio, l'archivio
  ricreava il workspace vecchio con le chat e svuotava il nuovo.
- **Se SierraDeck Update non si faceva vivo, gli autopiloti restavano in
  pausa** fino a un riavvio e al prossimo avvio le chat leggevano «tornato su
  con la versione nuova» senza che fosse successo (`aggiornamenti.ts:411`).
- **`sistema:riavvia` con un aggiornamento pronto** faceva partire insieme
  l'installer silenzioso e la versione vecchia, che NSIS uccideva dopo un
  secondo: è il «torna la vecchia e si chiude da sola» del 13/09.
- **«Mandaglielo» falliva sempre**: il client del servizio ha un tetto di 3 s
  per chiamata e `parla` interroga `claude.exe` (minuti); il cambio veniva
  applicato lo stesso dietro le quinte.
- **La pagina del telefono non si ridisegnava a computer fermo**: il
  dettaglio di un autopilota, le cartelle, la coda, il Drive non erano
  nell'impronta; funzionava solo perché una chat che scrive fa ridisegnare
  tutto.
- **Un'unione dei workspace che non riusciva a leggere il Drive caricava il
  file locale**: era di nuovo il «vince questo PC» chiuso in 0.26.0.
- **`script-pagina.js`** (89 KB) era nel repo: lo scriveva un test
  diagnostico nella radice e il commit `39214be` lo ha preso.

# 2. Cosa ho cambiato

## `97d985b` fix(autopilota): mai adottare la chat di una persona

`eseguiConsegna`: `if (gia === undefined) ponte.apri(c)`. Tolti `adottabile`,
`adotta`, `terminaleDi`, `attendiInQuesto`, `RISVEGLIO_MS` e il parametro
`workspaceAttivo` di `ponteReale`. Un autopilota apre **sempre** un riquadro
suo, con la sessione decisa dal servizio, nel workspace da cui è stato
avviato (o in quello attivo della finestra che riceve la consegna se creato
dall'API senza workspace). Test «mai la chat di qualcun altro».

## `c74ef8c` feat(autopilota): il dialogo con l'autopilota (Parte A)

- Archivio: `dialogo: ScambioDialogo[]` e `daConsegnare: MessaggioPerLaChat[]`
  su `Autopilota`, letti con default `[]` (i file vecchi partono vuoti, senza
  alzare `VERSIONE_AUTOPILOTA`).
- Modulo puro `src/autopilot-host/dialogo.ts`: prompt con obiettivo, stato,
  criteri, compiti, ultime mosse, ultimo detto della chat (`deps.ultimoDetto`),
  domanda aperta, messaggi in coda, dialogo passato; lettura dell'esito
  (`risposta`, `perLaChat?`, `cambio?`, `comando?: ferma|riprendi|rispondi`);
  coda per chiave di chat; preambolo.
- `POST /autopiloti/:id/dialogo`: scrive la battuta `tu`, risponde **202
  subito**, pensa dopo (`rispondiAlDialogo`, una promessa in fila per
  autopilota); applica cambio → messaggio/risposta alla domanda → comando;
  scrive la battuta `lui` con `esito`. Il supervisore è quello dell'autopilota
  (`sessioneSupervisore`), come `chiediCambio`.
- Consegna al momento giusto: in `suStop`, dopo `conservaCambiUtente`, i
  messaggi per quella chat entrano davanti al `reason` (`conPreambolo`) nei
  rami che scrivono nella chat; il supervisore li vede nel quadro
  (`componiPromptDecisione`, 5° parametro); con `sospendi` restano; con
  `finito` si tolgono e il diario lo dice. Alla ripresa
  (`riprendiAutopilota`) e nella risposta tardiva entrano davanti al testo.
- Un autopilota **finito** ripreso rimette in moto le chat (prima nessuna).
- `parla` chiama con 6 minuti di attesa (`ATTESA_PENSIERO_MS`).
- UI: scheda PC (`SchedaAutopilota.tsx`, «Parla con lui», bolle, «sta
  pensando», Ctrl+Invio, «Disfa»), diario, pagina del telefono
  (`vistaAutopilota` + `dialogaAp`, rotta `POST /api/autopilota/dialogo`, 409
  se il PC è vecchio, impronta con tutto ciò che si legge apposta), app
  Android (`Lavori.kt`, `Modelli.kt`, `Api.kt`).
- Test: `tests/autopilot-host/dialogo.test.ts` (18: modulo puro + server con
  supervisore finto), parser, rotte, diario, pagina. Scheda:
  `autopilota-dialogo.md`.

## `637bad1` fix(avvio, aggiornamenti, chat, workspace): aree 1-2-5-6

- Area 1: `guaioChiusura` scrive nel registro (tetto dei 45 s scaduto, PTY
  host, DB, layout, Drive); `annullaLavoroDrivePerUscire` prima del
  salvataggio finale; `PtyHostClient.log` → registro; `pausaLetta` e il file
  della pausa riscritto a ogni consegna; `openDatabase` riprova tre volte su
  `SQLITE_BUSY/LOCKED` e non cancella un file bloccato; l'avvio fallito va nel
  registro.
- Area 2: `disfaPausa` in `creaAggiornamenti` (autopiloti, file della pausa,
  `autoInstallOnAppQuit`) con stato `pronto` + `errore` per esteso; striscia
  `attendo` sul PC e `errore` in `pronto`; `versioneScaricata`; niente
  ricerca durante l'attesa; `copiaDiSicurezzaLayout(cartellaDati)` atomica;
  `aggiornamento.txt` con `scriviAtomico`; `diariUpdater()` su `TEMP`, `TMP`,
  `tmpdir()`; `sistema:riavvia` e `driveRiavvia` installano se c'è un
  aggiornamento pronto; `attendiLavoroDrive` torna `false` e il riavvio lo
  dice; la pagina del telefono legge `stato.aggiornamento` dal polso e
  conosce `installo`, `aggiornato`, `fermo`.
- Area 5: `env` nello spawn dell'host (test); `npm.cmd` con shell;
  `dimenticaSchermo` chiamata davvero (l'id si prende prima di staccare).
- Area 6: `RegistroConsegne.rinomina` chiamata da `workspace:rinomina`
  (test); `scriviOSolleva` per crea/elimina/rinomina; un workspace eliminato
  da un'altra finestra si spegne anche qui.

## `a6fac4f` fix(drive): area 3, i punti 1-4 del rapporto 1

- Punto 1: in `ripristina()` `impostazioni.json` e `istantanee.json` si
  scaricano solo se qui mancano; copie `*.prima-del-ripristino-drive.json` dei
  tre file dell'assetto. Test «Ripristina dal Drive e i file di ogni PC».
- Punto 2: la lapide `Archivio.tolti` (`shared/workspace.ts`, `parseArchivio`),
  `fondiArchivi(..., { perDrive })`, `sincronia.togliWorkspaceDalDrive` /
  `rimettiWorkspaceSulDrive`, `Catalogo.workspaceTolti`, IPC
  `sync:togliWorkspace`/`sync:rimettiWorkspace`, `PannelloDrive` («Togli dal
  Drive» con conferma, elenco «Tolti dal Drive» con «Rimetti»). Test «la
  lapide». Scheda `workspace-tolti-dal-drive.md`.
- Punto 4: `src/shared/slug-di-servizio.ts` (`eSlugDiServizio`,
  `ePercorsoDiServizio`) usato in scanner (con potatura), raccolta, arrivo,
  ripristino, catalogo, fusione. Test.
- Punto 3: valutato, non fatto (vedi sezione 4).
- Inoltre: sostituto fallito = rimandato (`incrementale.ts`); nel conflitto si
  scarica prima di rinominare; scritture atomiche dei file ripristinati
  (`raccolta.ts`, `incrementale.ts`); `arrivo()` tutto dentro il `try`;
  `salva()` rilegge lo stato prima di scriverlo; salvataggio/arrivo con
  `esito: 'errore'` visibili nella striscia (`App.tsx`).

## `77aa0f2` fix(progetti, indice): aree 4 e 7

`ripristinaProgetto` rifiuta un progetto senza file sul Drive e passa dal
lavoro esclusivo; il secondo tempo di `ripristina()` salta i prefissi senza
file; `risolviCartellaDiChat`: sottocartella di un progetto mio → si ricrea lì;
progetto noto ma non collegato → `collegaProgetto`; omonimi → suffisso;
`haSegmentoNascosto` esclude `AppData`, `Temp`, `tmp`; `mkdirSync` prima del
registro; rimappatura in fila e temporanei rimossi; ronda: un guasto detto una
volta per progetto, staffetta ritirata, file oltre il tetto detti; indice:
«Rileggi» in fila, avanzamento con tetto di 150 ms, uuid doppio risolto con
la `cwd` sniffata dai primi 64 KB (`primaCwd`). Test in cartella-di-chat,
rimappa-di-massa, indexer, presenza (aggiornato: la staffetta si ritira).

## `b8666b5` fix(telefono, negozio, quaderno, registro, testi): aree 6-8-10-11

Vedi il messaggio del commit; in sintesi: pagina (Elimina/Riparte al
riavvio, Quaderno dal dettaglio, Riprendi solo a chi è fermo, `chiedi` che
solleva sui 4xx/5xx con banda in cima, 401 dopo cinque rifiuti, notifiche
«aspetta te»/«ha finito», coda ogni 10 s), rotte (`cartelle()` dal `cwd`
dell'indice, confronto per slug per quaderno/scheda/delega, delega con
cartella esistente), app Android (LED dal PC, «si prepara», niente Riprendi in
preparazione, delega che dice perché, `Installazione.finita` se la richiesta
non parte, conto del Drive coerente), negozio (`chiaveProgetto`, motivi del
CLI, elenchi non letti visibili), quaderno (nome unico + testo per esteso),
registro (`GIORNI_TENUTI` = 14), impostazioni (salvate solo se scritte,
predefiniti spiegati), workspace («Elimina» con conferma e copia
`workspaces.prima-dell-eliminazione.json`), accenti, `PannelloAccount` che
mostra i rifiuti, `script-pagina.js` fuori dal repo. Test: registro,
negozio, quaderno-store, client-pagina, client-rotte.

## L'ultimo commit: novità 0.27.0 complete, schede, questo rapporto

# 3. Cosa ho controllato e va bene (area per area)

1. **Avvio e chiusura** — `before-quit` rientrante (`inChiusura`/`inUscita`),
   ordine layout → Drive (45 s) → `chiudiRisorse` → `quit` coerente;
   `uncaughtException`/`unhandledRejection` nel registro; `second-instance`
   protetta; `PtyHostClient.stop()` azzera `child` prima di attendere; timer
   `unref`; catch dell'avvio con dialog. Trovato e corretto: silenzio del
   tetto/della chiusura, lavoro Drive ucciso, PTY host muto, file della pausa
   mai riscritto, DB bloccato cancellato.
2. **Aggiornamenti** — un solo installer (`autoInstallOnAppQuit = false`
   prima del `quit`, verificato in `BaseUpdater.addQuitHandler`);
   `installazioneAvviata` con guardie; `attendiQuiete` nell'ordine giusto e
   disfa la pausa allo scadere; `installa()` non rigetta mai; percorso NSIS
   silenzioso coerente; updater C# con tetto, riapertura su uscita ≠ 0, spia
   su thread a parte; `apk-disponibile` con timeout e senza memoria degli
   errori. Corretti: B1, B2, B4, B5, B7, B8, B13, B14 del revisore.
3. **Drive** — lavori esclusivi uno alla volta con `Presa` legata al proprio
   `AbortController`; manifesto locale sempre filtrato a ciò che sta su disco;
   le chat non si cancellano mai dal Drive per sparizione locale; ritenti su
   429/408/5xx solo per gli idempotenti; OAuth PKCE con `state`, `invalid_grant`
   → scarta con messaggio; file di stato tutti atomici; ronda con `inGiro`.
4. **Progetti** — `pc.json` e `progetti-drive.json` atomici e tolleranti;
   `radiciLocali` esclude i progetti in mano ad altri; passaggio di testimone
   con salvataggio prima di cedere; `elencaFileProgetto` asincrono con
   `.gitignore`; cambiare la cartella dei progetti a programma avviato tocca
   solo i progetti che arrivano da adesso (il caso spaccato, A4-3, è corretto).
5. **Chat e terminali** — cartella inesistente rifiutata prima di node-pty e
   detta nel riquadro; `--resume` vs `--session-id` deciso dall'esistenza del
   `.jsonl` (la rimappatura copia prima la trascrizione); riaggancio dopo
   Ctrl+R con rilascio nel registro **dopo** l'invio; due spawn per la stessa
   sessione impediti in finestra e fra workspace; chiusura di un riquadro →
   `ClosePseudoConsole` + `TerminateProcess`; battiti ogni 60 s; ambiente
   ripulito (`NON_EREDITATE`); nessuna promessa nuda nell'area.
6. **Workspace e layout** — tutte le scritture di `workspaces.json` nel main,
   atomiche; scontrino + rifiuto delle sparizioni non congedate + freno da
   1/s (il giro dei 7 GB chiuso su due lati); preset che congedano; chat cedute
   fra finestre con trasferimento della proprietà prima dell'invio; slot
   riservati alla nascita e compattati alla lettura; layout letto da disco
   riconciliato.
7. **Indice** — file troncato → riga saltata con avviso, resto valido; file
   illeggibile contato e saltato; lettura a flusso, transazioni da 50;
   potatura solo dopo `stat`; `db.ts` con recupero da corrotto; `dopoArrivo`
   con guardia e `.catch`; percorsi validati per `elimina`/`anteprima`.
8. **Telefono** — tutte le rotte chiamate dai due lati esistono e hanno gli
   stessi parametri; chiave sempre nell'header; doppio tocco sulle scelte
   identico sui tre lati; raggruppamento per workspace identico; Drive con
   le stesse fasi e gli stessi 409; coda condivisa con gli stessi testi;
   preferenze di rete non cambiabili dalla rete; l'app ha `ignoreUnknownKeys`
   e default per ogni campo; il 401 nell'app aspetta cinque rifiuti.
9. **Servizio autopiloti** — ripresa dopo riavvio (`/gestore-avviato`,
   `RIPRESA_RAVVICINATA_MS`), domande scadute (`riportaChiAspettava` al
   riavvio del servizio, risposta tardiva per chat), flotta (`conservaCambiUtente`
   con la sola chat del turno, decisioni per contenuto), criteri con bash
   sbagliata (`bashDaScartare`, shell nel registro), Telegram (timeout con
   `destroy`, mai solleva), rete di sicurezza del processo, `TETTO_CORPO`,
   istanza unica su `EADDRINUSE`. Il dialogo nuovo si innesta nei punti già
   sincroni (rilettura → merge → salva) e non apre nuove gare: la battuta
   `tu` si scrive prima di pensare, `conservaCambiUtente` porta `dialogo` e
   `daConsegnare` dal disco.
10. **Negozio, quaderno, impostazioni, registro** — `scrittura-atomica` per
    tutti gli store JSON in `%APPDATA%`; 25 `JSON.parse` su file di stato
    tutti dentro un `try`; `normalizzaPreferenze` valore per valore;
    `skillOverrides: 'off'` è nel set che il CLI accetta; CLI plugin senza
    shell, id validato, timeout; quaderno confinato e validato; registro con
    limiti testati.
11. **Giro con grep** — `void fn()` nel main e nell'host hanno catch o try
    interno; `.then` senza catch trovati e corretti nel pannello Account;
    `setInterval(async` solo nella pagina, con try; slug e percorsi
    normalizzati dove contano (`normalizzaPercorso`, `validation.ts` con
    `sep`); «sessione» resta solo negli identificatori; «cassaforte»/«Drive»
    coerenti; apostrofi corretti nei testi elencati dal revisore.

# 4. Difetti trovati e NON corretti (per gravità)

1. **L'updater C# uccide SierraDeck dopo 5 s, la chiusura può durare 47 s**
   — `src/main/updater/sorgente.ts:95` (`GIRI_GENTILI = 25` × 200 ms) e
   625-634 (`CloseMainWindow` poi `Kill()`) contro `index.ts` `before-quit`
   (layout 1,5 s + Drive 45 s). L'ultimo salvataggio sul Drive prima
   dell'aggiornamento muore senza una riga nel registro. Correzione: fare il
   salvataggio Drive con tetto **prima** di `avviaUpdater` (nuovo parametro
   `salvaPrimaDiUscire` in `creaAggiornamenti`, e in `before-quit` saltarlo se
   l'installazione è in corso) e alzare `GIRI_GENTILI` a 300 con
   `VERSIONE_UPDATER` 14 (vale dal secondo aggiornamento). Rischio medio:
   tocca la sequenza di chiusura e il C#, che non posso provare qui.
2. **La stessa chat sotto due slug sul Drive (punto 3 del rapporto 1) chiude
   un ramo** — `sincronia.ts` `altroveQui` esclude da arrivo, ripristino e
   piano ogni voce con lo stesso uuid sotto un altro slug **senza guardare la
   lunghezza**: una chat rimappata sul fisso che il portatile continua non
   arriva più sul fisso. Correzione proposta in due passi: (a)
   `VoceManifesto.righe` (conteggio `\n` calcolato in `carica`) e `altroveQui`
   = «già qui **e non più corta**»; poi `dopoArrivo`/rimappatura porta la
   copia più lunga sotto lo slug di qui; (b) in `salvaIncrementale` non
   caricare un percorso il cui uuid è già sul Drive sotto un altro slug con
   `righe >=`, e una pulizia esplicita dei gemelli più corti. Rischio medio:
   cambia il manifesto e la regola di rimessa che ha salvato le 385 chat.
3. **Nessuna lapide per «Togli la cartella dal Drive»** — `index.ts`
   `progetti:rimuovi` toglie la riga solo dal registro locale;
   `fondiRegistri` è un'unione: B rimette la riga, A la riceve con il proprio
   percorso e `radiciLocali` ricarica tutta la cartella. Correzione:
   `RegistroProgetti.rimossi?: { id, quando }[]` con parse tollerante,
   scritto da `progetti:rimuovi`, rispettato da `fondiRegistri`/`parseRegistro`
   quando la lapide è più recente di `aggiuntoIl`. Rischio medio (formato del
   registro condiviso).
4. **Le sessioni observer già sul Drive restano lassù** (≈621×2 voci sotto
   `chat/`). Ora non salgono più, non arrivano e non si vedono; ma il
   manifesto le tiene. Correzione: una variante di `togliPrefisso` per
   predicato (`ePercorsoDiServizio`) chiamata una volta dal pannello Account,
   con la regola di rimessa (`incrementale.ts:247-251`) che le salti. Rischio
   basso, ma cancella dal Drive: da fare con Nicholas davanti.
5. **Negozio, MCP: «Disattiva» scrive `disabledMcpjsonServers`**, che nel
   binario di Claude Code è «i server di `.mcp.json` rifiutati»: un server in
   `projects[cwd].mcpServers` **non si spegne** con quella lista, e i server di
   `<cwd>/.mcp.json` non compaiono nella scheda. Sul PC nessun progetto ha
   `mcpServers` in `~/.claude.json`. Correzione: leggere due sorgenti
   (`projects[cwd].mcpServers` e `.mcp.json`), applicare la lista solo alla
   seconda, e per la prima togliere il tasto o passare da `claude mcp
   remove/add` con conferma. Rischio medio: cambia cosa mostra la scheda e
   `tests/main/negozio.test.ts` fissa il comportamento di oggi.
6. **`spegni` dell'host esce subito dopo `killAll()`** (`host.ts:56-65`): con
   ConPTY la parte asincrona di node-pty (enumerazione dei processi attaccati
   alla console) viene interrotta e i **nipoti** (un server di sviluppo
   lanciato da un tool Bash) possono sopravvivere alla chiusura. Correzione:
   `setTimeout(() => deps.exit(0), 400)` in `spegni` (il Core aspetta 800 ms) e
   timer finti nei test. Da provare sul campo con Task Manager. Rischio
   basso-medio.
7. **Dopo la morte del PTY host i riquadri restano morti** senza dire cosa
   fare (`aggancio.ts:292` scrive `[errore: PTY host terminato …]` e tiene
   l'id). Correzione minima: aggiungere «premi Ctrl+R per riaprire le chat»;
   meglio un rilancio ritardato come `assente`. Legato: chat morta senza
   «Rilancia» (A5-7), spawn fallito che lascia voci morte (A5-8), arretrati
   del `pty-bus` per id morti (A5-9). Rischio basso-medio.
8. **`layout:salvato` non distingue «salvato» da «rifiutato»** alla chiusura
   (`ipc.ts:693-711`, `preload/index.ts:747-751`): l'uscita prosegue e uccide i
   pty anche se il salvataggio finale è stato rifiutato (scontrino scaduto) o
   non scritto; solo il registro lo dice. Correzione: far rispondere
   `layout:salva` con l'esito e loggare/avvisare in `before-quit`. Rischio
   medio (canale a senso unico).
9. **Lavoro sincrono sul main durante `installo`** fino a ~100 s: `csc` al
   momento dell'installazione se `VERSIONE_UPDATER` è cambiata
   (`compila.ts:83-94`), `claude --version` e `npm view` sincroni (15 s
   ciascuno), `tasklist` (10 s). Correzione: compilare l'updater 30 s dopo
   l'avvio; `notaClaude` e `unoGiaInCorso` asincroni. Rischio medio.
10. **`AVVISO_PAUSA` viene digitato anche in terminali che non sono Claude**
    (`pausa-aggiornamento.ts:226-230`): una shell nuda conta come «al lavoro»
    e riceve nove righe come comandi. Correzione: un campo `claude?: boolean`
    in `ChatInVolo` dal renderer, e avvisare solo quelle. Rischio medio.
11. **`unaChatUnWorkspace` non vale in `cambiaWorkspace`** né nella memoria
    del renderer (`workspace-operazioni.ts:340-356`): un duplicato può essere
    scritto fino al `layout:salva` successivo, che sana. Rischio basso.
12. **Ripristino completo e voci «tenute» dei progetti**
    (`sincronia.ts:1149`): il manifesto locale prende la firma del Drive anche
    per i file tenuti, e al salvataggio dopo il file locale sale senza
    conflitto e senza copia. Correzione: `ripristinaIncrementale` restituisce
    `tenutiPercorsi` e i chiamanti non copiano la voce del Drive per quelli.
    Rischio medio.
13. **La ronda fa 3 ricerche Drive per progetto ogni 30 s** (presenza,
    staffetta, coda: `trovaPerNome` memorizza solo i nomi trovati). Con N
    progetti sono N×3×2880 chiamate al giorno; il 10/09 c'è un 403 «rate
    limit» nel registro. Correzione: `Scatola.elenca()` una volta per giro.
    Rischio basso.
14. **`pc.json` illeggibile = identità nuova silenziosa** (`pc.ts:44-68`): i
    `percorsi[vecchioId]` restano orfani e i progetti si ricollegano in
    cartelle nuove. Correzione: rinominare in `.rotto`, loggare, non generare
    l'id. Rischio basso. Nota: due PC con lo stesso **nome** sono innocui
    (l'identità è l'`id`); copiare la cartella dati fra due PC duplica l'`id`.
15. **Telefono, parità mancante**: la pagina non risale la conversazione
    (`/api/storia` c'è, la pagina usa `/api/dentro`); non ha Negozio né
    Account; `/api/workspace/elimina` senza tasto su entrambi i lati; l'app
    inghiotte ancora diversi errori (coda, workspace, preferenze:
    `catch (_: Exception) {}`); nella pagina restano rami morti della vecchia
    WebView (`window.SierraDeckApp`, lo UA `SierraDeck/x.y.z`). Rischio basso.
16. **Testi non ancora per esteso**: `PannelloNegozio` (il «↧ 1.2k», i numeri
    sulle linguette che contano cose diverse); «cartella che hai davanti» è
    il primo riquadro, non quello a fuoco (`App.tsx:201-204`); il tasto
    «Spegni» dei workspace non dice che al ritorno si riparte con `--resume`.
17. **Registro**: il tetto di 50 righe/s scarta anche gli `ERRORE`; giorno e
    nome file in UTC (fra le 00:00 e le 02:00 locali si scrive nel file di
    ieri); se la cartella non si crea «Apri i log» non dice niente. Rischio
    basso.
18. **Il riquadro non sa che la sua cartella è cambiata finché non riapre**
    (dal rapporto 1, punto 5): cosmetico, invariato.

# 5. Cosa deve fare Nicholas

1. **Pubblicare la 0.27.0** (con Claude): bump `package.json` a 0.27.0,
   **ricompilare l'APK → 2.30.0** perché `android/` è cambiato (Lavori,
   Modelli, Api, Computer, Drive), `app-android-json`, note dalla voce 0.27.0
   di `novita.ts`. Attenzione al punto 1 della sezione 4: fino a quando
   l'updater C# non ha 60 s di pazienza, chiudere SierraDeck a mano prima di
   «Installa e riavvia» se c'è un salvataggio Drive lungo in corso.
2. Su tutti e due i PC aggiornare e riavviare; verificare in Impostazioni la
   versione. Al primo avvio con la 0.27.0 l'elenco Chat perde le sessioni
   «observer» di claude-mem (621 sul fisso): è voluto.
3. **Provare il dialogo**: scheda di un autopilota → «Parla con lui» →
   «dove sei?» → entro qualche minuto la risposta; poi «fermati», «riprendi».
   Dal telefono (pagina e app 2.30.0) lo stesso. Il diario mostra «Gli hai
   scritto»/«Ti ha risposto».
4. **Provare la chat nuova**: avviare un autopilota da un workspace in cui c'è
   già una chat aperta sulla stessa cartella: deve nascere un riquadro nuovo,
   la chat esistente non deve «rinascere».
5. Scheda Drive → «Per workspace»: «Togli dal Drive» sui workspace che non
   devono più viaggiare (ricompaiono in «Tolti dal Drive» con «Rimetti»).
6. Decidere sui punti 2, 3, 4 e 5 della sezione 4 (gemelli sul Drive, lapide
   per «Togli la cartella», pulizia delle observer sul Drive, MCP nel negozio):
   sono scelte di prodotto.
7. Sul telefono: accettare la 2.30.0 quando compare la banda.

# 6. Cose lasciate aperte

- La pubblicazione e la compilazione dell'APK (vietate dal mandato).
- I 18 punti della sezione 4; i primi cinque meritano una decisione.
- Una prova dal vivo del dialogo con un supervisore vero: qui è provato con
  un supervisore finto (JSON) e con il typecheck; il prompt nuovo
  (`componiPromptDialogo`) è scritto sul modello di quello della risposta
  autonoma, che sul campo funziona, ma la qualità delle risposte si vede solo
  con `claude.exe`.
- L'app Android non è stata compilata: le modifiche Kotlin sono piccole e
  seguono i costrutti già presenti nei file, ma la prova vera è `gradle`.
- Sei verifiche che i revisori hanno dichiarato «non provate»: se NSIS
  riavvia da solo l'app dopo un'installazione silenziosa; se electron-updater
  riprende un download parziale; se i terminali di preparazione entrano in
  `chatAperte` (per l'avviso di pausa); l'ordine TMP/TEMP di
  `Path.GetTempPath()` (dalla documentazione); la sopravvivenza dei nipoti alla
  chiusura dell'host; se una `cwd` con maiuscole diverse dalla cartella reale
  faccia mancare `trascrizioneEsiste` allo spawn.
