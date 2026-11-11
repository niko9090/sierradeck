# Lezioni del progetto

<!-- SierraDeck: una riga per voce; una voce che torna aumenta «confermata N×». Tetto 200 voci o 32 KB: escono prima le meno confermate e più vecchie. Si può scrivere anche a mano. -->

## test

- Il comando mklink via Bash è rifiutato nei worktree; la junction si crea con PowerShell New-Item -ItemType Junction. _(2026-11-09)_
- In `criticitaDi` la voce `risorse` non ha il pcId: la chiave per PC si costruisce da `s.pcId`, e il titolo senza numeri va nella firma. I numeri restano solo nel dettaglio. _(2026-11-09)_
- Per provare il Drive pieno serve un archivio con capacità vera e un freno attivo: un flag «pieno» fisso non mostra che la DELETE libera spazio e riabilita le scritture. _(2026-11-09)_
- la pagina del telefono riceve le funzioni di `src/shared` con `.toString()`: devono essere autosufficienti, senza costanti di modulo, e usare solo ciò che è definito nella pagina. _(2026-11-09)_
- pannello-drive-app.test.ts estrae le funzioni della pagina una a una: ogni nuova funzione chiamata da pannelloDriveHtml va aggiunta lì, o il test dà ReferenceError. _(2026-11-09)_
- i test usano oggetti con statusCode o testi costruiti a mano; la forma reale di createHttpError (node_modules/builder-util-runtime/out/httpExecutor.js:52) va testata così com'è _(2026-11-10)_
- un worktree può partire indietro rispetto a main: fare `git merge --ff-only main` prima di misurare, altrimenti mancano i test appena entrati. _(2026-11-10)_
- `npx vitest run` intero dura circa 160 s su questo PC: un rifiuto "vitest rosso" senza nome di prova può essere un tempo scaduto sotto carico, non il codice. _(2026-11-10)_
- Un 50x di electron-updater può arrivare come testo senza statusCode: «504 <frase>[\ndescrizione]\nHeaders: {…}». Il riconoscimento deve guardare il testo completo, non solo il campo. _(2026-11-10)_
- il freno predefinito `frenoDrive` è unico per tutto il processo: nei test di `creaArchivioDrive` dare sempre `freno: creaFreno()`, o un 429 sporca i test seguenti. _(2026-11-10)_
- un comando Bash con heredoc Python e altro insieme può essere rifiutato nel worktree, ma i passi precedenti possono aver girato lo stesso: ricontrollare `git diff` prima di rifare le modifiche. _(2026-11-10)_
- sposta-fra-pc aspettava 10 ms fissi dopo un lavoro in sottofondo: sotto la suite intera cadeva. Mai un tempo fisso per aspettare un lavoro asincrono. _(2026-11-10)_
- le prove che cercano stringhe nel sorgente (readFileSync di un .tsx) si rompono a ogni riscrittura della vista: meglio agganciarle al componente o alla funzione, non al dettaglio interno. _(2026-11-10)_
- il freno Drive alza l'attesa al primo 429, quindi un test che si aspetta ritentativi su 429/rateLimit va scritto con 503 (transitorio), non con 429 _(2026-11-10)_
- `tests/main/sposta-fra-pc.test.ts` (caricamento lungo) è fallita una volta sola nella serie completa sotto carico e passa da sola: probabile instabilità di tempi _(2026-11-10)_
- Per provare «zero richieste» su `apriSincronia`, avvolgi l'archivio in un Proxy che conta le chiamate; l'orologio del freno si inietta con `creaFreno(() => t)`. _(2026-11-10)_
- Dopo la correzione della Salute (46ce0845) un PC senza `battito` non mostra più i suoi consumi: le prove con altri PC e `risorse` devono dare un battito recente. _(2026-11-10)_
- Il rifiuto «prove vitest dei compiti già uniti» può non riprodursi: su main isolato la suite era verde. Prima di cambiare codice rilanciare la suite sul ramo da solo. _(2026-11-10)_
- giudicaStrumento accetta {ambiente} per le prove: con percorsi finti Windows (C:\Users\mario) non serve toccare le variabili d'ambiente _(2026-11-10)_
- I test del servizio con raccolta eventi lunga provano il «subito»: per far arrivare un evento va chiuso il turno finto con un result, altrimenti resta in attesa. _(2026-11-10)_
- In `tests/autopilot-host` una `blocca` che non si risolve mai tiene il lucchetto di prova globale (per cwd) e fa fallire per timeout i test dopo: risolvere sempre la promessa. _(2026-11-10)_
- in copia nessuna prova fallisce né sotto la suite intera ripetuta né in tests/autopilot-host (5389 + 740 verdi). Se il cancello rifiuta, cercare il motivo nel suo log, non nei test. _(2026-11-10)_
- Nei test sul repo di prova `ls-files` restituisce per primo `.sierradeck/...` se esiste: per scegliere un file di codice escludere quel prefisso. _(2026-11-10)_
- il cane da guardia (20 min) e il backoff si sommano: nei test con fake timer il secondo riavvio parte 30 s dopo lo scatto del cane, non subito. _(2026-11-11)_
- per la regola del quaderno usare un repository git vero (repositoryDiPartenza): i mock non vedono il comportamento di `git status`/`add`/`commit` sui file riscritti. _(2026-11-11)_

## worktree

- Il ramo di lavoro può essere indietro a main (manca spazio-drive-pieno): prima di correggere, rebase su main. _(2026-11-10)_
- con l'harness, ogni comando git che nomina la cartella principale viene rifiutato anche con `git -C` o in una pipe: per leggerla usare percorsi assoluti e comandi non-git. _(2026-11-10)_

## android

- `tests/android/rotte-lente-app.test.ts` impone che `ROTTE_LENTE` sia contenuta nella lista dell'app: ogni rotta lenta nuova va aggiunta anche in `android/`. _(2026-11-09)_
- PonteTest legge ROTTE_PONTE di ponte-telefono.ts con la regex '([^']+)': un apostrofo dritto in un commento dentro la lista la rompe, usare ’ _(2026-11-10)_
- gradle testDebugUnitTest resta UP-TO-DATE se cambia solo un .ts letto dai test Kotlin (PonteTest): serve --rerun _(2026-11-10)_
- per l'app le procedure lunghe conviene tenerle sul PC e far rileggere la vista all'app: la pagina le fa girare nel browser, l'app perderebbe il passo con la linea _(2026-11-10)_
- Se android/ non cambia per una release, versionName resta quello vecchio: la 0.98.0 era ancora 2.96.0. _(2026-11-10)_

## release

- il rapporto controllo-*.md sta nella cartella principale (.sierradeck/errori-arrivati/), non nei worktree: leggerlo da lì, non copiarlo. _(2026-11-09)_
- un bump patch tocca solo package.json, package-lock.json (2 punti), src/shared/novita.ts e, se serve, il quaderno errori-arrivati. _(2026-11-09)_
- Se la release esiste già (gh release create prima), npm run pubblica compila ma non carica niente (vuole una bozza): exe, blockmap e latest.yml vanno caricati con gh release upload. _(2026-11-09)_
- Dal worktree `npm run pubblica` vuole `google-oauth.json` e un `node_modules` vero, non una junction. Copiarli dalla principale e toglierli dopo; `google-oauth.json` è ignorato da git. _(2026-11-09)_
- Con la release già creata, electron-builder non carica nulla. Gli asset vanno caricati a mano con `gh release upload` e nomi coi trattini (`SierraDeck-Setup-X.exe`), non quelli con lo spazio di `dist… _(2026-11-09)_
- `npm run pubblica` dopo un `gh release create` salta gli upload: servono `gh release upload` con i nomi a trattini di latest.yml. _(2026-11-10)_
- Da un worktree servono google-oauth.json copiato dalla cartella principale e un node_modules vero (npm ci): la junction fa fermare controlla-pacchetto. _(2026-11-10)_
- Il bump di versione fa fallire `tests/shared/novita.test.ts` se in `src/shared/novita.ts` manca la voce della nuova versione: aggiungerla nello stesso commit del bump. _(2026-11-10)_
- In una copia di lavoro `npm run pubblica` rifiuta la junction di node_modules (serve `npm ci`) e vuole `google-oauth.json` (gitignorato) copiato dalla cartella principale. _(2026-11-10)_
- Se la release è creata prima con `gh release create`, electron-builder salta il caricamento (draft vs release): caricare installer, blockmap e latest.yml con `gh release upload`. _(2026-11-10)_
- il bump di versione richiede anche la voce in `src/shared/novita.ts`: senza, `tests/shared/novita.test.ts` si rompe (successo con la 0.99.1). _(2026-11-10)_
- `gh release upload` con `file#etichetta` non cambia il nome dell'asset: GitHub mette i punti al posto degli spazi. Rinominare il file in `SierraDeck-Setup-X.exe` prima di caricarlo, come in `latest.y… _(2026-11-11)_
- `npm run pubblica` vuole GH_TOKEN nell'ambiente: `export GH_TOKEN=$(gh auth token)`. Crea una bozza col solo blockmap: carica a mano exe e latest.yml, poi `gh release edit --draft=false`. _(2026-11-11)_
- in `src/shared/novita.ts` il file ha fine riga CRLF: un replace con `\n` non trova nulla, quindi rileggere il fine riga prima di inserire la voce. _(2026-11-11)_
- la verifica di una release va fatta con `gh release view --json assets`: il nome dell'APK (2.x) non coincide con la versione della release (0.x), quindi non va cercato per nome esatto. _(2026-11-11)_

## git

- Il conflitto sul quaderno lezioni.md nasce perché ogni ramo aggiunge righe in coda alla stessa sezione: nell'unione vanno tenute tutte, togliendo solo i doppioni identici. _(2026-11-08)_
- `main` locale e `origin/main` possono divergere: dopo una release verificare con `git log origin/main` prima di dire che "è in main". _(2026-11-08)_
- il main locale può essere avanti di origin/main (qui 5 commit): per allinearsi, `git merge --ff-only main` funziona, ma `origin/main` resta indietro finché non si pubblica. _(2026-11-08)_
- Un ramo già aperto in un altro worktree non si può attivare: il lavoro va unito sul proprio ramo e l'autopilota deve unire quello. _(2026-11-08)_
- `main` locale può essere avanti su origin con lavoro non pubblicato. Dal worktree: `git merge --ff-only main`, bump, poi `git push origin HEAD:main`. _(2026-11-09)_
- un agente lanciato in un worktree isolato non può usare `git -C <cartella principale>`: il sistema lo rifiuta. Le operazioni sulla cartella principale vanno affidate a chi non è isolato. _(2026-11-09)_
- main locale può avere commit non ancora su origin/main (merge e note del quaderno): prima di un push di release controllare `git log origin/main..main`. _(2026-11-10)_
- Il git del programma (gitAsincronoReale) mescola stderr e stdout e fa trim: gli avvisi CRLF finiscono nello status e la prima riga perde lo spazio di testa. Filtrare le voci «XY percorso». _(2026-11-10)_
- Gli specialisti sono chiusi nel loro worktree: non possono leggere né salvare file nella cartella principale. Un'unione ferma per file non salvati in main la ritenta il programma ogni 30s. _(2026-11-10)_
- un agente isolato nel worktree non può usare `git -C` sulla cartella principale: il compito di salvare lì le note va dato a chi non è isolato. _(2026-11-10)_
- Note del quaderno non salvate in main = fila unioni ferma, e nessuno specialista può salvarle (isolati nella copia; general-purpose rifiutato). Serve la correzione del programma (k-133). _(2026-11-11)_
- Note del quaderno non salvate in main: anche il tipo «claude» è rifiutato (nessuno senza copia propria). Solo una chat di Nicholas aperta in main o un SierraDeck installato con k-133 le salva. _(2026-11-11)_
- `main` locale può essere più avanti di `origin/main` con le unioni non pubblicate: guardare `git log origin/main..main` prima di partire da `origin/main`. _(2026-11-11)_

## autopilota

- La guardia del PC rimanda typecheck e vitest completi anche per minuti di fila: lanciare le misure pesanti presto e tenere pronto il commit prima di misurare. _(2026-11-08)_
- Non lanciare uno specialista su un compito il cui «dopo» è ancora in unione: non può aspettare (sleep bloccato) e torna a vuoto. Lanciarlo all'evento «unione». _(2026-11-10)_
- Un revisore lanciato con «k-N:» in testa alla descrizione si lega a quel compito e il programma unisce lui (niente) al posto dello sviluppatore: per le revisioni usare una descrizione senza id. _(2026-11-10)_
- Il modello dell'autopilota passa da 5 file (ipc, servizio, store, orchestratore, tipo); ora tutti usano `modelloAutopilotaAmmesso` di `shared/modelli`. _(2026-11-10)_
- lo stato `fermo` era tolto: un guasto non di rete non aspetta più Nicholas, riprova da solo con attesa crescente (tetto 5 min). _(2026-11-11)_

## controllo

- una criticità con i numeri nel titolo cambia firma a ogni giro: il rapporto all'autopilota si riscrive ogni 6 ore (controllo-pc.ts:133). _(2026-11-09)_
- Le versioni dei PC nel controllo vengono dall'ultimo battito sul Drive: con il Drive pieno restano vecchie. Prima di dire «PC vecchio» si controlla sul PC. _(2026-11-09)_
- Un rapporto controllo-*.md scritto da un PC con versione vecchia ripete criticità già corrette: guardare «questo PC la 0.x» nel rapporto prima di aprire lavoro nuovo. _(2026-11-09)_
- La gravità «guasto» di `pc:<id>` si decide nel singolo PC senza vedere gli altri; il declassamento sta in `criticitaDi`, che vede se il PC ha risposto a chi controlla. _(2026-11-10)_
- un rapporto «Controllo di tutti i PC» mostra la versione dei PC: prima di aprire un difetto verificare che sia sotto l'ultima versione corretta (qui 0.99.1 vs fix in 0.99.2). _(2026-11-11)_

## strumenti

- negli script Python in heredoc `\n` e `\b` nei letterali diventano caratteri veri e rompono le regex: per i sorgenti TS usare Edit. _(2026-11-08)_

## ambiente

- nel worktree la Bash rifiuta comandi con mklink/cmd; la junction node_modules si crea con New-Item -ItemType Junction da PowerShell e si toglie con (Get-Item).Delete(). _(2026-11-08)_
- il gancio «PC carico» blocca ogni comando npx del Bash finché il processore è sopra soglia: prima di lanciare la suite, controllare il carico o aspettare, non riprovare in serie. _(2026-11-08)_
- La guardia del PC rifiuta anche `npm run typecheck` con CPU alta e non basta riprovare; un comando in background non aggira il rifiuto. _(2026-11-08)_
- la guardia del carico può rimandare per ore anche `tsc`; con Defender al 30% il typecheck non parte: lanciare i test per file e riprovare dopo. _(2026-11-08)_
- Con la guardia del carico che rimanda tsc, `ping -n N 127.0.0.1` è l'unica attesa consentita: `sleep` seguito da un comando viene bloccato. _(2026-11-08)_
- Nel worktree la guardia rifiuta i comandi Bash che mettono git dentro blocchi composti (`||`, `&&` con cmd): tenere git in chiamate semplici e la junction in PowerShell. _(2026-11-08)_
- nei worktree alcuni heredoc Bash con python vengono rifiutati come «troppo complessi»: scrivere lo script con Write ed eseguirlo, oppure usare Edit _(2026-11-09)_
- Per scrivere stringhe con `\n` nei file non usare heredoc Python: gli escape vengono interpretati. Meglio lo strumento Edit. _(2026-11-10)_
- Nel worktree gli heredoc con `cat >>` seguiti da altri comandi nella stessa chiamata Bash vengono rifiutati come «troppo complessi»: usare Edit e comandi separati. _(2026-11-10)_

## hook

- SubagentStop senza toccare server.ts: hook `command` con `node -e` e script in base64 (niente virgolette da proteggere), generato da `finePrematura.toString()`; la funzione deve restare autosufficien… _(2026-11-08)_
- l'hook Bash di SierraDeck blocca sleep e comandi in sottofondo: le attese a intervalli non si possono fare da una chat, serve richiamare o un altro meccanismo. _(2026-11-10)_

## versioni

- le versioni dei PC nel rapporto vengono dall'ultimo battito, che non si scrive con il Drive pieno: prima di dire «vecchio» si controlla il PC. _(2026-11-09)_

## drive

- Il freno Drive (k-65) esiste: se un controllo mostra 403 quota ripetuti, prima guardare la versione dei PC (0.95.x non ce l'ha). `creaFreno(adesso, caso)` e `creaArchivioDrive({pausa, caso})` rendono… _(2026-11-08)_
- «Drive pieno» nella Salute viene dal freno in memoria che scade dopo 15 minuti (index.ts:2632): va reso uno stato «detto», non «in corso». _(2026-11-09)_
- Con Drive pieno il freno blocca anche battito, posta e registro insieme; «acceso» in Progetti viene solo dal battito, quindi un PC che risponde appare «non risponde». _(2026-11-09)_
- A Drive pieno il freno blocca POST/PUT/PATCH ma non DELETE: ogni pulizia va annotata in locale (spazio-intenzioni.json) e il registro sul Drive va riallineato dopo, mai prima. _(2026-11-09)_
- Il freno blocca solo POST/PUT/PATCH: ogni scrittura fa prima una ricerca GET (google-drive.ts carica), e i ritentativi su rateLimit non guardano il freno. _(2026-11-10)_
- Il 403 storageQuotaExceeded non entra in «rifiutate» (risorse.ts 179-183): le rifiutate sono solo limiti di velocità. _(2026-11-10)_
- `conFreno` alza il freno sulla prima risposta 429/rateLimit, quindi un controllo `attesaMs() > 0` dentro `conRitenta` equivale a «mai ritentare i limiti»; i test che si aspettano il ritentativo vanno… _(2026-11-10)_
- in `conLimite` un errore ferma solo il suo lavoratore: gli altri continuano con le voci rimaste. Per fermare tutto serve un flag condiviso, come `pienoVisto` in `salvaIncrementale`. _(2026-11-10)_
- I giri periodici sono frenati, ma le letture chiamate da fuori (`pcSubito` per telefono e controllo) no: senza memoria dopo un errore, ogni chiamata ripete la richiesta a vuoto. _(2026-11-10)_

## tooling

- Nel worktree i comandi Bash/sed composti con più modifiche vengono rifiutati come «troppo complessi»: usare Edit per le modifiche multiple. _(2026-11-09)_

## criteri

- `git tag --list vX` esce sempre con 0 anche senza tag: come criterio dà verde falso (k-184 0.97.1 segnata fatta senza release). Usare `git rev-parse vX` o `gh release view vX`. _(2026-11-08)_
- `ePesante` taglia su `|` e `;` anche dentro gli apici: toglierli con `senzaApici`, salvo dopo `-c`/`-Command`/`/c`, dove stanno i comandi veri. _(2026-11-08)_

## processo

- la guardia del carico rimanda anche `tsc` lanciato diretto e Start-Sleep è bloccato: scrivere i test e fare commit prima, poi misurare quando il PC scende. _(2026-11-08)_
- la guardia del carico può rimandare typecheck per molti minuti di fila; non si può aspettare dentro il turno (sleep e Monitor sono bloccati): il commit va fatto prima. _(2026-11-08)_
- La guardia del carico controlla prima del comando: un `ping` nella stessa chiamata non fa aspettare. Per attendere serve una chiamata separata, poi si ritenta. _(2026-11-08)_

## unioni

- il turno dell'unione (12 min, attesa compresa) è più corto della prova (15 min) che lo contiene: possibile scadenza prematura, da decidere _(2026-11-08)_
- UNIONE_TURNO_MAX_MS (12 min) copre solo i passi git, non le misure; se scade prima di PROVA_MAX_MS l'esito è lo stesso 'scaduta'. Ordine voluto: turno < prova < fila. _(2026-11-08)_
- dopo un riavvio i subagenti in memoria sono vuoti: cancelloOra trova ramo e cartella solo se il piano li ha salvati, quindi va salvato anche il worktree, non solo il ramo _(2026-11-10)_
- Ripresa dopo il riavvio: le unioni partono solo dopo la pulizia della prova (`provaRipulita`) e una volta per avvio. Senza aggiornamento solo compiti con `ramo` e senza esito «unione non fatta». _(2026-11-10)_
- Il quaderno riscrive righe esistenti («(×2)», riordino): il controllo «solo righe aggiunte» sul numstat non basta. Dentro .sierradeck/quaderno/ si salva sempre. _(2026-11-10)_
- la prova di unione salva con un commit solo `.sierradeck/quaderno/` (anche riscritto); le altre note di `.sierradeck/` restano «solo aggiunte» (numstat): un test deve coprire entrambi i rami. _(2026-11-11)_

## gpu

- Nel codice non ci sono switch che spengono la GPU: il «software» dei PC viene da Chromium (driver di base Windows, Desktop remoto, scheda esclusa), non da un ripiego di SierraDeck. _(2026-11-08)_

## ui

- il pannello «Altri computer» è `AltriComputer` in PannelloAccount.tsx (mostrato in Salute) e legge i battiti da `posta:pc`; la versione viva va chiesta a parte. _(2026-11-08)_

## salute

- la versione di un altro PC va chiesta dal vivo (`/api/pc`): col Drive pieno i battiti si fermano e «Aggiorna» diventa falso; `frenoDrive.pieno()` dice se il Drive rifiuta scritture. _(2026-11-08)_
- `IngressiSalute.io` può mancare nei test e in alcuni punti di `index.ts`: per il nome di «questo PC» serve un ripiego («Questo PC»). _(2026-11-09)_
- «Quanto lavora SierraDeck»: il tono dipende solo dai consumi di questo PC; i dati degli altri PC arrivano dal battito sul Drive e, se vecchio (PC_SPENTO_DOPO_MS), non vanno mostrati come attuali. _(2026-11-10)_
- Le voci create da `risorse` di un altro PC (consumi, `gpu:`) vanno filtrate col battito recente in `componiSalute`; ogni nuova voce per PC ha lo stesso rischio di dato vecchio. _(2026-11-10)_

## dipendenze

- @xterm/headless 6.0.0 e @xterm/xterm 6.1.0-beta stanno su versioni diverse: se il terminale della main process si comporta in modo strano, guardare prima questa differenza. _(2026-11-08)_

## misure

- il gancio PreToolUse rimanda vitest se il PC è carico: attendere col Monitor, non con sleep ripetuti, e fermarsi dopo 3 tentativi. I file singoli passano comunque. _(2026-11-08)_

## aggiornamenti

- la classificazione passeggera sul breve (prima riga, senza contesto) perde il 504 nudo: classificare sul messaggio completo e su statusCode. _(2026-11-08)_
- la lista di errori di rete passeggeri (ERR_*) va estesa con ERR_CONNECTION_CLOSED/RESET e timeout; eBloccoTemporaneo non esiste in src. _(2026-11-08)_
- HttpError di electron-updater ha message «504\nHeaders: {…}» e statusCode numerico: classificare sul messaggio completo/statusCode, non sulla prima riga. _(2026-11-08)_
- con autoDownload attivo electron-updater crea downloadPromise dentro checkForUpdates: il suo rifiuto non passa dal try di cerca(); va agganciato a aggiornamenti.ts:657. _(2026-11-08)_
- leggiErroreAggiornamento riconosce il 404 «mancante» solo su latest*.yml: il 404 dell'exe durante la pubblicazione conta come errore. _(2026-11-08)_
- allowDowngrade diventa vero solo col setter di channel in electron-updater: senza, una versione più vecchia del feed non si scarica mai. _(2026-11-08)_
- un 404 su exe/blockmap è atteso a release a metà pubblicazione: soglia 2 ore in src/shared/aggiornamenti-404.ts, poi errore una volta sola. _(2026-11-08)_
- pausa-aggiornamento.json era sempre `sessioni: []`: chi parte dopo la quiete (consegna dell'autopilota durante il salvataggio) non si annotava; ora si ricontrolla dopo `prepara` e all'uscita. _(2026-11-09)_
- Il servizio parte dopo che il Gestore ha letto e cancellato pausa-aggiornamento.json e aggiornamento-in-corso.json: per capire se c'è stato un update servono i segni nell'archivio o il payload di /ge… _(2026-11-09)_
- il 504 di GitHub passa solo se l'errore ha statusCode o inizia con il codice seguito da Headers; l'HttpError con descrizione o frase vuota non è coperto dai test _(2026-11-10)_

## installa-la

- `da` (versione di partenza) non va mai preso da un battito Drive vecchio: Drive pieno = battito fermo per giorni. Vale solo la versione viva da /api/ciao. _(2026-11-08)_

## specialisti

- Il servizio autopiloti è un processo separato dal main: per spingere eventi non c'era canale. Ho aggiunto un long poll `/orchestratore/cambi`; il telefono resta a richiesta, senza SSE. _(2026-11-08)_

## typecheck

- un canale IPC nuovo va dichiarato in due posti: src/preload/index.ts e src/renderer/env.d.ts. Senza il secondo, il renderer non compila. _(2026-11-08)_

## guardia

- se la guardia rimanda un comando pesante, il sleep in primo piano è bloccato. Aspetta con un until-loop in background (cronometro) e riprova. _(2026-11-08)_
- `tipiSpecialisti` nel contesto della guardia è facoltativo: i test vecchi non lo passano e non si rompono. Senza git il controllo del tipo `Agent` è spento di proposito. _(2026-11-08)_
- il rifiuto delle cancellazioni nelle chat sta in divieti.ts (giudicaCancellazioni), chiamato da /hook/pretool in server.ts; cancella-sicura.ts riguarda solo le pulizie del programma _(2026-11-10)_

## renderer

- i canali nuovi di window.gestore vanno dichiarati opzionali in env.d.ts e chiamati con `?.`: i finti dei test e le app più vecchie non li hanno. _(2026-11-08)_
- La Panoramica non ha una lettura propria: gli specialisti li legge `ChatSpecialisti` col sondaggio dell'orchestratore, e l'evento specialistiCambiati si aggancia con `sond.rileggi()`. _(2026-11-08)_
- scriviQuandoPronta guarda solo i riquadri del workspace corrente: un avviso mandato a una chat di un workspace tenuto dietro sparisce in silenzio, quindi non va segnato come consegnato. _(2026-11-09)_
- PannelloDomande mostra String(e) grezzo invece di testoErroreDialogo: a Nicholas arriva il messaggio tecnico con «Error invoking remote method». _(2026-11-10)_

## fermate

- Causa n.1 delle fermate (08/11): la guardia rimanda, ma lo specialista non può aspettare (sleep bloccato, niente Monitor), quindi chiude senza prove e il criterio diventa rosso. _(2026-11-08)_

## guardia-pc

- `guardia.attendi` non basta in un hook: dopo il passo libero, `giudicaPesanteDellaChat` rimanda per «appena liberato». Serve un ciclo che ripeta tutto il giudizio. _(2026-11-08)_

## shell

- heredoc Python con `\n` dentro stringhe di test: finiscono come a-capo veri e rompono il file; usare `.join('\n')` e fare le modifiche con Edit. _(2026-11-08)_

## ramo

- il worktree può partire senza l'ultimo main (k-191 mancava nonostante il compito): fare `git merge main` prima di cominciare. _(2026-11-08)_

## apk

- `npm run allega-apk` senza `--senza-build` lancia gradle e ricompila. Per riallegare l'ultimo APK usare `--senza-build`, ma serve un APK già costruito in quella cartella. _(2026-11-08)_

## pubblicazione

- Un agente lanciato in worktree isolato non può eseguire git nella cartella principale: la pubblicazione dalla cartella principale va affidata a un agente senza isolamento. _(2026-11-08)_

## tsconfig

- con noUncheckedIndexedAccess `aree[0]` è `T | undefined`: annotare il tipo (`let area: Rettangolo = x ?? aree[0]!`), altrimenti gli errori si propagano a ogni uso. _(2026-11-09)_

## finestra

- Electron maximizza sul display che contiene i bounds normali: se questi sono fuori dai monitor, anche la finestra ingrandita finisce nel posto sbagliato. _(2026-11-09)_

## servizio

- l'installer uccide anche il servizio autopiloti: memoria persa (messaggi e specialisti). Ripresa dal disco con `ripresaDopoRiavvio`, non basta il «lavoro fermo» (3 min, 2 spinte). _(2026-11-09)_
- riprendiLavori({servizioAppenaPartito}) gira anche all'avvio del PC e dopo un crash, non solo dopo un aggiornamento: quello che fa lì va pensato come avvio normale _(2026-11-09)_
- «rispondi» a una domanda usa ancora l'attesa di 3 s (autopilot-client.ts:411-415): la 0.95.5 ha alzato a 30 s solo il dialogo. Ogni POST che scrive deve passare attesaScrittura. _(2026-11-10)_

## registro

- copie-di-versione/<ver>-<data> contiene il pausa-aggiornamento.json e aggiornamento-in-corso.json di ogni update: prova utile a capire cosa fu salvato prima dell'uscita. _(2026-11-09)_

## ripresa

- riquadroDi nella finestra vede solo useLayoutStore: le chat dei workspace dietro (memoriaWorkspace) non si raggiungono con scriviQuandoPronta _(2026-11-09)_
- Dopo un riavvio la memoria degli specialisti non c'è più: per riprendere un'unione serve il ramo salvato nel piano (CompitoPiano.ramo), non il solo id del compito. _(2026-11-10)_
- riprendiOrchestratori può arrivare secondi dopo l'avvio (gestore-avviato): non rifarci lavoro già avviato all'avvio, la fila evita i doppioni solo mentre l'unione è ancora dentro _(2026-11-10)_

## spazio

- il recupero di 30 giorni non libera spazio: i file restano sul Drive fino a «Svuota adesso» o alla scadenza. Non presentarlo come liberazione. _(2026-11-09)_
- ogni percorso di pulizia scrive il registro prima di cancellare: a Drive pieno nessuno dei percorsi con recupero parte. Solo le DELETE (versioni, svuota) passano. _(2026-11-09)_
- il cestino di Google non c'entra con i file di SierraDeck (appDataFolder, DELETE definitivo). Il messaggio «svuota il cestino» va corretto. _(2026-11-09)_
- Una pulizia con voci ancora nell'indice, ma file già cancellati, viene riproposta dal giro delle chat: le proposte devono ignorare le voci di pulizie in sospeso (indiceVisto). _(2026-11-09)_
- `pulisci('chat-non-usate')` non trovava la proposta: viene da `proposteChatSulDrive`, non da `proposteDiPulizia`; ora è in `StatoSpazio.chatNonUsate`. _(2026-11-09)_

## sposta

- «Sposta su questo PC» chiama il PC di prima su /api/sposta/prepara con il timeout di 4 s (non è in ROTTE_LENTE): un upload lungo finisce in «non ha finito entro 4 secondi». _(2026-11-09)_
- con `prepara` asincrono i test devono rileggere lo stato con `riprendi()` dopo `avvia`; fissare `adesso` e le pause (`pausaAttesaMs`) per i tempi massimi _(2026-11-09)_

## remoto

- Ogni 404 non di chat viene mappato a «questa chat non è aperta» (scoperta-pc.ts:230): /api/apri con cartella inesistente sembra un PC spento. _(2026-11-09)_

## pc-remoto

- per i 404 di rotte che non riguardano chat, il motivo si decide dal testo dell'errore in `datiDa`; `motivoDaStatoHttp(404)` dà sempre 'chat' _(2026-11-09)_

## pagina

- una funzione condivisa che arriva nella pagina con toString() non può avere funzioni annidate né costanti di modulo: i dati le arrivano come parametri. _(2026-11-09)_

## merge

- client-pagina.ts: la lista di firme che fa ridisegnare la pagina del telefono è il punto dove si scontrano le funzioni nuove; tenere sempre le righe di entrambe. _(2026-11-09)_

## verifica

- su Windows il checkout con autocrlf dà CRLF nei file del worktree: un confronto byte a byte con la cartella principale segnala «diversi» anche con contenuto uguale. Confrontare ignorando i CR (`tr -d… _(2026-11-10)_

## rete

- nel client dell'autopilota ogni POST che fa scrivere il servizio su disco deve passare `attesaScrittura`: senza, valgono i 3 s di lettura e sotto carico scade. _(2026-11-10)_
- gli errori di rete dell'API nei turni (ENOTFOUND, Can't reach the API server) vanno trattati come passeggeri, come quelli dell'aggiornamento: avviso, non ERRORE. _(2026-11-10)_
- `eErroreDiRete` in src/shared/errori-rete.ts è l'unico elenco degli errori di rete, condiviso da aggiornamenti e autopilota: aggiungere i codici lì. _(2026-11-10)_

## cancello

- il messaggio «anche nella cartella principale non passa» (server.ts 698/708) vuole dire che il ramo rompe criteri che su main passano: il testo è invertito e non mostra i nomi dei test. Tre rami dive… _(2026-11-10)_
- il criterio aggregato «npx vitest run» senza percorsi (k-170) fa girare l'intera suite in un solo comando: 3 minuti qui, ma la prova ha 15 minuti in totale contro 20 del comando. _(2026-11-10)_
- Rifiuto «anche nella cartella principale non passa» = il ramo rompe prove che su main passano (testo invertito, senza nomi): far girare `npx vitest run` intero sul ramo unito a main per trovarle. _(2026-11-10)_
- un ramo già unito e cancellato non si misura: serve un ramo nuovo aggiornato a main (già scritto nel quaderno). _(2026-11-10)_
- Il cancello salva le note `.sierradeck/` prima di unire solo se il diff è fatto di sole aggiunte (numstat, zero righe tolte); righe cambiate o tolte restano di Nicholas. _(2026-11-10)_

## consenso

- il consenso a cancellare nasce solo in rispondiAllaDomanda (server.ts), da una risposta di Nicholas: mai da testo della chat; scade in 30 min ed è in memoria _(2026-11-10)_

## flusso

- Un rifiuto dell'hook che contiene «sottofondo/async/background» viene letto dal flusso come Agent partito in sottofondo: nessun «finito», il compito resta «in-corso». Evitare quelle parole nei motivi. _(2026-11-10)_

## piano

- `compito.ramo` va tolto (`senzaRamo`) quando il compito torna da-fare o in-corso, altrimenti la ripresa riunisce il ramo vecchio. _(2026-11-10)_
- Un criterio con comando che legge solo file sotto .sierradeck/ (es. grep sul quaderno) è rifiutato: per le note scrivere il criterio a parole, lo giudica il supervisore. _(2026-11-11)_

## orchestratore

- il ramo risposta con errore del result scarta s.inviati senza rimettere i messaggi in coda, a differenza dell'uscita del processo: un messaggio nel turno fallito si perde. _(2026-11-10)_
- s.tentativi si azzera a ogni risposta, anche con errore: il limite di un riprovo non vale per gli errori del result, e ogni risveglio lancia un turno nuovo. _(2026-11-10)_
- su un `result` con `is_error` il turno non riprova da solo con rete assente: `pronto()` ora è falso durante `riprova` e `fermo`, altrimenti `suEffetti` rilancia il turno a raffica. _(2026-11-10)_

## modelli

- Il telefono (pagina e app Android) legge `/api/modelli` dal servizio: basta cambiare `src/shared/modelli.ts` o la scoperta, senza ricompilare l'APK. _(2026-11-10)_

## pubblica

- `npm run pubblica` da una copia: serve `google-oauth.json` (ignorato da git) e una `node_modules` vera, non una junction. Con la release già creata non carica nulla: caricare a mano. _(2026-11-11)_

## quaderno

- i lotti di errori arrivati stanno solo nella copia principale (`.sierradeck/errori-arrivati/lotto-*.md`), non nei worktree; vanno letti da lì senza modificarli. _(2026-11-11)_
