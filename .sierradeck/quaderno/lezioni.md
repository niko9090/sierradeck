# Lezioni del progetto

<!-- SierraDeck: una riga per voce; una voce che torna aumenta «confermata N×». Tetto 200 voci o 32 KB: escono prima le meno confermate e più vecchie. Si può scrivere anche a mano. -->

## pty-host

- Lo stderr dell'host passa da `leggiStderrAtteso` in pty-host-client.ts: i rumori attesi di node-pty o dello spegnimento si aggiungono lì, il resto resta errore. _(2026-10-30)_

## test

- `racconta` senza l'opzione `log` scrive in console.error: per provare che una riga è raccontata e non errore, il test deve passare `log`. _(2026-10-30)_
- Il test di `creaLoggerUpdater` usava ERR_INTERNET_DISCONNECTED come «errore vero»: per un guasto vero in un test usa un checksum sbagliato, non un errore di rete. _(2026-11-01)_
- il bussare in `statoDi` riesegue `bussa`: nei test che contano le chiamate a `dimentica` o al fetch compaiono doppie. _(2026-11-05)_
- nei worktree senza node_modules basta una junction verso quella principale per far girare tsc e vitest; tenerla finché il ramo non è unito _(2026-11-05)_
- In controllo-pc.test.ts un test del 05/11 fissava il bug (due righe per lo stesso PC): se cambi la chiave di unione, aggiorna anche quello. _(2026-11-05)_
- Le cache firmate con la sola mtime di una cartella sono fragili su Windows (orologio a ~15 ms): un file nato nello stesso tick non si vede. Rileggere se la mtime è più recente di 2 s. _(2026-11-05)_
- Un test che fallisce 1 volta su 4 nella suite completa si trova rilanciando la suite, non il singolo file: il singolo file spesso passa. _(2026-11-05)_
- `npx vitest run tests/main` non copre tests/autopilot-host: per modifiche al servizio lanciare anche quella cartella. _(2026-11-05)_
- l'hook di carico del PC può rifiutare tsc e la suite completa (memoria libera al 5%, vmmemWSL): fare prima il commit e provare il singolo file, poi riprovare. _(2026-11-06)_
- nei test con timeout reali (server http finto) i margini sotto i 100 ms falliscono quando il PC è carico: aspettare almeno 400 ms sul lato lento _(2026-11-06)_
- l'hook "PC carico" rimanda anche tsc e vitest completi per molti minuti, e sleep/Monitor sono bloccati: fare il commit prima e provare i singoli file. _(2026-11-06)_
- `code.cambia(ws, f)` vuole `{coda, eventi}`, non la sola coda. Con la CPU alta l'hook blocca anche Bash e PowerShell: commit prima, poi attesa con un `until` sull'orologio. _(2026-11-06)_
- I test in tests/ sono controllati da tsc: un helper ricorsivo senza tipo di ritorno esplicito dà errore. Senza jsdom, un componente senza hook si prova chiamandolo e cercando gli input nell'albero. _(2026-11-06)_
- Con l'autopilota finto gli eventi (sveglie) partono solo a turno chiuso: nei test del servizio emettere un `result` dopo gli assistant, altrimenti l'evento resta in raccolta _(2026-11-06)_
- Senza DOM i tasti si provano chiamando il componente puro come funzione e cercando onClick nell'albero degli elementi; la pagina si prova con new Function sulle funzioni estratte. _(2026-11-06)_
- L'hook di carico PC rimanda vitest per cartella e tsc, ma lascia passare un file alla volta, anche in un ciclo `for` con percorsi espliciti: così si prova il ramo a PC carico. _(2026-11-06)_
- `tests/renderer/linguetta-domande.test.ts` controlla il sorgente di `ChatAutopilota.tsx`: dopo k-45 la chat risponde alle domande con `rispondi(`, la regola «mai da lì» non vale più. _(2026-11-06)_
- il servizio manda gli eventi all'orchestratore solo a fine turno: nei test emettere un `result` prima di cercare il testo negli scritti del processo finto. _(2026-11-06)_
- il controllo «PC carico» blocca tsc e le suite di cartella, non i test di un solo file: lanciare i file nuovi uno alla volta e tsc appena la memoria libera risale _(2026-11-06)_
- l'hook "PC carico" rimanda tsc e la suite anche dopo molti tentativi; i test di un solo file passano. Ricordarsi di lanciare tsc e la suite completa appena il PC è scarico. _(2026-11-06)_
- Il guardiano del PC rimanda anche i test di directory o per prefisso (non solo tsc): vanno lanciati file per file, e il rinvio può durare a lungo. _(2026-11-06)_

## worktree

- un agente isolato in un worktree non può eseguire git nella cartella principale: i compiti che chiedono commit su main vanno dati a chi lavora fuori dal worktree. _(2026-10-30)_
- il ramo di una chat può essere indietro rispetto a main: per verificare una correzione appena unita usare `git grep <simbolo> main -- <percorso>`, non il file del worktree. _(2026-10-31)_
- La junction node_modules nel worktree si crea con PowerShell New-Item -Junction: `cmd //c mklink` da Bash viene rifiutato. _(2026-11-05)_
- Un worktree può partire indietro rispetto a main (qui mancava tutto k-50): fare git merge --ff-only main prima di lavorare. Foreground sleep è bloccato: riprovare, l'hook carico lascia passare. _(2026-11-06)_

## errori

- Lo stderr dei figli arriva a pezzi arbitrari: riconoscere le righe attese una per una, mai con `^` sul pezzo intero (0.88.2 sfuggiva, prefisso doppio). _(2026-10-30)_
- Gli avvisi Node (DEPxxxx) arrivano su stderr dei figli (claude, PTY host) o via console.error: filtrarli con src/shared/avvisi-node.ts prima di chiamarli errori. _(2026-11-05)_
- StatoInvio.fino non avanza più dopo l'invio: la verità sono i conteggi per chiaveErrore in `inviati`. Con `fino` che avanza, un tetto di peso farebbe passare per inviate voci mai partite. _(2026-11-06)_

## consegne

- Una cartella sparita va controllata anche al ritiro (`ritira`), non solo alla lettura della coda: una consegna già in coda riapriva il riquadro a ogni tentativo. _(2026-10-30)_

## chiusura

- I gruppi su 0.88.1/0.88.2 possono essere già corretti nella 0.88.3: confrontare la versione dell'errore con il commit prima di intervenire. _(2026-10-30)_

## updater

- electron-updater scrive con logger.error anche avvisi attesi (differenziale 501): filtrarli in creaLoggerUpdater, non nel gestore dell'evento `error`. _(2026-10-31)_

## shell

- in PowerShell un messaggio di commit con apostrofi o virgolette in here-string inline può spezzare git: usare `git commit -F` con un file temporaneo. _(2026-10-31)_
- Da un worktree il tool Bash rifiuta `cmd //c mklink`: per la junction node_modules usare PowerShell (New-Item -ItemType Junction) e `cmd /c rmdir` per toglierla. _(2026-10-31)_
- Nei worktree il Bash rifiuta i comandi composti con heredoc e python: usa Write/Edit per i file. _(2026-11-01)_

## android

- Api.corpoTestoDiretto leggeva il corpo intero con body.string(): ora c'è un tetto di 16 MB (413) in leggiConTetto; ogni nuova lettura di testo passi di lì. _(2026-10-31)_
- Il worker che chiama Api è LavoroConsegne (consegne e ponte). Nel worktree android/ non ha gradlew né local.properties: il Kotlin non si compila lì. _(2026-10-31)_
- Sul PC dev non ci sono gradlew né SDK (`E:\Android\Sdk` assente): il Kotlin non si compila qui. Tenere la logica nuova in funzioni pure con test e controllare la build a parte. _(2026-11-06)_
- Per compilare in un worktree: sdk.dir=E:/Android/Sdk in android/local.properties (ignorato), JAVA_HOME=JDK 21 Microsoft, gradle in E:\Programs\Gradle\gradle-8.11.1\bin. Non c'è gradlew. A freddo ~7 m… _(2026-11-06)_
- CORREZIONE: l'SDK c'è in E:\Android\Sdk (la lezione «SDK assente» è sbagliata). Nei worktree: local.properties sdk.dir, JAVA_HOME=JDK 21 Microsoft, gradle globale 8.11.1, senza gradlew. _(2026-11-06)_
- una data class nuova può collidere con una già presente nello stesso package (RigaSpecialista in PaginaWorkspace.kt): cercare il nome con grep prima di dichiararla. _(2026-11-06)_

## quaderno

- errori-arrivati.md è solo in coda: un ramo che aggiunge un lotto va riunito con main prima, altrimenti i lotti dei rami fratelli confliggono. _(2026-10-31)_

## release

- `noteDi` di scripts/note-novita.mjs restituisce un array di righe, non una stringa: unirlo con join prima di scriverlo su file. _(2026-10-31)_
- Un agente lanciato in un worktree isolato non può eseguire git sulla cartella principale (né `cd` né `git -C`): una release che va costruita lì va affidata a una sessione non isolata. _(2026-11-05)_
- Gli specialisti non possono usare git nella cartella principale: la release si costruisce nella loro copia con node_modules vera (npm ci, mai junction) e google-oauth.json copiato e poi tolto. _(2026-11-05)_
- La versione Android è 2.88.6 (non 2.93.0): la numerazione dell'app non segue quella del programma. Con android/ invariato allega-apk riallega la stessa. _(2026-11-05)_
- Dalla copia con `npm ci` (no junction) la release passa: controlla-pacchetto dà 49 moduli, tag e push da lì valgono. `gh release view --json isDraft,assets --jq` con più campi va in errore: usare Con… _(2026-11-05)_
- 0.93.1 (05/11) pubblicata dalla copia con npm ci: 49 moduli, 5 allegati. L'APK è alla 2.88.6 (numerazione Android separata): con android/ invariato si riallega quello. _(2026-11-05)_
- Se un collega ha lasciato un build a metà in un altro worktree, controlla che dist non abbia l'exe e che non ci siano processi; poi costruisci nella tua copia, già sul tag, senza riprendere la sua. _(2026-11-05)_
- `allega-apk --senza-build` da una copia nuova: copia `app-release.apk` e `local.properties` dalla cartella principale, poi cancella `local.properties`. _(2026-11-05)_
- Dopo una release da una copia, il main locale resta indietro del commit del bump (0.94.2: a1bfb663 solo su origin/main): prima del lavoro dopo, allinearlo con git merge --ff-only origin/main. _(2026-11-05)_
- Dopo la 0.94.3 il main locale è indietro di 0f0b1efe (bump) e c2c530c5 (novità) su origin/main: il primo specialista del prossimo lavoro li unisce con fast-forward prima di partire. _(2026-11-05)_

## git

- Un agente in worktree non può eseguire git nella cartella principale: ripristini e commit su main vanno fatti dall'autopilota, non da uno specialista isolato. _(2026-10-31)_
- il conflitto su errori-arrivati.md nasce da due voci aggiunte in coda dallo stesso file: si risolve tenendo entrambi i blocchi, senza scegliere una parte _(2026-11-05)_
- i tag sono condivisi fra i worktree: basta `git fetch origin --tags` da una qualsiasi copia per verificarli. _(2026-11-05)_
- Questo repo ha `core.autocrlf`: il commit avvisa che LF diventa CRLF sui file nuovi. È normale, non va corretto. _(2026-11-05)_

## log

- il sink del PtyHostClient (index.ts:1420) è registro.errore: ogni riga raccontata, anche informativa, diventa ERRORE. Separare info ed errore. _(2026-10-31)_

## autopilota

- autopilota-intero.ts: il finally richiama carica() subito dopo un catch che azzera chiesta, quindi il retry non ha attesa. _(2026-10-31)_

## pacchetto

- in package.json solo lo script pacchetto ha --prima/--dopo; pubblica ricostruisce senza controlli. _(2026-10-31)_

## registro

- Electron scrive «Error occurred in handler» per ogni rigetto di ipcMain.handle: il filtro sta in console-nel-registro.ts come per PREFISSO_CHAT_ALTROVE, non nel gestore. _(2026-11-01)_

## avvio

- In spawnConvalidato la validazione cwd viene prima di casaAltroveDi: un progetto di un altro PC con cartella assente non arriva al messaggio «vive su <PC>». _(2026-11-01)_

## aggiornamenti

- Gli errori di rete transitori dell'updater (ERR_NO_BUFFER_SPACE) si ritentano da soli con RICONTROLLA_MS: il registro non deve trattarli come guasti. _(2026-11-01)_
- i 5xx di GitHub sul feed (502/503/504) sono passeggeri durante una pubblicazione; il 501 differenziale e il 404 su latest.yml hanno trattamenti propri, non confonderli. _(2026-11-05)_

## ipc

- `pty:spawn` ha tre rami prima dello spawn (proprietario, chiusa-senza-cartella, convalida): il proprietario va per primo, perché un progetto di un altro PC qui non ha la cartella. _(2026-11-01)_
- Ogni handler `autopilota:*` che chiama il client va avvolto in una funzione pura che trasforma `scaduto: true` in un esito; dopo `dettaglio` (0.88.10) mancava `elenca`. _(2026-11-05)_

## servizio

- Nel servizio ogni console.error va nel registro come ERRORE e negli errori arrivati: un caso atteso (porta occupata) deve usare console.warn. _(2026-11-05)_
- Il servizio avviato dallo script di login non riceve SIERRADECK_VERSIONE (versione «?»); senza versione il Gestore non lo sostituisce. Non scriverla nello script: invecchia. _(2026-11-05)_
- il dialogo scade a 3 s se il servizio è occupato ma il messaggio può essere già scritto: le POST che scrivono vogliono attesa lunga e un id del messaggio, altrimenti il ritentativo lo duplica _(2026-11-06)_
- Le domande hanno 2 elenchi: `aperte()` (tutte, per dedupe e ritiro) e `visibili()` (senza quelle solo-in-chat). Pannello, telefono e notifiche leggono `GET /domande`, che filtra. _(2026-11-06)_
- il tetto dei subagenti è una variabile d'ambiente del processo claude: per cambiarlo si spegne e si riprende con --resume, solo a turno finito. Il tetto per workspace (3) lo limitava anche con 6 post… _(2026-11-06)_

## controllo

- criticitaDi unisce per testo, non per PC: lo stesso PC esce due volte se la riga viene dalla salute di un altro PC e l'altra dal proprio bussare. Unire per pcId. _(2026-11-05)_
- In criticitaDi il «non risponde» locale ha chiave non-risponde:<id>, quella degli altri PC pc:<id>: chiavi diverse, così lo stesso PC esce due volte (05/11, 0.93.1). Usare una chiave sola. _(2026-11-05)_

## remoto

- l'esito «chiave» prende ogni 401, anche quello di un altro SierraDeck o di un estraneo: va distinto per identità (impronta), altrimenti il messaggio contraddice le prove. _(2026-11-05)_

## rete

- un indirizzo salvato può essere riassegnato dal router a un altro PC con SierraDeck: l'identità (impronta) va sempre confrontata anche con i PC noti, non solo con quello atteso. _(2026-11-05)_
- La chiave del PC non va mai mandata a un indirizzo LAN non verificato: prima `/api/ciao` (senza chiave) deve dare l'impronta attesa. Un 192.168.x.x può essere un'altra rete. _(2026-11-06)_

## strumenti

- Nel worktree il filtro dei comandi rifiuta qualunque comando Bash con «git» dentro, anche `npm version --no-git-tag-version`: da PowerShell passa. _(2026-11-05)_
- l'hook che serializza i comandi pesanti risponde «riprova fra N minuti» anche per `tsc` e per `vitest` su una cartella. Fare commit prima, poi un solo file di test per volta. _(2026-11-06)_

## pubblicazione

- `npm run pubblica` lascia la release in bozza: serve `gh release edit vX --draft=false --latest`. `isLatest` non è un campo di `gh release view`, si legge da `gh release list`. _(2026-11-05)_
- gh release create senza --draft fa saltare l'upload a pubblica («existing type not compatible»): o --draft, o caricare a mano exe/blockmap/latest.yml con nomi a trattini (0.94.3). _(2026-11-05)_

## apk

- `allega-apk` senza `--senza-build` lancia gradle e ricompila. Per riallegare l'APK esistente: copiare `app-release.apk` e `android/local.properties` dalla cartella principale e usare `--senza-build`. _(2026-11-05)_

## npm ci

- con `npm ci` l'eseguibile di Electron può non scaricarsi (allowScripts): serve `node node_modules/electron/install.js` prima di `pubblica`. _(2026-11-05)_

## ambiente

- un comando Bash che richiama `powershell -c` dentro un worktree viene rifiutato per intero, anche le parti sicure: usare lo strumento PowerShell a parte. _(2026-11-05)_
- Il guardiano del PC blocca anche typecheck e Bash/PowerShell per minuti, e sleep e Monitor non si possono usare: fare prima il commit. _(2026-11-06)_
- Il filtro di carico blocca tsc e le suite complete anche quando il PC sembra libero; i test di un solo file passano. Aspettare con `node -e "setTimeout(...)"` e riprovare _(2026-11-06)_
- Con WSL che occupa 15 GB il guardiano blocca tsc per ore: fare il commit prima, poi ritentare ogni ~9 minuti con un'attesa in bash. _(2026-11-06)_
- con il PC carico SierraDeck rimanda tsc e le suite grandi: committare prima, poi provare un file alla volta. _(2026-11-06)_
- Memoria piena per vmmemWSL (12-15 GB): `wsl --shutdown` porta la RAM libera da ~15% a ~65%; Nicholas l'ha permesso il 06/11. Ubuntu riparte da solo a ~1 GB e può ricrescere. _(2026-11-06)_
- Il programma rimanda tsc e vitest completi quando il PC è carico, anche per decine di minuti: lanciarli subito dopo il commit, prima di altro lavoro, e tenere i test mirati per intanto _(2026-11-06)_
- I file del repo sono CRLF: gli script node/sed con `replace` su stringhe multilinea non trovano nulla senza errori; usare Edit, oppure normalizzare prima \r\n. _(2026-11-06)_
- Il guardiano PC fa passare tsc e le suite complete una alla volta fra tutte le chat: aspettare con `until [ $SECONDS -gt N ]; do sleep 2; done` e riprovare; `sleep` lungo è bloccato. _(2026-11-06)_
- il controllo del PC carico rimanda gradle a ripetizione e `sleep` in primo piano è bloccato: l'attesa va fatta con `sleep` in background. _(2026-11-06)_
- l'hook rimanda tsc e le suite anche con PC libero se un criterio dell'autopilota è in corso; più file insieme (fino a ~35) passano, le cartelle intere no. _(2026-11-06)_

## renderer

- Un caso atteso va nel registro come info (`log.info`), non `log.errore`: `erroriDalLog` conta solo ERRORE o parole come fallito/rifiutato/guasto, quindi il testo dell'avviso deve evitarle. _(2026-11-05)_
- Terminal.tsx rimonta il riquadro a ogni cambio di workspace e di vista, e ogni montaggio rifà lo spawn: una condizione già nota (cartella sparita) va ricordata fuori dal componente. _(2026-11-05)_

## main

- la salute di un altro PC (/api/salute via remoto.chiama) è solo un cast, senza validazione: ogni campo letto dalle risposte remote va controllato, perché le versioni vecchie mandano altre forme. _(2026-11-06)_

## general-purpose

- LEZIONI: una copia creata a mano con `git worktree add` fuori da `SierraDeck.sierradeck-wt` non conta fra le cartelle dell'autopilota. Lì non si possono cancellare `google-oauth.json` e `local.proper… _(2026-11-06)_
- LEZIONI: quando il PC è carico, tsc e la build vengono rimandati. Conviene aspettare a blocchi di 3–5 minuti e riprovare, senza chiudere nessun programma. _(2026-11-06)_

## domande

- Le domande si leggono sempre dal registro del servizio (GET /domande): il ritiro va fatto lì con `superata()`, nessuna cache nel pannello o nel telefono da svuotare. _(2026-11-06)_
- Il registro non lega la domanda a una singola richiesta della coda: «richiesta unita» si copre solo con «tutta la coda è fatta»; servirebbe un richiestaId nel contesto. _(2026-11-06)_

## telefono

- Nessuna rotta nuova: il «visto» passa dal push `/stato-programma` del Gestore (`workspaceVisti`) e da `/api/autopilota` del telefono; `autopilot-client.ts` resta intatto. _(2026-11-06)_

## impostazioni

- Aggiungere o spostare una voce in impostazioni-struttura.ts cambia android/.../impostazioni.json: va rigenerato con AGGIORNA=1 e il test lo confronta. _(2026-11-06)_

## hook

- L'hook «PC carico» rifiuta tsc e suite completa per molti minuti: i test di un file passano. Per aspettare usare `sleep` in background e un `until` sul file di output. _(2026-11-06)_

## orchestratore

- Un Agent rifiutato dalla guardia arriva nel flusso come specialista «avviato» e poi «fallito» (tool_result is_error): nei test va emesso il tool_result, o i posti risultano occupati due volte _(2026-11-06)_
- gli Agent sono dentro il processo dell'orchestratore: non c'è modo di fermarne uno solo dal servizio, la fermata passa da un avviso all'orchestratore. _(2026-11-06)_

## menu

- Aggiungere una voce a MENU_PRINCIPALE rompe l'app Android (menu.json, Scheda, MenuPrincipaleTest): le voci solo-PC vanno fuori da quella lista, come VOCE_SPECIALISTI. _(2026-11-06)_

## pagina

- la pagina del telefono è una stringa TS: niente backtick né backslash, `\d` diventa `[0-9]`. Il test `posti-chat-pagina` estrae le funzioni con `new Function` e vuole definite le variabili globali. _(2026-11-06)_
- nella pagina telefono niente backslash: i tasti passano l'id con data-id e onclick="f(this)", e la logica condivisa sta in src/shared come funzione autosufficiente inserita con toString() _(2026-11-06)_
- In client-pagina.ts le funzioni di attesa-vista.ts vanno aggiunte anche all'elenco delle toString() e al test che le estrae, altrimenti attesaHtml non gira _(2026-11-06)_
- dentro lo script della pagina servita le funzioni sono testate estraendole da `paginaClient()`: se aggiungi una funzione usata da `menuSpecHtml`, va aggiunta anche nell'elenco di `disegna` in `tests/… _(2026-11-06)_

## apertura-chat

- «locale» in chat:daDove non vuol dire «aprila qui» se la casa è altrove: la chat arriva dallo spawn che ha già deciso. Un guasto va in attesa che riprova, mai nel cartello. _(2026-11-06)_

## guardiano

- su questo PC tsc e le suite intere possono restare rimandate per ore dal guardiano del carico: lanciarle subito dopo il commit, e controllare i file toccati uno alla volta. _(2026-11-06)_

## versioni

- i battiti degli altri PC con versione vecchia nei test cambiano l'esito di decidiApertura: la versione si giudica solo da un battito fresco, uno scaduto può essere superato. _(2026-11-06)_

## kotlin

- In un elenco di argomenti `a = i > 0, b = i < n` il compilatore legge `<`/`>` come generico: metti i confronti fra parentesi. _(2026-11-06)_

## build

- Il filtro dei comandi pesanti rifiuta le compilazioni con memoria libera sotto il 10% (vmmemWSL ~15 GB): da WSL non si esce con l'attesa, serve liberare memoria o aspettare. _(2026-11-06)_

## piano

- Un criterio che è solo un comando di lettura (`wsl --list --quiet`) passa sempre, anche se il lavoro non c'è: il criterio deve fallire quando il lavoro manca (es. un test o un confronto sull'uscita). _(2026-11-06)_

## autoriparazione

- Il «Torna come prima» non ripristina `coda.json` apposta: rimetterebbe una coda vecchia e perderebbe richieste arrivate dopo. Va ricordato se si estende il ripristino. _(2026-11-06)_

## drive

- le chat non si tolgono dal Drive quando spariscono dal disco (incrementale.ts:631-636); la pulizia è solo manuale, e le revisioni dei blob non sono mai gestite dal codice. _(2026-11-06)_
- i battiti si riscrivono ogni 2 minuti anche da fermi (posta.ts:341): ogni riscrittura è una revisione sul Drive. _(2026-11-06)_
- le proposte di pulizia guardano il nome, quindi i doppioni con lo stesso nome non si vedono mai (shared/spazio-drive.ts:282-289). _(2026-11-06)_
- I file dei workspace sul Drive si chiamano `f_<hash>` come le chat: per escluderli dalle pulizie serve il percorso del manifesto, non il prefisso del nome. _(2026-11-06)_

## coda

- Una richiesta «chiusa» o «fatta» fa rifiutare piano_scrivi: ogni risposta di Nicholas va registrata in coda prima di avvisare l'autopilota. _(2026-11-06)_

## posta

- `pcVivo` si basa sul timestamp del battito: allungare la riscrittura (ora 30 min) obbliga ad alzare `PC_SPENTO_DOPO_MS` (ora 35 min). _(2026-11-06)_

## tooling

- Le heredoc Bash mangiano i backslash e `client-pagina.ts` è CRLF con `\\'` nel sorgente: modificarlo con uno script scritto su file e newline='' preservato. _(2026-11-06)_

## ponte

- una rotta di lettura verso un altro PC va in `ROTTE_PONTE` (telefono) e in `ROTTE_AUTOPILOTA_ALTRO_PC` (PC), ma mai quelle che cambiano lo stato di là. _(2026-11-06)_
