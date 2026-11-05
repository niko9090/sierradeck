# Lezioni del progetto

<!-- SierraDeck: una riga per voce; una voce che torna aumenta «confermata N×». Tetto 200 voci o 32 KB: escono prima le meno confermate e più vecchie. Si può scrivere anche a mano. -->

## pty-host

- Lo stderr dell'host passa da `leggiStderrAtteso` in pty-host-client.ts: i rumori attesi di node-pty o dello spegnimento si aggiungono lì, il resto resta errore. _(2026-10-30)_

## test

- `racconta` senza l'opzione `log` scrive in console.error: per provare che una riga è raccontata e non errore, il test deve passare `log`. _(2026-10-30)_
- Il test di `creaLoggerUpdater` usava ERR_INTERNET_DISCONNECTED come «errore vero»: per un guasto vero in un test usa un checksum sbagliato, non un errore di rete. _(2026-11-01)_
- il bussare in `statoDi` riesegue `bussa`: nei test che contano le chiamate a `dimentica` o al fetch compaiono doppie. _(2026-11-05)_

## worktree

- un agente isolato in un worktree non può eseguire git nella cartella principale: i compiti che chiedono commit su main vanno dati a chi lavora fuori dal worktree. _(2026-10-30)_
- il ramo di una chat può essere indietro rispetto a main: per verificare una correzione appena unita usare `git grep <simbolo> main -- <percorso>`, non il file del worktree. _(2026-10-31)_

## errori

- Lo stderr dei figli arriva a pezzi arbitrari: riconoscere le righe attese una per una, mai con `^` sul pezzo intero (0.88.2 sfuggiva, prefisso doppio). _(2026-10-30)_

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

## quaderno

- errori-arrivati.md è solo in coda: un ramo che aggiunge un lotto va riunito con main prima, altrimenti i lotti dei rami fratelli confliggono. _(2026-10-31)_

## release

- `noteDi` di scripts/note-novita.mjs restituisce un array di righe, non una stringa: unirlo con join prima di scriverlo su file. _(2026-10-31)_

## git

- Un agente in worktree non può eseguire git nella cartella principale: ripristini e commit su main vanno fatti dall'autopilota, non da uno specialista isolato. _(2026-10-31)_

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

## ipc

- `pty:spawn` ha tre rami prima dello spawn (proprietario, chiusa-senza-cartella, convalida): il proprietario va per primo, perché un progetto di un altro PC qui non ha la cartella. _(2026-11-01)_

## servizio

- Nel servizio ogni console.error va nel registro come ERRORE e negli errori arrivati: un caso atteso (porta occupata) deve usare console.warn. _(2026-11-05)_
- Il servizio avviato dallo script di login non riceve SIERRADECK_VERSIONE (versione «?»); senza versione il Gestore non lo sostituisce. Non scriverla nello script: invecchia. _(2026-11-05)_

## controllo

- criticitaDi unisce per testo, non per PC: lo stesso PC esce due volte se la riga viene dalla salute di un altro PC e l'altra dal proprio bussare. Unire per pcId. _(2026-11-05)_

## remoto

- l'esito «chiave» prende ogni 401, anche quello di un altro SierraDeck o di un estraneo: va distinto per identità (impronta), altrimenti il messaggio contraddice le prove. _(2026-11-05)_

## rete

- un indirizzo salvato può essere riassegnato dal router a un altro PC con SierraDeck: l'identità (impronta) va sempre confrontata anche con i PC noti, non solo con quello atteso. _(2026-11-05)_
