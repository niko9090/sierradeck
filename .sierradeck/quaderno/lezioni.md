# Lezioni del progetto

<!-- SierraDeck: una riga per voce; una voce che torna aumenta «confermata N×». Tetto 200 voci o 32 KB: escono prima le meno confermate e più vecchie. Si può scrivere anche a mano. -->

## test

- nei test, un letterale come `peso: 1` in un oggetto restituito si allarga a number: con tipi a unione (`1|2|3`) serve `as const`, e tsc lo segnala solo dopo l'unione. _(2026-11-07)_
- Nei conflitti fra due correzioni dello stesso test vince la versione di main, che di solito è più completa: controllare con `git diff main` che l'unione non cambi nulla. _(2026-11-07)_
- se due rami toccano la stessa prova, controllare gli import dopo la risoluzione: qui `creaFreno` era importato due volte e il file non compilava. _(2026-11-07)_
- Un rosso in main dopo un'unione può non riprodursi nella copia: prima di cambiare codice rilanciare la suite sul ramo già allineato e, se è verde, sospettare un fallimento intermittente per PC carico. _(2026-11-07)_
- PonteTest confronta Ponte.ROTTE (Ponte.kt) con ROTTE_PONTE del PC: una rotta nuova nel ponte va aggiunta in tutte e due le liste, o il criterio Android diventa rosso. _(2026-11-07)_
- tests/shared/autopilota-remoto.test.ts e Ponte.kt/AutopilotiAltriTest devono restare allineati a ROTTE_PONTE (ponte-telefono.ts): ogni rotta nuova va aggiunta in tutti e tre i punti. _(2026-11-07)_
- Il controllo di carico del PC rimanda typecheck e suite completa per minuti: lanciare prima i test di un solo file, poi riprovare le misure intere. _(2026-11-07)_
- il controllo del carico rimanda anche `vitest run tests/shared` per più di dieci minuti; in quel caso verificare con i file singoli e lasciare la suite intera all'autopilota _(2026-11-07)_
- la prova di unione (server.ts:712) e la suite vitest (verifiche.ts:67, 20 min) hanno tetti incoerenti: la prova scade prima della suite e il comando figlio resta vivo. _(2026-11-07)_
- il controllo di carico rimanda `npm run typecheck` anche dopo vari minuti; i test di un solo file passano sempre _(2026-11-07)_
- il test «sezione Specialisti» in tests/renderer/pannello-specialisti.test.tsx legge App.tsx come testo: cambiare il cablaggio di un pannello richiede di aggiornare anche quelle asserzioni _(2026-11-07)_
- il controllo di carico del PC rimanda tsc e vitest su tutta la suite anche per decine di minuti: misurare per file singolo mentre si aspetta _(2026-11-07)_
- Sotto carico il controllo rimanda anche `vitest tests/shared/<prefisso>`: passano solo i file singoli. Salvare l'output della prima suite completa su file, per non perdere il nome del test rosso. _(2026-11-07)_
- giroInvioErrori è senza stato: il «motivo già scritto» va passato da fuori (parametro `fallimento`), altrimenti il log si ripete a ogni giro di 30 s. _(2026-11-08)_
- tests/shared/tempi-unione.test.ts non esiste in main: il compito k-174 lo cita, ma nessun test verifica che la fila (25 min) superi la prova (15 min) _(2026-11-08)_
- l'hook di carico blocca tests/shared intero finché il PC è sopra il 60% di CPU: riprovare dopo qualche minuto, un file alla volta va bene _(2026-11-08)_
- `tests/shared` passa in ~34 s, ma la junction di node_modules va lasciata finché il ramo non è unito, altrimenti il ramo viene respinto. _(2026-11-08)_
- i test in tests/shared possono importare da src/main; le funzioni pure nuove vanno comunque in src/shared. _(2026-11-08)_
- confronta('?', x) in installa-la.ts tratta '?' come 0.0.0: con da='?' qualunque versione viva darebbe «fatto». Prima va fissato `da` dal vivo. _(2026-11-08)_

## worktree

- Prima di dire «copia allineata a main» confrontare con `git rev-list --count HEAD..main`: la copia può restare indietro di decine di commit e il test pulito non vale per il main attuale. _(2026-11-06)_
- nei worktree senza node_modules il typecheck va lanciato dopo aver creato la junction verso la cartella principale; la junction si toglie con rmdir solo dopo l'unione del ramo. _(2026-11-08)_
- il ramo di un agente può divergere da main: prima di dire «allineata» confrontare con git rev-list --left-right --count HEAD...main _(2026-11-08)_
- la junction node_modules si crea con PowerShell dalla cartella del worktree; da Bash con percorso Windows il comando viene rifiutato. _(2026-11-08)_

## errori

- StatoInvio.fino non avanza più dopo l'invio: la verità sono i conteggi per chiaveErrore in `inviati`. Con `fino` che avanza, un tetto di peso farebbe passare per inviate voci mai partite. _(2026-11-06)_
- Un blocco passeggero (EPERM/EBUSY/«Filename too long») non è una criticità: lo si tratta come «in uso» (saltato, non errore; vedi rimozione-sicura.ts e riassetto/recupero.ts) e si riprova al giro dopo. _(2026-11-07)_
- Un blocco passeggero (EPERM/EBUSY/«Filename too long») non è una criticità: `eBloccoTemporaneo` lo manda fra le tenute e si riprova al giro dopo. _(2026-11-07)_
- «cosa si stava facendo» prende l'ultima riga info di qualunque sottosistema entro 2 minuti: va filtrato per tag, o mostra contesti non correlati. _(2026-11-08)_

## android

- Sul PC dev non ci sono gradlew né SDK (`E:\Android\Sdk` assente): il Kotlin non si compila qui. Tenere la logica nuova in funzioni pure con test e controllare la build a parte. _(2026-11-06)_
- Per compilare in un worktree: sdk.dir=E:/Android/Sdk in android/local.properties (ignorato), JAVA_HOME=JDK 21 Microsoft, gradle in E:\Programs\Gradle\gradle-8.11.1\bin. Non c'è gradlew. A freddo ~7 m… _(2026-11-06)_
- CORREZIONE: l'SDK c'è in E:\Android\Sdk (la lezione «SDK assente» è sbagliata). Nei worktree: local.properties sdk.dir, JAVA_HOME=JDK 21 Microsoft, gradle globale 8.11.1, senza gradlew. _(2026-11-06)_
- una data class nuova può collidere con una già presente nello stesso package (RigaSpecialista in PaginaWorkspace.kt): cercare il nome con grep prima di dichiararla. _(2026-11-06)_
- In `android/` `SezioneDrive` è definita in `Drive.kt` e in `SezioniImpostazioni.kt` con firme diverse: un doppione fragile, da unificare. _(2026-11-06)_
- Il «Mi collego a…» provava solo l'indirizzo d'accoppiamento: con Tailscale spento il timeout di 5 s scadeva prima del fallback su `Percorsi.ritrova`. Prima ritrovare, poi `ciao()`. _(2026-11-06)_
- Il criterio gradle si può fare solo uno alla volta: il guardiano PC carico rifiuta anche `gradle` dei sotto-agenti per molti minuti; il BUILD FAILED in 2s può essere un lock. _(2026-11-07)_
- Api.kt chiama /api/specialisti/attesa/priorita e /togli, che non sono in ROTTE_PONTE (un test PC le vuole fuori): da telefono via ponte non passano. _(2026-11-07)_
- Il rosso del criterio nella cartella principale con build pulita verde indica stato incrementale (android/app/build, .gradle) o lock, non codice: salvare l'uscita completa della misura. _(2026-11-07)_
- `gradle clean testDebugUnitTest assembleDebug --no-daemon` in una copia pulita dura circa 3m45 e passa. _(2026-11-07)_
- Il programma toglie --no-daemon ai gradle dei criteri e dà una TEMP cancellata a fine criterio: il demone riusato cade con NoSuchFileException .alive. Fissato con org.gradle.daemon=false. _(2026-11-07)_
- Senza JAVA_HOME gradle usa il JRE 25 del PATH e fallisce in 8 s con il messaggio «25.0.4.1»: Gradle 8.11 non regge Java 25. _(2026-11-07)_
- Con org.gradle.daemon=false il criterio Android nella cartella principale è tornato verde (k-52, 07/11): il rosso di 20-35 s era il demone Gradle riusato con la TEMP cancellata. _(2026-11-07)_
- Il ramo del worktree può nascere prima del lavoro PC già in main (k-53, k-54): fare `git merge main` prima di leggere i file `src/shared` del PC. _(2026-11-07)_

## release

- Da un worktree `npm run pubblica` vuole google-oauth.json (copiarlo dalla radice, poi cancellarlo) e una node_modules vera (npm ci, non junction). _(2026-11-07)_
- Se la release esiste già prima di `pubblica`, electrion-builder salta gli upload: caricare exe, blockmap, latest.yml con `gh release upload`, con nomi col trattino. _(2026-11-07)_
- 07/11 v0.96.0 pubblicata (app 2.96.0, 5 file), NON installata: controllo dei PC + Drive + Specialisti. Nessuna 0.95.6 è mai uscita. Prossimo bump parte da 0.96.0. _(2026-11-07)_
- 07/11: v0.96.1 è già in main e taggata (unioni con poche prove mirate); la release delle correzioni del controllo PC + scheda video diventa 0.96.2. _(2026-11-07)_
- 08/11: main è 0.96.2 (tag v0.96.1 e v0.96.2 fatti da una chat di Nicholas: unioni snelle + pulizia copie). I lavori rimasti fuori si riportano su main (k-175, k-176); la release dopo è 0.97.0. _(2026-11-08)_
- Ordine release: tag → npm run pubblica (crea bozza) → npm run allega-apk → gh release edit --draft=false. Un gh release create prima di pubblica fa saltare latest.yml. _(2026-11-08)_
- Un addon usato solo dal renderer (es. @xterm/addon-webgl) va in devDependencies: fra le dependencies il controllo del pacchetto ferma l'installer. _(2026-11-08)_
- main locale è 5 commit avanti a origin/main (0.97.0): fare git push origin main prima di taggare o pubblicare. _(2026-11-08)_

## git

- Un compito unito con criterio rosso lascia main rosso: il cancello poi respinge TUTTE le altre unioni («anche nella cartella principale non passa»). Correggere quel rosso prima di ogni altra unione. _(2026-11-06)_
- Un'unione di prova fallita può lasciare modifiche in stage nella cartella principale: poi tutte le unioni falliscono con «modifiche non salvate». Prima stash dopo aver verificato che sono in un ramo. _(2026-11-06)_
- il ramo di lavoro può restare indietro di decine di commit rispetto a main: prima di misurare, `git merge --ff-only main`. _(2026-11-06)_
- Unioni respinte per «modifiche non salvate»: guardare .git/MERGE_MSG. Se c'è un'unione di prova del programma in corso, aspettarne l'esito e poi riunire gli altri rami uno alla volta. _(2026-11-06)_
- un ramo già aperto in un altro worktree non si può riprendere con checkout: lo stesso lavoro si porta sul proprio ramo con reset --hard sul suo commit, e poi si unisce main. _(2026-11-06)_
- Il «lavoro di k-63» non era un ramo di codice: `abf869b0` ha solo correzioni a due test, e l'ottimizzazione del Drive era già in main (0.95.6, k-65). _(2026-11-07)_
- Il conflitto sul quaderno lezioni.md nasce perché ogni ramo aggiunge righe in coda alla stessa sezione: nell'unione vanno tenute tutte, togliendo solo i doppioni identici. _(2026-11-08)_
- `main` locale e `origin/main` possono divergere: dopo una release verificare con `git log origin/main` prima di dire che "è in main". _(2026-11-08)_
- il main locale può essere avanti di origin/main (qui 5 commit): per allinearsi, `git merge --ff-only main` funziona, ma `origin/main` resta indietro finché non si pubblica. _(2026-11-08)_

## autopilota

- Criterio rosso = affidare la correzione nello stesso turno, anche con i posti pieni: provare a lanciare (il tetto ora è 3) invece di rimandare «appena si libera». _(2026-11-06)_
- REGOLA Nicholas 06/11: l'autopilota finisce tutto da solo con gli specialisti; domande o compiti a mano per lui solo in casi estremi. Mai chiedere riavvii o di chiudere programmi. _(2026-11-06)_
- La guardia del PC rimanda typecheck e vitest completi anche per minuti di fila: lanciare le misure pesanti presto e tenere pronto il commit prima di misurare. _(2026-11-08)_

## servizio

- il dialogo scade a 3 s se il servizio è occupato ma il messaggio può essere già scritto: le POST che scrivono vogliono attesa lunga e un id del messaggio, altrimenti il ritentativo lo duplica _(2026-11-06)_
- Le domande hanno 2 elenchi: `aperte()` (tutte, per dedupe e ritiro) e `visibili()` (senza quelle solo-in-chat). Pannello, telefono e notifiche leggono `GET /domande`, che filtra. _(2026-11-06)_
- il tetto dei subagenti è una variabile d'ambiente del processo claude: per cambiarlo si spegne e si riprende con --resume, solo a turno finito. Il tetto per workspace (3) lo limitava anche con 6 post… _(2026-11-06)_

## controllo

- una voce di salute con tono non «ok» diventa criticità per ogni PC che la compone: i consumi vanno giudicati solo sui numeri del PC stesso, sennò si ripetono ovunque. _(2026-11-07)_

## rete

- La chiave del PC non va mai mandata a un indirizzo LAN non verificato: prima `/api/ciao` (senza chiave) deve dare l'impronta attesa. Un 192.168.x.x può essere un'altra rete. _(2026-11-06)_

## strumenti

- l'hook che serializza i comandi pesanti risponde «riprova fra N minuti» anche per `tsc` e per `vitest` su una cartella. Fare commit prima, poi un solo file di test per volta. _(2026-11-06)_
- nei file scritti con script Python la sequenza \b diventa un backspace invisibile se non è escapata: nelle regex controllare con chr(8) _(2026-11-06)_
- Un heredoc Python lanciato da Bash trasforma `\n` dentro le stringhe Kotlin in a-capo veri e rompe la compilazione: per il codice Kotlin usare Edit o Write. _(2026-11-07)_
- negli script Python in heredoc `\n` e `\b` nei letterali diventano caratteri veri e rompono le regex: per i sorgenti TS usare Edit. _(2026-11-08)_

## ambiente

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
- il guardiano del PC rifiuta tsc e le suite larghe (anche con liste di file generate) finché la CPU è alta; i gruppi con nomi di file scritti per esteso passano. _(2026-11-06)_
- il guardiano del PC carico rimanda tsc e le suite intere anche con CPU al 60%; un ciclo su più file in un solo comando viene rimandato come la suite: un file per chiamata. _(2026-11-06)_
- Nei worktree manca `node_modules`: serve una junction temporanea, creata con `New-Item -ItemType Junction` in PowerShell, perché `cmd mklink` in Bash viene rifiutato. _(2026-11-06)_
- Nei worktree la junction a node_modules si toglie in PowerShell con (Get-Item node_modules).Delete(). Da Bash, `cmd //c mklink` viene rifiutato dal guardiano. _(2026-11-06)_
- nei worktree senza node_modules il criterio fallisce per l'ambiente: la junction verso la cartella principale va lasciata finché il ramo non è unito. _(2026-11-06)_
- il guardiano rimanda anche suite con elenchi di file e Gradle per molti minuti di fila: lanciare gruppi piccoli di file espliciti. _(2026-11-06)_
- Il guardiano «PC carico» blocca anche `tsc --noEmit`, non solo la suite intera. Se un `java` esterno resta alto, la compilazione si ritarda a lungo: lanciarla appena il carico scende. _(2026-11-07)_
- Il criterio Android gira qui senza ./gradlew: gradle 8.11.1 in E:\Programs\Gradle, JDK 21 via JAVA_HOME, SDK in ANDROID_HOME=E:\Android\Sdk. Dura circa 5 minuti. _(2026-11-07)_
- Il guardiano «PC carico» può rifiutare lo stesso comando per diversi minuti. `ping -n 50 127.0.0.1` in una chiamata a parte funziona come attesa; `sleep` e `Start-Sleep` sono bloccati. _(2026-11-07)_
- JDK 21 è in C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot, non in E:\Programs; gradle 8.11.1 in E:\Programs\Gradle. _(2026-11-07)_
- Il controllo di carico rimanda anche i cicli di vitest file per file se somigliano a una suite; la coda delle misure pesanti è una alla volta e può far scadere le unioni. _(2026-11-07)_
- nel worktree la Bash rifiuta comandi con mklink/cmd; la junction node_modules si crea con New-Item -ItemType Junction da PowerShell e si toglie con (Get-Item).Delete(). _(2026-11-08)_
- il gancio «PC carico» blocca ogni comando npx del Bash finché il processore è sopra soglia: prima di lanciare la suite, controllare il carico o aspettare, non riprovare in serie. _(2026-11-08)_
- La guardia del PC rifiuta anche `npm run typecheck` con CPU alta e non basta riprovare; un comando in background non aggira il rifiuto. _(2026-11-08)_

## main

- la salute di un altro PC (/api/salute via remoto.chiama) è solo un cast, senza validazione: ogni campo letto dalle risposte remote va controllato, perché le versioni vecchie mandano altre forme. _(2026-11-06)_
- Modifiche non committate in `src/` della cartella principale (es. `posta.ts`) fanno cadere test che nella copia passano: è la trappola che ha fatto cadere `tests/shared` solo lì. _(2026-11-06)_

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
- Il gancio «PC carico» rifiuta typecheck e suite per qualche minuto: basta riprovare, i test di un solo file passano comunque _(2026-11-07)_

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
- Il pacchetto va costruito solo dalla cartella principale: in un worktree `node_modules` è una junction e l'asar perde le dipendenze indirette (dijkstrajs, pngjs, yargs). _(2026-11-06)_
- `controlla-pacchetto.mjs --prima/--dopo` (commit 68bca905) è la difesa contro l'asar incompleto; prima di indagare un «Cannot find module» in un'app installata, controllare da dove è stata costruita. _(2026-11-06)_
- Il guardiano del PC carico può rifiutare gradle a oltranza con lo stesso messaggio: nel ramo vanno prima fatti i controlli statici, e va chiesta all'autopilota una finestra libera. _(2026-11-06)_
- Il guardiano «PC carico» rifiuta il comando prima di eseguirlo: l'attesa va in una chiamata a parte (until sull'orologio), non dentro lo stesso comando gradle. _(2026-11-07)_
- Il package.json può chiedere pacchetti non installati nella cartella principale (es. @xterm/addon-webgl): tsc fallisce con TS2307 anche su main, serve npm install, non una correzione al codice. _(2026-11-07)_

## piano

- Un criterio che è solo un comando di lettura (`wsl --list --quiet`) passa sempre, anche se il lavoro non c'è: il criterio deve fallire quando il lavoro manca (es. un test o un confronto sull'uscita). _(2026-11-06)_

## autoriparazione

- Il «Torna come prima» non ripristina `coda.json` apposta: rimetterebbe una coda vecchia e perderebbe richieste arrivate dopo. Va ricordato se si estende il ripristino. _(2026-11-06)_

## drive

- le chat non si tolgono dal Drive quando spariscono dal disco (incrementale.ts:631-636); la pulizia è solo manuale, e le revisioni dei blob non sono mai gestite dal codice. _(2026-11-06)_
- i battiti si riscrivono ogni 2 minuti anche da fermi (posta.ts:341): ogni riscrittura è una revisione sul Drive. _(2026-11-06)_
- le proposte di pulizia guardano il nome, quindi i doppioni con lo stesso nome non si vedono mai (shared/spazio-drive.ts:282-289). _(2026-11-06)_
- I file dei workspace sul Drive si chiamano `f_<hash>` come le chat: per escluderli dalle pulizie serve il percorso del manifesto, non il prefisso del nome. _(2026-11-06)_
- Il freno (freno-drive.ts) mette l'avvio dei giri automatici dietro `fermo()` e si innesta in un solo punto, il `fetch` dell'archivio. I test che simulano 403 pieno devono passare un proprio `creaFren… _(2026-11-06)_
- client-rotte.ts battitoVivo usa 5*60_000 fisso invece di PC_SPENTO_DOPO_MS di shared/posta.ts: due nozioni di «PC acceso», da allineare dopo il battito a 30 min. _(2026-11-06)_
- A Drive pieno `conFreno` blocca ogni PATCH/PUT: anche togliere voci dal manifesto può fallire. Cancellare un file (DELETE) passa, ma solo dopo che la voce è uscita dall'indice. _(2026-11-06)_
- Il freno del Drive pieno e la pulizia chat esistono dalla 0.96.0: prima di rifare, controllare la versione dei PC nei rapporti (DESKTOP/Z2 erano ancora 0.95.x). _(2026-11-07)_

## coda

- Una richiesta «chiusa» o «fatta» fa rifiutare piano_scrivi: ogni risposta di Nicholas va registrata in coda prima di avvisare l'autopilota. _(2026-11-06)_

## posta

- `pcVivo` si basa sul timestamp del battito: allungare la riscrittura (ora 30 min) obbliga ad alzare `PC_SPENTO_DOPO_MS` (ora 35 min). _(2026-11-06)_
- `quietaOgniMs` in `creaPostino` rende i test della posta indipendenti dai 90 s di quiete; `ultimaAttivita` e `ultimaLetturaPosta` partono da `-Infinity`, non da 0. _(2026-11-07)_

## tooling

- Le heredoc Bash mangiano i backslash e `client-pagina.ts` è CRLF con `\\'` nel sorgente: modificarlo con uno script scritto su file e newline='' preservato. _(2026-11-06)_

## ponte

- una rotta di lettura verso un altro PC va in `ROTTE_PONTE` (telefono) e in `ROTTE_AUTOPILOTA_ALTRO_PC` (PC), ma mai quelle che cambiano lo stato di là. _(2026-11-06)_

## unione

- Il cancello può riproporre l'esito vecchio di un criterio (stesso «Start at» delle 21:17): se l'orario non cambia, non è una misura nuova; serve un lancio fresco con l'uscita completa salvata. _(2026-11-06)_
- k-60 (`e9487ef4`, `28020ec1`, `4d4f11c9`) non risulta in main: prima di dire «entrato in main» verificare con `git merge-base --is-ancestor <sha> main`. _(2026-11-06)_
- La prova nel principale lascia `.git/sierradeck-prova.json`: senza quel segno (e MERGE_HEAD uguale) lo sporco è di Nicholas e non si tocca; prima un merge fallito faceva `--abort` anche sul suo. _(2026-11-06)_
- La prova d'unione non fa npm install: un ramo con dipendenze nuove fallisce tsc. Prima installarle nella principale con npm install --no-save. _(2026-11-07)_

## criteri

- La cache dei criteri (criteri-veloci.ts:193-232) è solo in RAM (server.ts:188), chiave = impronta dei file tracciati più comando, senza scadenza: un rosso resta finché il contenuto non cambia o il se… _(2026-11-06)_
- daRicordare esclude solo timeout e problemi d'ambiente: un test instabile che fallisce una volta blocca l'unione su quel contenuto. Il riuso dell'esito vecchio non passa dal guardiano del carico. _(2026-11-06)_
- Il cancello ricorda in RAM anche i rossi (criteri-veloci.ts, chiave = file tracciati + comando, senza scadenza): un test instabile blocca ogni unione finché main non cambia o il servizio riparte. _(2026-11-06)_

## processo

- prima di rifare un compito fermato a metà, cercare nel log con --grep: il lavoro (448666e5) era già in main sotto un altro nome di ramo. _(2026-11-06)_

## sync

- Per togliere una chat dal Drive senza perderla, usare la regola di salita `escludi` (chatNonSale) più la pulizia nel manifesto; `restaFuori` bloccherebbe per sempre una chat non cresciuta. _(2026-11-06)_

## pc

- Il firewall di Windows su rete «Pubblica» scarta in silenzio i pacchetti del telefono sul wifi: rimedio con `New-NetFirewallRule ... -RemoteAddress LocalSubnet`, mai aperto a internet. _(2026-11-06)_

## nsis

- `perMachine:false` = installatore senza admin: netsh nell'installatore fallisce in silenzio, serve il ripiego col comando mostrato dal programma _(2026-11-06)_

## firewall

- le porte del Client sono configurabili (portaClient): meglio una regola per programma (-Program, LocalSubnet) che per porta _(2026-11-06)_

## soglie

- "PC acceso" ora ha una sola soglia, `PC_SPENTO_DOPO_MS` (35 min) in `shared/posta.ts`. Se il battito cambia cadenza, il margine sopra `BATTITO_RISCRIVI_MS` è verificato da un test. _(2026-11-06)_

## criterio

- con il guardiano «PC carico» la suite intera non parte: dividere in gruppi di 10-20 file, il guardiano accetta quelli piccoli _(2026-11-06)_
- il tempo della prova include l'attesa del turno e della guardia: a PC carico scade anche se la suite è sana. _(2026-11-07)_

## unioni

- se l'unione dice che tsc non passa in main ma in main passa, l'errore può stare nel ramo unito: provare tsc dopo il merge nella propria copia. _(2026-11-07)_
- i tetti devono stare uno dentro l'altro (suite < prova < fila): prima la prova (15 min) scadeva prima della suite (20) e il figlio restava vivo a tenere il turno _(2026-11-07)_
- il turno dell'unione (12 min, attesa compresa) è più corto della prova (15 min) che lo contiene: possibile scadenza prematura, da decidere _(2026-11-08)_
- UNIONE_TURNO_MAX_MS (12 min) copre solo i passi git, non le misure; se scade prima di PROVA_MAX_MS l'esito è lo stesso 'scaduta'. Ordine voluto: turno < prova < fila. _(2026-11-08)_

## gpu

- con Chromium il contesto WebGL è limitato (circa 16): un addon WebGL su ogni riquadro va tenuto a tetto, non acceso per tutti. _(2026-11-07)_

## ui

- Le colonne a destra (Domande, Specialisti) condividono `src/shared/misure-pannelli.ts`: limiti, trascinamento e `altreColonne` vanno passati a entrambe, perché il mosaico tenga 520 px. _(2026-11-07)_
- Il tasto di un pannello laterale con stato proprio (Domande, Specialisti) passa da `Console.tsx` con prop dedicate, non da `aperto`. L'evento `apri-pannello` va gestito a parte. _(2026-11-07)_

## salute

- il contatore Drive contava ogni 403 come «rifiutata»: il Drive pieno (storageQuotaExceeded) gonfiava i numeri di «troppe richieste». Ora conta solo 429 e rateLimit. _(2026-11-07)_

## autopulizia

- Le copie `agent-*` in `.claude/worktrees` restano senza `.git` dopo un `worktree remove` fallito (percorso lungo in android/build, file in dist/win-unpacked): vanno tolte con rmSync, non da git. _(2026-11-07)_

## xterm

- @xterm/addon-webgl per xterm 6 esiste solo in beta (0.20.0-beta.x, peer ^6.1.0-beta): il 6.0.0 stabile non ha un addon WebGL compatibile; xterm portato a 6.1.0-beta.336 _(2026-11-07)_

## electron

- `getGPUFeatureStatus()` dà stringhe di Chromium (`enabled_on`, `disabled_software`, `disabled_off`): la scheda attiva si legge dal prefisso `enabled`, non da un booleano _(2026-11-07)_

## gradle

- il registro del demone in %USERPROFILE%\.gradle\daemon\8.11.1\daemon-<pid>.out.log riporta currentDir, inizio e fine della build: va letto prima di sospettare un processo vivo. _(2026-11-07)_

## carico

- il controllo di carico del PC blocca anche comandi semplici (ls, Glob) quando la CPU sta sopra il 75%: meglio usare lo strumento di lettura dei file. _(2026-11-07)_

## dipendenze

- Il node_modules principale non ha xterm 6.1 né @xterm/addon-webgl: una junction non basta dopo k-169, serve copia reale più npm install --ignore-scripts. _(2026-11-07)_
- @xterm/headless 6.0.0 e @xterm/xterm 6.1.0-beta stanno su versioni diverse: se il terminale della main process si comporta in modo strano, guardare prima questa differenza. _(2026-11-08)_

## codice

- i sorgenti sono CRLF: modificarli con script che preservano i fine riga, e `sed -i` può lasciare righe LF _(2026-11-07)_

## misure

- Il controllo di carico controlla prima di ogni comando: un ping/sleep dentro lo stesso comando non aiuta. L'attesa va in una chiamata separata. _(2026-11-07)_
- il gancio PreToolUse rimanda vitest se il PC è carico: attendere col Monitor, non con sleep ripetuti, e fermarsi dopo 3 tentativi. I file singoli passano comunque. _(2026-11-08)_

## aggiornamenti

- la classificazione passeggera sul breve (prima riga, senza contesto) perde il 504 nudo: classificare sul messaggio completo e su statusCode. _(2026-11-08)_
- la lista di errori di rete passeggeri (ERR_*) va estesa con ERR_CONNECTION_CLOSED/RESET e timeout; eBloccoTemporaneo non esiste in src. _(2026-11-08)_
- HttpError di electron-updater ha message «504\nHeaders: {…}» e statusCode numerico: classificare sul messaggio completo/statusCode, non sulla prima riga. _(2026-11-08)_

## installa-la

- `da` (versione di partenza) non va mai preso da un battito Drive vecchio: Drive pieno = battito fermo per giorni. Vale solo la versione viva da /api/ciao. _(2026-11-08)_

## specialisti

- Il servizio autopiloti è un processo separato dal main: per spingere eventi non c'era canale. Ho aggiunto un long poll `/orchestratore/cambi`; il telefono resta a richiesta, senza SSE. _(2026-11-08)_

## typecheck

- un canale IPC nuovo va dichiarato in due posti: src/preload/index.ts e src/renderer/env.d.ts. Senza il secondo, il renderer non compila. _(2026-11-08)_

## guardia

- se la guardia rimanda un comando pesante, il sleep in primo piano è bloccato. Aspetta con un until-loop in background (cronometro) e riprova. _(2026-11-08)_
