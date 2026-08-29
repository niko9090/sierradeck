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

## Cosa manca (a strati)
1. ~~destinazioni, motore, pannello a due colonne~~ **fatto (0.12.27)**
2. ~~code di trasferimento: più file, cartelle intere, trascinamento~~ **fatto (0.12.28)**
3. ~~un terminale **SSH**~~ **fatto (0.12.28)** — dentro il pannello, non come
   chat: legarlo al modello delle chat avrebbe toccato workspace e riquadri, che
   hanno ancora aperto il guasto dei workspace che si rimescolano
4. il pannello **dal telefono**: sfogliare e spostare da fuori casa — l'unico
   strato ancora tutto da fare
5. ~~confronto delle due parti~~ **fatto (0.12.28)**
