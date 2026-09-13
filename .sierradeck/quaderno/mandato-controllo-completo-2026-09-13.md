---
titolo: "Mandato per l'autopilota: controllo completo del programma e correzione dei difetti (2026-09-13)"
quando: 2026-09-13T22:30:00+02:00
tag: ["autopilota", "mandato", "drive", "chat", "controllo"]
---

# Chi sei e cosa devi fare

Sei l'autopilota di SierraDeck che lavora sul codice di SierraDeck stesso
(cartella `E:\Users\nikof\Documents\SierraDeck`, branch `main`). Nicholas ha
chiesto: «fai un check completo di tutto il programma alla ricerca di
situazioni che non possono funzionare e bug, risolvi tutti i problemi e
genera un report completo di tutto quello che hai fatto». Questo file è il
tuo mandato: leggilo tutto prima di cominciare, poi leggi le schede del
quaderno citate. Il rapporto finale va scritto in
`.sierradeck/quaderno/rapporto-autopilota-2026-09-13.md` (vedi in fondo).

# Il programma in due righe

SierraDeck è un'app Electron (`src/main` = processo principale, `src/renderer`
= interfaccia React, `src/preload`, `src/pty-host` = terminali di Claude Code,
`src/autopilot-host` = il servizio degli autopiloti, `src/shared` = tipi e
testi comuni) più una pagina servita al telefono (`src/main/client-pagina.ts`,
rotte in `src/main/client-rotte.ts`) e un'app Android nativa (`android/`,
Kotlin/Compose). Nicholas la usa su DUE PC («fisso» e «portatile») e sul
telefono. Le chat sono trascrizioni di Claude Code in `~/.claude/projects/<slug>/<uuid>.jsonl`
dove lo slug deriva dal percorso della cartella di lavoro (cwd). I PC si
scambiano chat, workspace e cartelle di progetto attraverso Google Drive,
cifrate (BYOS): `src/main/cassaforte/*` (sincronia, incrementale, fusione,
catalogo, lavoro-in-corso, google-drive). Le schede del quaderno spiegano
ogni pezzo: leggi almeno `progetti-sul-drive.md`, `fondi-con-il-drive.md`,
`manifesto-locale-cancellava-le-chat.md`, `scheda-drive-catalogo.md`,
`lavoro-drive-visibile-annullabile.md`, `chat-di-un-altro-pc-cartella-mancante.md`,
`aggiornare-senza-perdere-lavoro.md`, `ripresa-dal-telefono-nel-suo-workspace.md`,
`aggiornamento-app-android-tre-fonti.md`, `autopilota-ripresa-dopo-riavvio.md`.

# I due difetti aperti (priorità massima)

## 1. Sul portatile una chat scaricata dal Drive «dà errore: directory non trovata»

Le chat arrivate dal Drive portano dentro la cwd del PC in cui sono nate
(es. `E:\Users\nikof\Documents\X`); sul portatile quella cartella non c'è e
Claude Code non parte. Nella 0.25.2 è stato aggiunto il gancio
`impostaRisolviCartella` in `src/main/ipc.ts` (`pty:spawn`) che usa
`src/main/progetti/cartella-di-chat.ts` per rimappare nel progetto noto o
adottare un progetto nuovo in `Documenti\Progetti SierraDeck\<nome>` (copia la
trascrizione sotto lo slug locale, ricorda l'origine nel registro
`progetti-drive.json`). Nicholas dice che l'errore c'è ancora e che «la fix
deve applicarsi anche alle chat già scaricate». Nota: entrambi i PC girano
ancora sulla 0.25.1 (gli aggiornamenti si installano alla chiusura), quindi
quel gancio non era in esecuzione quando ha provato. Ma non basta:

- Verifica end-to-end che lo spawn con cwd mancante passi dal gancio anche
  dal pannello Chat e dal telefono (`chat:riprendi` → `client:apri` →
  `Terminal.tsx` → `pty:spawn`), e che, se qualcosa va storto, nel riquadro
  compaia una spiegazione (trova il testo esatto che vede oggi l'utente:
  probabilmente l'errore dello spawn del PTY host in `src/pty-host`).
- **Rimappatura di massa**: all'avvio e dopo ogni lavoro Drive che scarica
  (fusione, ripristino, «Porta qui», «Porta qui il workspace») tutte le chat
  sul disco la cui cwd non esiste qui vanno rimappate/adottate con
  `risolviCartellaDiChat`, con la cartella creata, la trascrizione copiata
  sotto lo slug locale e l'elenco chat che mostra la cartella LOCALE. La stessa
  conversazione presente sotto due slug (uno per PC) deve comparire una volta
  sola nell'elenco (vedi `altroveQui` in `catalogo.ts` per l'idea).
- Attenzione: il salvataggio carica sul Drive tutto ciò che sta in
  `projects/*.jsonl`. Decidi e documenta se la copia sotto lo slug locale
  vada esclusa dal caricamento o se è accettabile (rischio: la stessa chat
  due volte sul Drive, che il catalogo già tollera). Non cancellare mai
  niente dal Drive.

## 2. Sul fisso «non sono apparse le chat sincronizzate dal portatile»

Dal registro del fisso (`%APPDATA%\sierradeck\log\sierradeck-2026-09-13.log`):
alle 20:10Z una FUSIONE ha scaricato 532 chat («solo Drive»), poi riavvio
alle 20:24Z, ma nell'elenco chat non compaiono. Capisci perché: come si
ricostruisce l'indice (`src/main/indexer/*`, `index.db`: all'avvio? con un
watch? dopo un lavoro Drive?), se l'elenco nel renderer
(`raggruppa-sessioni.ts`, `state/sessions.ts`, il pannello Chat) filtra le
chat con cartella inesistente o le raggruppa sotto il percorso dell'altro PC.
Correggi in modo che dopo ogni lavoro che scarica e all'avvio l'indice si
aggiorni e le chat arrivate compaiano SENZA riavvio, con un avviso visibile
(«N chat arrivate dal Drive»).

## 3. Arrivo automatico (funzione nuova, la vuole Nicholas)

Oggi il salvataggio automatico (ogni 5 minuti) solo carica. Nicholas si
aspetta che «sincronizzare» porti anche giù: fai in modo che la
sincronizzazione automatica scarichi le chat che stanno SOLO sul Drive o
sono più avanti sul Drive (confronto per contenuto: sha nel manifesto,
dimensione per le chat), mai i file dei progetti (quelli restano a «Porta
qui»/Fondi) e mai sovrascrivendo contenuto locale più lungo. Deve passare dal
`lavoro` (`lavoro-in-corso.ts`: uno alla volta, annullabile, visibile nella
striscia), rispettare il manifesto locale = solo file su disco (scheda
`manifesto-locale-cancellava-le-chat.md`: NIENTE cancellazioni), e poi fare la
rimappatura di massa e l'aggiornamento dell'indice. Aggiungi la voce in
`src/shared/novita.ts` come nuova versione `0.26.0` in cima all'elenco, ma
NON cambiare `package.json` né compilare l'APK: la pubblicazione la fa
Nicholas con Claude dopo.

## 4. `workspaces.json` e `impostazioni.json` in conflitto a ogni salvataggio

Nel registro del fisso: «SALVA conflitto su sierradeck/workspaces.json: vince
questo PC» e lo stesso su `impostazioni.json`, a ogni salvataggio. I due PC
si sovrascrivono a vicenda i file del prefisso `sierradeck`? Verifica come
viaggiano, se è last-writer-wins e se questo può far sparire i workspace di
un PC sull'altro (esiste già una fusione per-PC degli archivi dei workspace:
capisci perché il file va comunque in conflitto). Se è rotto, sistemalo;
se è innocuo, spiega perché nel rapporto e togli il rumore dal registro.

# Il controllo completo

Dopo i quattro punti sopra, passa tutto il programma cercando situazioni che
non possono funzionare e bug, e correggi quelli che puoi correggere senza
rischio; gli altri li descrivi nel rapporto con file:riga, scenario, causa,
correzione proposta. Aree, tutte:

- `src/main/index.ts` (avvio, `before-quit`, riavvio automatico, IPC),
  `src/main/ipc.ts` (spawn, layout, workspace).
- `src/main/cassaforte/*`: gare fra il salvataggio automatico (timer 5 min),
  la ronda dei progetti (30 s), la ricerca aggiornamenti e i lavori
  esclusivi; cancellazioni (solo prefissi `progetto-*`, mai `chat`);
  scritture atomiche; `google-drive.ts` (cache nomi→id, 404); OAuth e token.
- `src/main/progetti/*` (registro, pc, presenza, sincronia-progetti,
  cartella-di-chat).
- Aggiornamenti: `aggiornamenti.ts`, `pausa-aggiornamento.ts`,
  `finestra-aggiornamento.ts`, `updater/`; `apk-disponibile.ts`.
- Telefono: `client-rotte.ts` + `client-pagina.ts` e parità con
  `android/app/src/main/java/it/ferrariconsulenze/sierradeck/*.kt` (Drive.kt,
  App.kt, Chat.kt, Aggiornamenti.kt, Api.kt, Modelli.kt). REGOLA: ogni
  correzione al telefono va fatta su ENTRAMBI i lati.
- `src/main/indexer/*`, `src/pty-host/*`, `src/autopilot-host/*`.
- `src/renderer`: App.tsx, Console.tsx, PannelloDrive, ModaleFusione,
  PannelloAccount, ModaleNuovaChat, Terminal.tsx, state/*,
  persistenza-layout, workspace-azioni. Cerca stringhe dell'interfaccia che
  promettono cose che il codice non fa.
- Promise senza catch, percorsi Windows vs slug, versioni dei file di stato
  e migrazioni.

# Regole di lavoro (di Nicholas, non negoziabili)

- Leggi prima di cambiare; non fidarti dei commenti; verifica il percorso
  completo di ogni sospetto prima di scriverlo nel rapporto.
- Ogni funzione pura nuova ha il suo test in `tests/`. Prima di ogni commit:
  `npm run -s typecheck` (deve uscire 0) e `npx vitest run > vt.txt 2>&1`
  poi controlla che NON ci sia una riga `Tests … failed` (mai vitest in pipe
  con grep/head: nasconde il codice di uscita). Oggi la suite è 2228 test
  verdi; un test dell'autopilot-host (`server.test.ts › eliminare chiude
  anche le sue domande in sospeso`) può andare in timeout sotto carico e
  passa da solo.
- Testi dell'interfaccia completi: per ogni pannello o avviso spiega cosa
  guarda, cosa vuol dire ogni numero, cosa fa il predefinito, cosa NON
  succede, cosa fare se non torna.
- Non cambiare `package.json`, non compilare l'APK, non pubblicare, non fare
  push, non riavviare SierraDeck (`sistema:riavvia`) e non toccare
  `%APPDATA%\sierradeck` (i dati veri di Nicholas). Committa in locale, un
  commit per tema, messaggi in italiano nello stile del repo
  (`fix(area): …`, `feat(area): …`), ognuno che finisce con le due righe:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` e
  `Claude-Session: https://claude.ai/code/session_01P8j5iNp8ypXAkqLvrqvjQx`.
- Per patch multi-riga usa script Python scritti con il tool Write (gli
  heredoc bash de-escapano i backslash).
- Registra nel quaderno (`.sierradeck/quaderno/`, una scheda per argomento,
  intestazione YAML con `titolo`, `quando`, `tag`) ogni decisione, vincolo
  scoperto, causa di un errore risolto. Aggiorna le schede esistenti invece
  di duplicarle.

# Il rapporto finale

`.sierradeck/quaderno/rapporto-autopilota-2026-09-13.md`, in italiano, per
Nicholas, con queste sezioni:

1. **Cosa ho trovato** sui quattro difetti aperti: causa vera di ciascuno,
   con le prove (file:riga, righe di registro).
2. **Cosa ho cambiato**, commit per commit, file per file, e cosa vede ora
   l'utente di diverso (sul PC e sul telefono).
3. **Cosa ho controllato e va bene** (breve).
4. **Difetti trovati e NON corretti**, ordinati per gravità (perdita di dati
   > funzione che non può funzionare > errore visibile > incoerenza), con
   file:riga, scenario, causa, correzione proposta, rischio.
5. **Cosa deve fare Nicholas** sui due PC e sul telefono (aggiornare,
   chiudere/riaprire, cosa aspettarsi al primo avvio).
6. **Cose lasciate aperte** e perché.

Il mandato è finito quando: typecheck a 0, suite verde, i quattro difetti
aperti corretti o spiegati, il controllo completo fatto, il rapporto scritto
e tutto committato.
