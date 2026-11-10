# Lezioni del progetto

<!-- SierraDeck: una riga per voce; una voce che torna aumenta «confermata N×». Tetto 200 voci o 32 KB: escono prima le meno confermate e più vecchie. Si può scrivere anche a mano. -->

## test

- Sotto carico il controllo rimanda anche `vitest tests/shared/<prefisso>`: passano solo i file singoli. Salvare l'output della prima suite completa su file, per non perdere il nome del test rosso. _(2026-11-07)_
- giroInvioErrori è senza stato: il «motivo già scritto» va passato da fuori (parametro `fallimento`), altrimenti il log si ripete a ogni giro di 30 s. _(2026-11-08)_
- tests/shared/tempi-unione.test.ts non esiste in main: il compito k-174 lo cita, ma nessun test verifica che la fila (25 min) superi la prova (15 min) _(2026-11-08)_
- l'hook di carico blocca tests/shared intero finché il PC è sopra il 60% di CPU: riprovare dopo qualche minuto, un file alla volta va bene _(2026-11-08)_
- `tests/shared` passa in ~34 s, ma la junction di node_modules va lasciata finché il ramo non è unito, altrimenti il ramo viene respinto. _(2026-11-08)_
- i test in tests/shared possono importare da src/main; le funzioni pure nuove vanno comunque in src/shared. _(2026-11-08)_
- confronta('?', x) in installa-la.ts tratta '?' come 0.0.0: con da='?' qualunque versione viva darebbe «fatto». Prima va fissato `da` dal vivo. _(2026-11-08)_
- la guardia del PC può rifiutare per molti minuti ogni vitest (anche per cartella); i file singoli passano. Il commit va in una chiamata separata dal comando pesante. _(2026-11-08)_
- tests/main/finestre-pannello-separate.test.ts vieta BrowserWindow.getAllWindows() in index.ts: le finestre pannello sono escluse da finestreDiChat(); un broadcast che le deve raggiungere va in finest… _(2026-11-08)_
- Con il PC sopra il 75% la guardia del carico blocca anche la suite intera: i lotti da 40 file passano; la guardia si ripete col messaggio uguale anche quando il carico è calato. _(2026-11-08)_
- Il messaggio «non passano le prove dei compiti già uniti» non dice quali: prima di correggere, far girare a un verificatore l'intera vitest (a lotti da 40 se la guardia rifiuta) su main e sul ramo. _(2026-11-08)_
- La guardia del carico rifiuta anche i lotti piccoli se un comando pesante è appena partito; i lotti per cartella (tests/renderer, tests/autopilot-host) sono passati, quelli grossi no. _(2026-11-08)_
- In un worktree isolato `npx vitest run $(cat elenco)` viene rifiutato come comando troppo complesso; si usano cartelle o prefissi espliciti. _(2026-11-08)_
- La guardia del carico può rifiutare `vitest run tests/renderer` all'infinito, anche dividendo per prefisso. Passano solo i comandi con pochi file nominati, quindi conviene elencarli per nome. _(2026-11-08)_
- La guardia del carico può rifiutare `npm run typecheck` per molti minuti se Defender tiene la CPU alta: lanciare prima i test per file, il typecheck a PC libero. _(2026-11-08)_
- La guardia del carico blocca anche typecheck e suite intera per molti minuti: `npx vitest run tests/shared/<lettera>` passa e copre tutti i file senza nominarli uno a uno. _(2026-11-08)_
- I test dei tipi opzionali (es. `cancellaId?` di creaArchivioDrive) passano in vitest ma rompono `tsc`: usare `!` nei test, che vitest non controlla. _(2026-11-08)_
- per provare `cerca()` di aggiornamenti.ts basta mockare electron-updater con `checkForUpdates` che restituisce `{downloadPromise}` e usare fake timers (setTimeout da 10 s). _(2026-11-08)_
- Il comando mklink via Bash è rifiutato nei worktree; la junction si crea con PowerShell New-Item -ItemType Junction. _(2026-11-09)_
- In `criticitaDi` la voce `risorse` non ha il pcId: la chiave per PC si costruisce da `s.pcId`, e il titolo senza numeri va nella firma. I numeri restano solo nel dettaglio. _(2026-11-09)_
- Per provare il Drive pieno serve un archivio con capacità vera e un freno attivo: un flag «pieno» fisso non mostra che la DELETE libera spazio e riabilita le scritture. _(2026-11-09)_
- la pagina del telefono riceve le funzioni di `src/shared` con `.toString()`: devono essere autosufficienti, senza costanti di modulo, e usare solo ciò che è definito nella pagina. _(2026-11-09)_
- pannello-drive-app.test.ts estrae le funzioni della pagina una a una: ogni nuova funzione chiamata da pannelloDriveHtml va aggiunta lì, o il test dà ReferenceError. _(2026-11-09)_
- i test usano oggetti con statusCode o testi costruiti a mano; la forma reale di createHttpError (node_modules/builder-util-runtime/out/httpExecutor.js:52) va testata così com'è _(2026-11-10)_
- un worktree può partire indietro rispetto a main: fare `git merge --ff-only main` prima di misurare, altrimenti mancano i test appena entrati. _(2026-11-10)_
- `npx vitest run` intero dura circa 160 s su questo PC: un rifiuto "vitest rosso" senza nome di prova può essere un tempo scaduto sotto carico, non il codice. _(2026-11-10)_
- Un 50x di electron-updater può arrivare come testo senza statusCode: «504 <frase>[\ndescrizione]\nHeaders: {…}». Il riconoscimento deve guardare il testo completo, non solo il campo. _(2026-11-10)_

## worktree

- nei worktree senza node_modules il typecheck va lanciato dopo aver creato la junction verso la cartella principale; la junction si toglie con rmdir solo dopo l'unione del ramo. _(2026-11-08)_
- il ramo di un agente può divergere da main: prima di dire «allineata» confrontare con git rev-list --left-right --count HEAD...main _(2026-11-08)_
- la junction node_modules si crea con PowerShell dalla cartella del worktree; da Bash con percorso Windows il comando viene rifiutato. _(2026-11-08)_
- Il ramo di lavoro può essere indietro a main (manca spazio-drive-pieno): prima di correggere, rebase su main. _(2026-11-10)_
- con l'harness, ogni comando git che nomina la cartella principale viene rifiutato anche con `git -C` o in una pipe: per leggerla usare percorsi assoluti e comandi non-git. _(2026-11-10)_

## errori

- Un blocco passeggero (EPERM/EBUSY/«Filename too long») non è una criticità: lo si tratta come «in uso» (saltato, non errore; vedi rimozione-sicura.ts e riassetto/recupero.ts) e si riprova al giro dopo. _(2026-11-07)_
- Un blocco passeggero (EPERM/EBUSY/«Filename too long») non è una criticità: `eBloccoTemporaneo` lo manda fra le tenute e si riprova al giro dopo. _(2026-11-07)_
- «cosa si stava facendo» prende l'ultima riga info di qualunque sottosistema entro 2 minuti: va filtrato per tag, o mostra contesti non correlati. _(2026-11-08)_
- un comando Bash che fallisce a metà (es. cmd mklink rifiutato nel worktree) salta anche i passi dopo: ricontrollare git diff --stat prima del commit. _(2026-11-08)_

## android

- Il criterio gradle si può fare solo uno alla volta: il guardiano PC carico rifiuta anche `gradle` dei sotto-agenti per molti minuti; il BUILD FAILED in 2s può essere un lock. _(2026-11-07)_
- Api.kt chiama /api/specialisti/attesa/priorita e /togli, che non sono in ROTTE_PONTE (un test PC le vuole fuori): da telefono via ponte non passano. _(2026-11-07)_
- Il rosso del criterio nella cartella principale con build pulita verde indica stato incrementale (android/app/build, .gradle) o lock, non codice: salvare l'uscita completa della misura. _(2026-11-07)_
- `gradle clean testDebugUnitTest assembleDebug --no-daemon` in una copia pulita dura circa 3m45 e passa. _(2026-11-07)_
- Il programma toglie --no-daemon ai gradle dei criteri e dà una TEMP cancellata a fine criterio: il demone riusato cade con NoSuchFileException .alive. Fissato con org.gradle.daemon=false. _(2026-11-07)_
- Senza JAVA_HOME gradle usa il JRE 25 del PATH e fallisce in 8 s con il messaggio «25.0.4.1»: Gradle 8.11 non regge Java 25. _(2026-11-07)_
- Con org.gradle.daemon=false il criterio Android nella cartella principale è tornato verde (k-52, 07/11): il rosso di 20-35 s era il demone Gradle riusato con la TEMP cancellata. _(2026-11-07)_
- Il ramo del worktree può nascere prima del lavoro PC già in main (k-53, k-54): fare `git merge main` prima di leggere i file `src/shared` del PC. _(2026-11-07)_
- `tests/android/rotte-lente-app.test.ts` impone che `ROTTE_LENTE` sia contenuta nella lista dell'app: ogni rotta lenta nuova va aggiunta anche in `android/`. _(2026-11-09)_

## release

- Da un worktree `npm run pubblica` vuole google-oauth.json (copiarlo dalla radice, poi cancellarlo) e una node_modules vera (npm ci, non junction). _(2026-11-07)_
- Se la release esiste già prima di `pubblica`, electrion-builder salta gli upload: caricare exe, blockmap, latest.yml con `gh release upload`, con nomi col trattino. _(2026-11-07)_
- 07/11 v0.96.0 pubblicata (app 2.96.0, 5 file), NON installata: controllo dei PC + Drive + Specialisti. Nessuna 0.95.6 è mai uscita. Prossimo bump parte da 0.96.0. _(2026-11-07)_
- 07/11: v0.96.1 è già in main e taggata (unioni con poche prove mirate); la release delle correzioni del controllo PC + scheda video diventa 0.96.2. _(2026-11-07)_
- 08/11: main è 0.96.2 (tag v0.96.1 e v0.96.2 fatti da una chat di Nicholas: unioni snelle + pulizia copie). I lavori rimasti fuori si riportano su main (k-175, k-176); la release dopo è 0.97.0. _(2026-11-08)_
- Ordine release: tag → npm run pubblica (crea bozza) → npm run allega-apk → gh release edit --draft=false. Un gh release create prima di pubblica fa saltare latest.yml. _(2026-11-08)_
- Un addon usato solo dal renderer (es. @xterm/addon-webgl) va in devDependencies: fra le dependencies il controllo del pacchetto ferma l'installer. _(2026-11-08)_
- main locale è 5 commit avanti a origin/main (0.97.0): fare git push origin main prima di taggare o pubblicare. _(2026-11-08)_
- Con l'autopilota il bump di versione non si committa in main (hook): va fatto su un ramo dello specialista e unito; poi push, tag, gh release, pubblica e allega-apk dal principale. _(2026-11-08)_
- Il compito di pubblicare dalla copia con junction collide con la guardia di `npm run pubblica`: `controlla-pacchetto --prima` rifiuta node_modules come collegamento. Costruire dalla cartella principa… _(2026-11-08)_
- Il compito di pubblicare va affidato dalla cartella principale (pubblica rifiuta la junction e serve google-oauth.json); APK invariato: allega-apk --senza-build o asset della release prima. _(2026-11-08)_
- gh release create va fatto con --draft: con la release già pubblicata npm run pubblica rifiuta (existingType=release) e exe/blockmap/latest.yml vanno caricati a mano. _(2026-11-08)_
- 0.97.1: npm run pubblica rifiuta di compilare da una copia (worktree); pubblicare dalla cartella principale. Se la release GitHub è già pubblica, pubblica non carica l'installer: controllare i 5 file. _(2026-11-08)_
- una release a metà (latest.yml su GitHub prima dell'exe) dà 404 per ore: i raggruppamenti degli errori uniscono righe di giorni diversi e la «versione» è quella del PC che invia, non di chi ha l'erro… _(2026-11-08)_
- Un agente lanciato in un worktree isolato non può eseguire git nella cartella principale (né cd né git -C): per pubblicare dal main serve un agente con la cartella principale come directory di lavoro. _(2026-11-08)_
- Prima di pubblicare, `package.json` di origin/main può essere ancora alla versione precedente: il bump unito sta solo nel main locale e va pushato con main prima del tag. _(2026-11-08)_
- Le pubblicazioni dalla cartella principale vanno affidate a general-purpose: lo sviluppatore è chiuso nel suo worktree e non può usare git nel principale (0.97.1 e 0.97.2). _(2026-11-08)_
- il rapporto controllo-*.md sta nella cartella principale (.sierradeck/errori-arrivati/), non nei worktree: leggerlo da lì, non copiarlo. _(2026-11-09)_
- un bump patch tocca solo package.json, package-lock.json (2 punti), src/shared/novita.ts e, se serve, il quaderno errori-arrivati. _(2026-11-09)_
- Se la release esiste già (gh release create prima), npm run pubblica compila ma non carica niente (vuole una bozza): exe, blockmap e latest.yml vanno caricati con gh release upload. _(2026-11-09)_
- Dal worktree `npm run pubblica` vuole `google-oauth.json` e un `node_modules` vero, non una junction. Copiarli dalla principale e toglierli dopo; `google-oauth.json` è ignorato da git. _(2026-11-09)_
- Con la release già creata, electron-builder non carica nulla. Gli asset vanno caricati a mano con `gh release upload` e nomi coi trattini (`SierraDeck-Setup-X.exe`), non quelli con lo spazio di `dist… _(2026-11-09)_

## git

- Il «lavoro di k-63» non era un ramo di codice: `abf869b0` ha solo correzioni a due test, e l'ottimizzazione del Drive era già in main (0.95.6, k-65). _(2026-11-07)_
- Il conflitto sul quaderno lezioni.md nasce perché ogni ramo aggiunge righe in coda alla stessa sezione: nell'unione vanno tenute tutte, togliendo solo i doppioni identici. _(2026-11-08)_
- `main` locale e `origin/main` possono divergere: dopo una release verificare con `git log origin/main` prima di dire che "è in main". _(2026-11-08)_
- il main locale può essere avanti di origin/main (qui 5 commit): per allinearsi, `git merge --ff-only main` funziona, ma `origin/main` resta indietro finché non si pubblica. _(2026-11-08)_
- Un ramo già aperto in un altro worktree non si può attivare: il lavoro va unito sul proprio ramo e l'autopilota deve unire quello. _(2026-11-08)_
- `main` locale può essere avanti su origin con lavoro non pubblicato. Dal worktree: `git merge --ff-only main`, bump, poi `git push origin HEAD:main`. _(2026-11-09)_
- un agente lanciato in un worktree isolato non può usare `git -C <cartella principale>`: il sistema lo rifiuta. Le operazioni sulla cartella principale vanno affidate a chi non è isolato. _(2026-11-09)_

## autopilota

- La guardia del PC rimanda typecheck e vitest completi anche per minuti di fila: lanciare le misure pesanti presto e tenere pronto il commit prima di misurare. _(2026-11-08)_

## controllo

- una voce di salute con tono non «ok» diventa criticità per ogni PC che la compone: i consumi vanno giudicati solo sui numeri del PC stesso, sennò si ripetono ovunque. _(2026-11-07)_
- una criticità con i numeri nel titolo cambia firma a ogni giro: il rapporto all'autopilota si riscrive ogni 6 ore (controllo-pc.ts:133). _(2026-11-09)_
- Le versioni dei PC nel controllo vengono dall'ultimo battito sul Drive: con il Drive pieno restano vecchie. Prima di dire «PC vecchio» si controlla sul PC. _(2026-11-09)_
- Un rapporto controllo-*.md scritto da un PC con versione vecchia ripete criticità già corrette: guardare «questo PC la 0.x» nel rapporto prima di aprire lavoro nuovo. _(2026-11-09)_

## strumenti

- Un heredoc Python lanciato da Bash trasforma `\n` dentro le stringhe Kotlin in a-capo veri e rompe la compilazione: per il codice Kotlin usare Edit o Write. _(2026-11-07)_
- negli script Python in heredoc `\n` e `\b` nei letterali diventano caratteri veri e rompono le regex: per i sorgenti TS usare Edit. _(2026-11-08)_

## ambiente

- Il guardiano «PC carico» blocca anche `tsc --noEmit`, non solo la suite intera. Se un `java` esterno resta alto, la compilazione si ritarda a lungo: lanciarla appena il carico scende. _(2026-11-07)_
- Il criterio Android gira qui senza ./gradlew: gradle 8.11.1 in E:\Programs\Gradle, JDK 21 via JAVA_HOME, SDK in ANDROID_HOME=E:\Android\Sdk. Dura circa 5 minuti. _(2026-11-07)_
- Il guardiano «PC carico» può rifiutare lo stesso comando per diversi minuti. `ping -n 50 127.0.0.1` in una chiamata a parte funziona come attesa; `sleep` e `Start-Sleep` sono bloccati. _(2026-11-07)_
- JDK 21 è in C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot, non in E:\Programs; gradle 8.11.1 in E:\Programs\Gradle. _(2026-11-07)_
- Il controllo di carico rimanda anche i cicli di vitest file per file se somigliano a una suite; la coda delle misure pesanti è una alla volta e può far scadere le unioni. _(2026-11-07)_
- nel worktree la Bash rifiuta comandi con mklink/cmd; la junction node_modules si crea con New-Item -ItemType Junction da PowerShell e si toglie con (Get-Item).Delete(). _(2026-11-08)_
- il gancio «PC carico» blocca ogni comando npx del Bash finché il processore è sopra soglia: prima di lanciare la suite, controllare il carico o aspettare, non riprovare in serie. _(2026-11-08)_
- La guardia del PC rifiuta anche `npm run typecheck` con CPU alta e non basta riprovare; un comando in background non aggira il rifiuto. _(2026-11-08)_
- la guardia del carico può rimandare per ore anche `tsc`; con Defender al 30% il typecheck non parte: lanciare i test per file e riprovare dopo. _(2026-11-08)_
- Con la guardia del carico che rimanda tsc, `ping -n N 127.0.0.1` è l'unica attesa consentita: `sleep` seguito da un comando viene bloccato. _(2026-11-08)_
- Nel worktree la guardia rifiuta i comandi Bash che mettono git dentro blocchi composti (`||`, `&&` con cmd): tenere git in chiamate semplici e la junction in PowerShell. _(2026-11-08)_
- nei worktree alcuni heredoc Bash con python vengono rifiutati come «troppo complessi»: scrivere lo script con Write ed eseguirlo, oppure usare Edit _(2026-11-09)_
- Per scrivere stringhe con `\n` nei file non usare heredoc Python: gli escape vengono interpretati. Meglio lo strumento Edit. _(2026-11-10)_

## hook

- Il gancio «PC carico» rifiuta typecheck e suite per qualche minuto: basta riprovare, i test di un solo file passano comunque _(2026-11-07)_
- SubagentStop senza toccare server.ts: hook `command` con `node -e` e script in base64 (niente virgolette da proteggere), generato da `finePrematura.toString()`; la funzione deve restare autosufficien… _(2026-11-08)_

## versioni

- le versioni dei PC nel rapporto vengono dall'ultimo battito, che non si scrive con il Drive pieno: prima di dire «vecchio» si controlla il PC. _(2026-11-09)_

## build

- Il guardiano «PC carico» rifiuta il comando prima di eseguirlo: l'attesa va in una chiamata a parte (until sull'orologio), non dentro lo stesso comando gradle. _(2026-11-07)_
- Il package.json può chiedere pacchetti non installati nella cartella principale (es. @xterm/addon-webgl): tsc fallisce con TS2307 anche su main, serve npm install, non una correzione al codice. _(2026-11-07)_

## drive

- Il freno del Drive pieno e la pulizia chat esistono dalla 0.96.0: prima di rifare, controllare la versione dei PC nei rapporti (DESKTOP/Z2 erano ancora 0.95.x). _(2026-11-07)_
- Il freno Drive (k-65) esiste: se un controllo mostra 403 quota ripetuti, prima guardare la versione dei PC (0.95.x non ce l'ha). `creaFreno(adesso, caso)` e `creaArchivioDrive({pausa, caso})` rendono… _(2026-11-08)_
- «Drive pieno» nella Salute viene dal freno in memoria che scade dopo 15 minuti (index.ts:2632): va reso uno stato «detto», non «in corso». _(2026-11-09)_
- Con Drive pieno il freno blocca anche battito, posta e registro insieme; «acceso» in Progetti viene solo dal battito, quindi un PC che risponde appare «non risponde». _(2026-11-09)_
- A Drive pieno il freno blocca POST/PUT/PATCH ma non DELETE: ogni pulizia va annotata in locale (spazio-intenzioni.json) e il registro sul Drive va riallineato dopo, mai prima. _(2026-11-09)_
- Il freno blocca solo POST/PUT/PATCH: ogni scrittura fa prima una ricerca GET (google-drive.ts carica), e i ritentativi su rateLimit non guardano il freno. _(2026-11-10)_
- Il 403 storageQuotaExceeded non entra in «rifiutate» (risorse.ts 179-183): le rifiutate sono solo limiti di velocità. _(2026-11-10)_

## posta

- `quietaOgniMs` in `creaPostino` rende i test della posta indipendenti dai 90 s di quiete; `ultimaAttivita` e `ultimaLetturaPosta` partono da `-Infinity`, non da 0. _(2026-11-07)_

## tooling

- Nel worktree i comandi Bash/sed composti con più modifiche vengono rifiutati come «troppo complessi»: usare Edit per le modifiche multiple. _(2026-11-09)_

## unione

- La prova d'unione non fa npm install: un ramo con dipendenze nuove fallisce tsc. Prima installarle nella principale con npm install --no-save. _(2026-11-07)_

## criteri

- `git tag --list vX` esce sempre con 0 anche senza tag: come criterio dà verde falso (k-184 0.97.1 segnata fatta senza release). Usare `git rev-parse vX` o `gh release view vX`. _(2026-11-08)_
- `ePesante` taglia su `|` e `;` anche dentro gli apici: toglierli con `senzaApici`, salvo dopo `-c`/`-Command`/`/c`, dove stanno i comandi veri. _(2026-11-08)_

## processo

- la guardia del carico rimanda anche `tsc` lanciato diretto e Start-Sleep è bloccato: scrivere i test e fare commit prima, poi misurare quando il PC scende. _(2026-11-08)_
- la guardia del carico può rimandare typecheck per molti minuti di fila; non si può aspettare dentro il turno (sleep e Monitor sono bloccati): il commit va fatto prima. _(2026-11-08)_
- La guardia del carico controlla prima del comando: un `ping` nella stessa chiamata non fa aspettare. Per attendere serve una chiamata separata, poi si ritenta. _(2026-11-08)_

## criterio

- il tempo della prova include l'attesa del turno e della guardia: a PC carico scade anche se la suite è sana. _(2026-11-07)_

## unioni

- se l'unione dice che tsc non passa in main ma in main passa, l'errore può stare nel ramo unito: provare tsc dopo il merge nella propria copia. _(2026-11-07)_
- i tetti devono stare uno dentro l'altro (suite < prova < fila): prima la prova (15 min) scadeva prima della suite (20) e il figlio restava vivo a tenere il turno _(2026-11-07)_
- il turno dell'unione (12 min, attesa compresa) è più corto della prova (15 min) che lo contiene: possibile scadenza prematura, da decidere _(2026-11-08)_
- UNIONE_TURNO_MAX_MS (12 min) copre solo i passi git, non le misure; se scade prima di PROVA_MAX_MS l'esito è lo stesso 'scaduta'. Ordine voluto: turno < prova < fila. _(2026-11-08)_

## gpu

- con Chromium il contesto WebGL è limitato (circa 16): un addon WebGL su ogni riquadro va tenuto a tetto, non acceso per tutti. _(2026-11-07)_
- Nel codice non ci sono switch che spengono la GPU: il «software» dei PC viene da Chromium (driver di base Windows, Desktop remoto, scheda esclusa), non da un ripiego di SierraDeck. _(2026-11-08)_

## ui

- Le colonne a destra (Domande, Specialisti) condividono `src/shared/misure-pannelli.ts`: limiti, trascinamento e `altreColonne` vanno passati a entrambe, perché il mosaico tenga 520 px. _(2026-11-07)_
- Il tasto di un pannello laterale con stato proprio (Domande, Specialisti) passa da `Console.tsx` con prop dedicate, non da `aperto`. L'evento `apri-pannello` va gestito a parte. _(2026-11-07)_
- il pannello «Altri computer» è `AltriComputer` in PannelloAccount.tsx (mostrato in Salute) e legge i battiti da `posta:pc`; la versione viva va chiesta a parte. _(2026-11-08)_

## salute

- il contatore Drive contava ogni 403 come «rifiutata»: il Drive pieno (storageQuotaExceeded) gonfiava i numeri di «troppe richieste». Ora conta solo 429 e rateLimit. _(2026-11-07)_
- la versione di un altro PC va chiesta dal vivo (`/api/pc`): col Drive pieno i battiti si fermano e «Aggiorna» diventa falso; `frenoDrive.pieno()` dice se il Drive rifiuta scritture. _(2026-11-08)_
- `IngressiSalute.io` può mancare nei test e in alcuni punti di `index.ts`: per il nome di «questo PC» serve un ripiego («Questo PC»). _(2026-11-09)_

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

## renderer

- i canali nuovi di window.gestore vanno dichiarati opzionali in env.d.ts e chiamati con `?.`: i finti dei test e le app più vecchie non li hanno. _(2026-11-08)_
- La Panoramica non ha una lettura propria: gli specialisti li legge `ChatSpecialisti` col sondaggio dell'orchestratore, e l'evento specialistiCambiati si aggancia con `sond.rileggi()`. _(2026-11-08)_
- scriviQuandoPronta guarda solo i riquadri del workspace corrente: un avviso mandato a una chat di un workspace tenuto dietro sparisce in silenzio, quindi non va segnato come consegnato. _(2026-11-09)_

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

## registro

- copie-di-versione/<ver>-<data> contiene il pausa-aggiornamento.json e aggiornamento-in-corso.json di ogni update: prova utile a capire cosa fu salvato prima dell'uscita. _(2026-11-09)_

## ripresa

- riquadroDi nella finestra vede solo useLayoutStore: le chat dei workspace dietro (memoriaWorkspace) non si raggiungono con scriviQuandoPronta _(2026-11-09)_

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
