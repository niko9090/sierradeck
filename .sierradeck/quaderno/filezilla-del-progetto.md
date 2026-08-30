---
titolo: "Il FileZilla del progetto: SFTP dentro SierraDeck"
quando: 2026-08-29T18:20:00+02:00
tag: ["trasferimenti", "sftp", "ssh", "sicurezza", "pacchetto"]
---

## Perché dentro, e perché per progetto
Un progetto non vive solo sul disco: c'è quasi sempre un posto **dove va a
finire** — un server, un NAS, una macchina di prova. Quel pezzo di lavoro stava
fuori da SierraDeck: si apriva FileZilla e si ricordava a memoria quale server
apparteneva a quale cartella.

Le destinazioni stanno **per progetto** (`cwd`) e non in un elenco unico, ed è la
decisione che regge tutto il resto: un elenco globale di venti connessioni
rimette addosso esattamente il lavoro che si voleva togliere. Apri la chat di un
progetto e vedi i suoi server, e nessun altro.

## I tre pezzi
- `trasferimenti/destinazioni.ts` — l'archivio, **senza Electron dentro**: il
  cifratore arriva da fuori, così la logica (chi appartiene a chi, cosa si
  sovrascrive, cosa se ne va con una cancellazione) si prova senza avviare
  un'applicazione.
- `trasferimenti/sftp.ts` — il motore su `ssh2`: elencare, scaricare, caricare,
  creare, rinominare, cancellare.
- `trasferimenti/servizio.ts` — tiene aperte le sessioni. Aprire un canale SSH
  costa un secondo abbondante e sfogliare ne fa una decina di richieste: senza
  riuso il pannello sarebbe inutilizzabile, e nessun errore lo direbbe. Si
  chiudono da sole dopo cinque minuti — un canale lasciato aperto per sempre lo
  chiude il server per conto suo, nel momento peggiore.

## Le decisioni che contano

**La prima connessione fallisce apposta.** Torna l'impronta della chiave del
server e si ferma. È l'unica cosa che rende il collegamento davvero sicuro
invece che solo cifrato: la cifratura da sola dice «nessuno legge», non «stai
parlando con chi credi». `hostVerifier` torna `false` **prima** che parta
qualunque cosa, password compresa — se non sappiamo con chi parliamo, non gli si
dice niente.

**Le password vanno al portachiavi del sistema** (`safeStorage`, DPAPI su
Windows, legato all'account): nel file resta solo il segno cifrato, e copiato su
un altro computer non vale niente. E si conservano quando si modifica una
destinazione senza ridigitarle: chiederle a ogni modifica è il modo più rapido di
far scrivere «password1» a tutti.

**Cancellare una destinazione cancella la sua chiave.** Un segreto che resta per
un server sparito dall'elenco è un accesso che nessuno revocherà mai, perché
nessuno sa che c'è.

**`rmdir` vuole la cartella vuota, e va bene così.** Una cancellazione ricorsiva
remota dietro un tasto solo è il modo di far succedere il disastro che non si
annulla.

## Come si è provato
Non con dei mock: con un **server SSH vero**, in memoria, montato dal test
(`ssh2` ha anche il lato server). Quello che si sbaglia in un client SFTP non è
la logica, è il **protocollo** — i tempi in secondi invece che in millisecondi, i
bit di `mode`, l'ordine degli eventi — e contro un finto benevolo tornano tutti
verdi. Il test dei millisecondi esiste perché quel difetto c'era: senza
moltiplicare per mille, ogni file del 2026 si mostrava come del gennaio 1970.

## Il guasto che stava per essere pubblicato
Dopo aver impacchettato, guardando **dentro** il pacchetto: `ssh2` c'era, le sue
dipendenze no. `electron-builder` lo tira fuori dall'asar da solo (si porta
dietro `cpu-features`, nativo e opzionale) ma tira fuori **solo lui**; `asn1` e
`bcrypt-pbkdf` restavano dentro l'asar, e da `app.asar.unpacked/node_modules/ssh2`
la risoluzione dei moduli non ci rientra — sale nelle cartelle vere del disco e
non trova niente.

In sviluppo funzionava tutto. Nel programma installato `require('ssh2')` sarebbe
fallito al primo collegamento, cioè il guasto si sarebbe visto solo addosso a chi
usa. Adesso c'è un test (`pacchetto-ssh2.test.ts`) che cammina l'albero vero
delle dipendenze e chiede che ognuna sia nominata in `asarUnpack`: il giorno in
cui `ssh2` ne aggiunge una, il pacchetto tornerebbe rotto **senza che niente lo
dica** — codice che compila, test verdi, app in sviluppo che va.

**Regola.** Un modulo nuovo fra le dipendenze non è finito quando i test passano:
è finito quando si è guardato dentro il pacchetto. In dev tutto si risolve; è
l'installato che conta.

## La coda (0.12.28)
`trasferimenti/coda.ts`. Tre decisioni, e sono quelle che la rendono usabile:

- **Le cartelle si contano prima.** Accodare una cartella la cammina e la
  trasforma nei suoi file, uno per riga. Costa qualche secondo — durante i quali
  si dice «sto contando» — e in cambio dà l'unica cosa che rende sopportabile
  un'attesa: sapere quanto manca. Una barra su un totale ignoto non è
  un'informazione, è un'animazione.
- **Un file per volta, per destinazione.** Su un canale SFTP solo le copie
  parallele non vanno più veloci: si dividono la banda e quando una fallisce non
  si capisce quale. Server diversi invece camminano insieme.
- **Un errore non ferma la fila.** Chi ha lanciato una copia da mezz'ora vuole i
  499 file che si potevano prendere, non un elenco vuoto e il primo intoppo.

Quello **in corso** non si annulla: interrompere una copia a metà lascia sul
disco un file troncato che sembra buono, ed è proprio il caso in cui poi si
sovrascrive l'originale con la metà.

Il motore è un parametro (`MotoreCoda`): l'ordine, gli errori e il conteggio si
provano senza un server acceso — il protocollo ha già i suoi test contro un
server vero.

## La trappola del trascinamento
Un file lasciato cadere **fuori** dal bersaglio porta via la pagina: è il
comportamento predefinito del web, il browser apre il file al posto del
documento. Dentro un'applicazione vuol dire che **SierraDeck sparisce** e resta
un visualizzatore di file, senza un tasto indietro. Basta una mira sbagliata di
due centimetri. La guardia sta in `renderer/main.tsx`: `dragover` e `drop` sulla
finestra con `preventDefault`. Chi vuole davvero il trascinamento chiama
`preventDefault` per conto suo e l'evento non ci arriva.

Da Electron 32 `File.path` non esiste più: il percorso di un file trascinato da
Esplora risorse lo dà `webUtils.getPathForFile`, dal ponte. E **se sia cartella o
file lo si chiede al disco**: indovinarlo dal punto nel nome sbaglia su `.git` e
su `archivio.2026`.

## Il terminale sul server (0.12.28)
Una shell sulla **stessa** connessione SFTP (`cliente.shell()`), non una seconda:
autenticarsi due volte vuol dire chiedere la password due volte o tenerne due
copie in giro. Sta sotto le due colonne, non in una finestra a parte — caricare
un file e riavviare il servizio che lo legge è un gesto solo.

Tre dettagli che si sbagliano da soli:
- **I byte diventano testo con uno `StringDecoder`.** Un pezzo di rete può finire
  in mezzo a una lettera accentata: decodificarlo da solo dà una scatoletta al
  posto della «ò», e su un server italiano succede al primo `ls`.
- **`setWindow` vuole le righe prima delle colonne**, al contrario di tutto il
  resto: invertirle dà un terminale che va a capo dove non deve, e non se ne
  accorge nessuno finché non capita.
- **La potatura delle sessioni inattive deve saltare quelle con un terminale
  aperto.** Un terminale è un uso anche se non passa un byte da mezz'ora:
  chiuderlo sotto le mani di chi lo guarda è la sessione che sparisce da sola.

Scrivendo il test: nel server di `ssh2` il primo argomento dei gestori di sessione
è **`accept`**, non l'id della richiesta (`session.on('pty', (accept, reject,
info) => ...)`). Sbagliarla dà una shell che non si apre mai, senza un errore che
lo dica.

## Il confronto fra i due lati (0.12.28)
`shared/confronto-file.ts`. È la ragione per cui si riapre un client SFTP la
seconda volta: la prima si manda tutto, dalla seconda la domanda è sempre
«questo l'ho già mandato?». Senza risposta si ricarica tutto per sicurezza, ed è
così che si sovrascrive una correzione fatta direttamente sul server.

**Tolleranza di 2 secondi sui tempi, nessuna sulla dimensione.** Due copie
identiche quasi mai hanno lo stesso millisecondo (SFTP dà i secondi, alcuni
filesystem arrotondano, il caricamento non conserva la data): senza tolleranza
*ogni* file risulterebbe diverso, che è come non dire niente, solo più rumoroso.
Un byte di differenza invece è una differenza vera.

## Il pannello vero (0.12.43)

Il motore era gia' completo e **il pannello non lo raggiungeva**:
`rinominaRemoto`, `eliminaRemoto`, `creaCartellaRemota` erano esposti fino al
renderer e nessun tasto li chiamava. La colonna era un elenco piatto con
selezione, doppio clic e «↑ Su». Da qui la sensazione di «scarno»: non mancava
la potenza, mancava la strada per arrivarci.

`shared/sfoglia.ts` — tutta la logica di sfogliare, senza React dentro, perche'
e' la parte che si sbaglia in silenzio:

- **Ordinamento con `Intl.Collator({numeric: true})`.** Senza, `parte10` viene
  prima di `parte2`, e ogni cartella di backup, log o episodi risulta mescolata
  senza colpa di nessuno. Le cartelle stanno in testa **a prescindere dal
  verso**: sono struttura, non contenuto.
- **Selezione con un'ancora**, non «l'ultimo preso». Dopo un Maiusc l'ultimo
  preso e' la fine dell'intervallo: ripartire da li' fa crescere la selezione e
  non restringerla mai. L'intervallo si conta sull'elenco **come si vede** —
  filtrato e ordinato — perche' chi tiene premuto Maiusc indica due righe sullo
  schermo.
- **Cronologia**: un percorso nuovo butta il ramo «avanti», o si avrebbe un
  avanti verso una strada mai scelta. E' alimentata dal **percorso**, non dai
  clic: altrimenti resterebbero fuori doppio clic, barra scritta a mano e
  ritorno automatico dopo una copia.
- **Il filtro non nasconde le cartelle.** Serve a trovare un file in una
  cartella affollata; nasconderle toglie l'unica via per cercarlo altrove.
- **`separatoreDi`/`unisciPercorso`/`accantoA`**: il separatore si guarda nel
  percorso, non in `process.platform`. Le due colonne sono un disco Windows e un
  server Unix, e dedurlo dal sistema costruisce `\home\utente\file` sul server.
  `accantoA` esiste perche' ne' SFTP ne' il filesystem hanno «rinomina»: hanno
  «sposta», e sbagliare il calcolo sposta il file in un posto che non esiste.

Aggiunte al pannello: ordinamento cliccabile, barra del percorso scrivibile,
avanti/indietro/su, filtro, file nascosti, rinomina, elimina, nuova cartella,
aggiorna, «apri fuori», tastiera (Invio, Backspace, F2, Canc, F5, Ctrl+A),
conteggio in fondo. E le **operazioni locali** (`creaCartellaLocale`,
`eliminaLocale`, `rinominaLocale`), che mancavano del tutto: una colonna che sa
rinominare e l'altra no costringe ad aprire Esplora risorse per meta' dei gesti.
`eliminaLocale` e' ricorsiva e `eliminaRemoto` no, di proposito: di qua il
terreno e' il tuo, di la' una cancellazione ricorsiva dietro un tasto solo e' il
disastro che non si annulla.

## Aprire e modificare un file remoto (0.12.43)

`trasferimenti/modifica-remota.ts`. E' *la* funzione per cui si tiene aperto un
client SFTP tutto il giorno: doppio clic su un file del server, si apre nel
programma con cui lo apriresti qui, e ogni salvataggio risale da solo.

Le tre trappole, tutte pagate da chi ha scritto questa roba prima di noi:

1. **Si sorveglia la cartella, non il file.** Quasi nessun editor riscrive il
   file che hai aperto: ne scrive uno accanto e lo rinomina sopra. Chi guarda il
   file per nome lo perde di vista al primo salvataggio, **senza un errore** —
   quel file esiste ancora, e' solo diventato un altro.
2. **Un salvataggio non e' un evento.** Un Ctrl+S produce `rename`, `change` e
   spesso un secondo `change`: caricare a ognuno manda lo stesso file tre volte,
   e sul terzo il server ha in mano il primo. Mezzo secondo di quiete li fonde.
3. **Non si risale se non e' cambiato.** Molti editor toccano la data anche
   aprendo e chiudendo senza modificare. Ricaricare una copia identica cambia la
   data sul server, e da li' in poi il confronto fra i due lati dice «piu' nuovo
   di la'» per un file che nessuno ha toccato.

Un errore di caricamento **non stacca la sorveglianza**: si mostra e il prossimo
salvataggio riprova. E `chiudiTutto` deve chiudere anche i sorveglianti — ognuno
tiene un handle sul filesystem, e su un programma che sta giorni acceso se ne
accumula uno per ogni file mai aperto.

## Permessi e andatura (0.12.43)

- `sftp.chmod` dietro `permessiRemoti`. I permessi si vedevano gia': poterli
  cambiare era la meta' che mancava, ed e' il motivo per cui meta' delle volte
  si apriva una shell subito dopo aver caricato. `leggiPermessi` accetta **solo**
  tre o quattro cifre da 0 a 7: `parseInt('759', 8)` tornerebbe 61 (`075`), cioe'
  un file senza permessi per il proprietario da una battitura sbagliata.
- `shared/andatura.ts`: velocita' e tempo rimanente, misurati su una finestra di
  **cinque secondi** e non dall'inizio — una copia che parte piano
  trascinerebbe la media per tutto il resto. Sotto il mezzo secondo di campioni
  non si scrive niente: e' rumore moltiplicato, ed e' da li' che vengono i
  «1,4 GB/s» che nessuno crede.

## Cosa manca (a strati)
1. ~~destinazioni, motore, pannello a due colonne~~ **fatto (0.12.27)**
2. ~~code di trasferimento: più file, cartelle intere, trascinamento~~ **fatto (0.12.28)**
3. ~~un terminale **SSH**~~ **fatto (0.12.28)** — dentro il pannello, non come
   chat: legarlo al modello delle chat avrebbe toccato workspace e riquadri, che
   hanno ancora aperto il guasto dei workspace che si rimescolano
4. il pannello **dal telefono**: sfogliare e spostare da fuori casa — l'unico
   strato ancora tutto da fare (il telefono non ha **nessun** pannello file:
   non e' una differenza fra i due lati, e' una funzione che li' non esiste)
5. ~~confronto delle due parti~~ **fatto (0.12.28)**
6. ~~ordinamento, filtro, cronologia, rinomina/elimina/nuova cartella su
   entrambi i lati, tastiera~~ **fatto (0.12.43)**
7. ~~aprire un file remoto e vederlo risalire a ogni salvataggio~~
   **fatto (0.12.43)**
8. ~~permessi modificabili, velocita' e tempo rimanente~~ **fatto (0.12.43)**
9. regola di sovrascrittura (sovrascrivi/salta/rinomina/chiedi): adesso si
   sovrascrive e basta. `nomeLibero` in `sfoglia.ts` c'e' gia' e non e'
   ancora usato — e' il pezzo pronto per quando si fara'
10. ripresa di un trasferimento interrotto, ricerca ricorsiva sul server,
    sfogliamento sincronizzato
