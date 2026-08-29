---
titolo: "Il FileZilla del progetto: SFTP dentro SierraDeck"
quando: 2026-08-29T13:10:00+02:00
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

## Cosa manca (a strati)
1. ~~destinazioni, motore, pannello a due colonne~~ **fatto (0.12.27)**
2. code di trasferimento con più file insieme, cartelle intere, trascinamento
3. un terminale **SSH** come una chat in più — il pty è già un'astrazione, e una
   sessione remota può prendere il suo posto
4. il pannello dal telefono: sfogliare e spostare da fuori casa
5. confronto delle due parti (cosa è più nuovo di qua o di là), che è la cosa per
   cui si apre FileZilla la seconda volta
