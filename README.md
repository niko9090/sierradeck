# SierraDeck

### [⬇ Scarica SierraDeck per Windows](https://github.com/niko9090/sierradeck/releases/latest)

Un file solo, `SierraDeck-Setup-*.exe`: si installa senza chiedere
l'amministratore e da li' in avanti si aggiorna da solo. Il codice qui sotto
serve a chi vuole guardarci dentro — per usarlo basta il file.


La plancia delle tue chat Claude Code, per Windows: un mosaico di riquadri,
ciascuno con un `claude.exe` vivo dentro un terminale, l'indice di tutte le
conversazioni gia' fatte, e **autopiloti** che portano a termine un compito
mentre non ci sei.

Il nome: *Sierra* e' la S dell'alfabeto radio — quello che si parla in cabina —
e *Deck* e' la plancia, dove gli strumenti stanno tutti sott'occhio.

**Chi aggiorna dal nome precedente** non deve fare niente: al primo avvio la
cartella dei dati viene spostata da `%APPDATA%\GestoreSessioni` a
`%APPDATA%\SierraDeck`, con dentro autopiloti, salvataggi, nomi delle chat e indice.

I dati di Claude Code (`%USERPROFILE%\.claude`) sono trattati in **sola
lettura**, con una sola eccezione voluta: dall'elenco delle sessioni si possono
buttare le conversazioni che non servono piu', e finiscono nel cestino di
Windows — mai cancellate, e solo quelle scelte una per una.

## Prerequisiti

- Windows 11
- Node.js 22 o superiore
- Claude Code installato (il gestore lancia `claude.exe`, non lo include)

## Installazione

```powershell
npm install
```

**Con npm 12 le installazioni sono senza script per impostazione predefinita.**
I moduli nativi di questo progetto (`node-pty`, `better-sqlite3`) sono prebuild
N-API e non vanno ricompilati, ma `electron` ha bisogno del proprio script di
installazione per scaricare il runtime. Il campo `allowScripts` in
`package.json` lo autorizza; se la versione di npm in uso lo ignorasse, la
verifica e' una sola:

```powershell
Test-Path node_modules\electron\path.txt   # deve dare True
```

Se da' `False`, l'applicazione non partira'. Reinstallare con gli script
abilitati per i pacchetti elencati in `allowScripts`. Non aggiungere
`@electron/rebuild` ne' uno script `postinstall`: ricompilare i moduli nativi
li rompe.

## Esecuzione

```powershell
npm run dev      # sviluppo, con ricaricamento a caldo dell'interfaccia
npm run build    # costruisce in out/
npm start        # esegue l'artefatto costruito
```

## `GESTORE_CLAUDE_PATH`

Senza configurazione il gestore lancia `claude.exe` cercandolo sul `PATH`.
L'installazione tipica di Claude Code mette il binario in
`%USERPROFILE%\.local\bin`, che **non e' nel PATH di sistema per impostazione
predefinita**: se non lo e' nemmeno nel tuo, i riquadri si aprono vuoti senza
altra spiegazione. In quel caso indica il percorso esplicito:

```powershell
$env:GESTORE_CLAUDE_PATH = "$env:USERPROFILE\.local\bin\claude.exe"
npm run dev
```

L'estensione `.exe` e' obbligatoria anche nel valore esplicito: node-pty su
Windows cerca il nome file letterale in ogni cartella del `PATH` e non consulta
mai `PATHEXT`.

La variabile viene letta dal processo principale all'apertura di ogni
terminale, quindi va impostata nell'ambiente da cui si lancia l'applicazione.

## Autopilota

Un autopilota porta a termine un compito senza che tu debba scrivere «continua».

Si crea dal pannello **Autopiloti**, e ti chiede una cosa sola: **cosa vuoi
ottenere**, con parole tue. Da lì comincia un'intervista: guarda il progetto —
gli script, i test, la struttura — e ti fa solo le domande a cui il codice non
risponde da solo, una per volta. Quando ne sa abbastanza si configura da sé,
compresi i criteri che dicono quando avrà finito, e parte.

Le domande arrivano in una finestra che compare da sé: rispondi e il lavoro
riprende da dove si era fermato.

I criteri che l'autopilota si dà preferiscono un comando (`npm test`,
`npm run build`): il servizio lo esegue davvero, e un esito eseguibile è un
fatto, mentre un giudizio è un parere.

**Come fa a non lasciarla ferma.** Le chat governate ricevono un hook `Stop` di
tipo `http`, iniettato per singola sessione con `--settings`: quando la chat
finisce un turno chiede al servizio cosa fare, e la risposta la fa proseguire
senza rilanciare `claude.exe`. Le impostazioni globali in `~/.claude` non
vengono toccate.

**Quando gira a vuoto.** Se lo stesso criterio fallisce allo stesso identico
modo giro dopo giro, l'autopilota se ne accorge e cambia strada: prova un
approccio diverso a ogni tentativo — capire l'errore invece di correggerlo a
caso, dubitare che il comando di verifica misuri la cosa giusta, cambiare
metodo, tornare a uno stato che funziona. Finite le strade chiede a te, e
riparte con la tua risposta. Un tetto di tempo o di cicli si puo' impostare, ma
non c'e' per impostazione predefinita: un lavoro che procede non deve fermarsi
allo scadere di un numero deciso da qualcun altro.

**Più chat sullo stesso obiettivo.** Con il campo «chat» maggiore di 1, il
lavoro viene spezzato in pezzi che non si toccano — due chat sugli stessi file
si sovrascrivono a vicenda — e ogni pezzo va a una chat diversa.

### Il servizio

Gli autopiloti vivono in un processo a sé (`out/main/autopilot-host.js`, porta
locale **47630**), che **sopravvive alla chiusura dell'applicazione**: puoi
chiudere il gestore e lasciarli lavorare. Lo stato di ognuno sta in
`%APPDATA%\SierraDeck\autopiloti\*.json`, ed è leggibile a mano.

L'interruttore **«riparti al login»** nel pannello installa uno script nella
cartella Esecuzione automatica: dopo uno spegnimento del PC il servizio torna su
da solo e riprende gli autopiloti che stavano lavorando.

## Verifiche

```powershell
npm test         # suite completa
npm run typecheck
npm run build
```

## Dove finiscono i dati

`%APPDATA%\SierraDeck\autopiloti\*.json` — lo stato degli autopiloti, uno
per file. **Non è ricostruibile da niente**: contiene il lavoro fatto, quindi un
file illeggibile viene spostato di lato (`.illeggibile-N`) e mai cancellato.

`%APPDATA%\SierraDeck\workspaces.json` — i layout dei riquadri, per
monitor e per workspace. Vale la stessa regola: si conserva, non si cancella.

`%APPDATA%\SierraDeck\index.db` — l'indice delle sessioni.
E' una cache interamente ricostruibile dai `.jsonl`: si puo' cancellare in
qualunque momento, e se il file risulta corrotto l'applicazione lo ricrea da
sola all'avvio dicendolo nel log.

**L'indice si aggiorna, non si rifa'.** A ogni avvio vengono riletti solo i
file cambiati: dimensione e data di scrittura dicono quali. Su un archivio di
qualche centinaio di sessioni la differenza si misura in secondi: una rilettura
completa contro un aggiornamento quasi istantaneo. Il tasto **Rileggi** nella
finestra delle sessioni forza invece la rilettura completa: esiste per quando
si sospetta che l'indice non rispecchi piu' i file. La durata di ogni
indicizzazione finisce nel log (`[indexer] N sessioni (M gia' note) in Xs`).

**Dopo una terminazione forzata** (Task Manager, «Termina attivita'») accanto a
`index.db` restano un `-wal` e un `-shm`. Aprendo il database con quello `-shm`
orfano, SQLite legge il solo file principale e ignora il write-ahead log:
l'indice **sembra vuoto e non lo e'**. Non serve fare niente e soprattutto non
serve cancellare lo `-shm` a mano: basta riavviare l'applicazione e premere
**Rileggi**, che ricostruisce l'indice da capo.

## Compilare e installare

```
npm run icona       # rigenera build/icon.png da build/icona.svg
npm run pacchetto   # crea dist/SierraDeck Setup <versione>.exe
```

L'installer e' per utente e non per macchina: non chiede l'amministratore, mette
il programma nel menu Start e lo toglie dal pannello di Windows. I dati —
indice, salvataggi, autopiloti, etichette — restano al loro posto anche
disinstallando.

**Gli aggiornamenti** si cercano da soli dieci secondi dopo l'avvio e poi ogni
sei ore, ma non succede nient'altro senza un si': scaricare costa banda e lo
chiede, installare chiude il programma con le chat aperte dentro e lo chiede una
seconda volta. Le chat tornano al riavvio dal salvataggio automatico.

Passano dai **Release di GitHub**: nessun server da tenere in piedi. Con un
repository pubblico il programma scarica senza credenziali di nessun tipo.
