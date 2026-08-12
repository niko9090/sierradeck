# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

<!-- Applicazione desktop Electron per Windows 11, non una pagina web: nessuna
     considerazione mobile, nessun browser di terze parti, finestre native. -->

## Users

Un singolo sviluppatore che lavora con Claude Code su Windows 11, spesso su due
monitor. È l'unico utente: il programma gira sulla sua macchina, sulle sue
cartelle, e non è condiviso con nessuno.

Il suo carico **varia molto secondo la giornata**: certi momenti una sola chat a
schermo intero, altri sei riquadri distribuiti su due monitor. Il layout deve
reggere bene entrambi gli estremi invece di essere ottimizzato per uno solo.

Guarda la finestra in due modi diversi, e alterna fra i due nello stesso giorno:

- **da vicino**, seguendo il lavoro riga per riga, quando è al computer;
- **da lontano**, alzando la testa ogni tanto, quando ha lasciato lavorare gli
  autopiloti e sta facendo altro.

Lo stato deve quindi essere leggibile a distanza — per colore e forma, non per
testo piccolo — senza rinunciare al dettaglio quando lo si guarda da vicino.

## Product Purpose

Governare più sessioni di Claude Code insieme, in un mosaico di terminali vivi,
e **ridurre il tempo perso** ad aprirle, ritrovarle e rimetterle in moto.

Il successo si misura in due modi: quante chat lavorano davvero in parallelo
senza intralciarsi, e quanto raramente l'utente deve intervenire a mano su una
chat che si è fermata.

## Positioning

Tre cose che un terminale a schede non fa:

1. **Le sessioni sono quelle vere di Claude Code.** L'indice si legge dai
   `.jsonl` in `%USERPROFILE%\.claude`, in sola lettura, e una chat si riprende
   con la sua cronologia (`--resume`) invece di ricominciare.
2. **Il layout è un oggetto persistente**: si compone trascinando i riquadri, si
   salva per monitor e per workspace con nome, e si ritrova al riavvio. I
   riquadri si spostano fra finestre senza interrompere la sessione.
3. **L'autopilota porta a termine un compito senza sorveglianza**: rimette in
   moto la chat quando si ferma, verifica i criteri eseguendo comandi veri, si
   arrende sugli stalli e cerca l'utente solo quando è davvero bloccato — anche
   quando serve una risposta.

## Operating Context

**I quattro gesti frequenti**, tutti dichiarati come quotidiani dall'utente, e
nessuno dei quali può essere sepolto in un menu:

- aprire e chiudere chat, e sceglierne una dall'elenco delle sessioni;
- cambiare disposizione: preset, trascinamento dei riquadri, nuova finestra su
  un altro monitor;
- governare gli autopiloti: avviarne uno, vedere a che punto sono, fermarli,
  rispondere alle loro domande;
- cambiare workspace.

**Il contenuto è il terminale.** Ogni pixel verticale tolto ai comandi è testo
di terminale in più; nei momenti a sei riquadri questa è la differenza fra
leggere una risposta e doverla scorrere.

**Processi e stati che l'interfaccia rappresenta:** ogni riquadro è un
`claude.exe` vivo; il servizio autopilota vive fuori dall'applicazione e
sopravvive alla sua chiusura, quindi il pannello può trovarlo assente e deve
saperlo dire; un autopilota può essere al lavoro, in attesa di una risposta,
sospeso, finito o fallito.

## Constraints

- **Windows 11**, Electron 43 con React 19; nessuna dipendenza nuova per
  l'interfaccia (niente librerie di componenti, niente framework CSS).
- **Sola lettura sui dati di Claude Code.** L'applicazione non scrive mai sotto
  `%USERPROFILE%\.claude`.
- Le chat girano con `--dangerously-skip-permissions`: scelta consapevole
  dell'utente, che l'interfaccia non deve rendere reversibile di nascosto.
- Il terminale è xterm.js su fondo scuro `#1e1e1e`: l'interfaccia gli sta
  intorno e non può schiarire quel fondo.

## Terminology

Termini che l'utente usa e che l'interfaccia deve rispettare, in italiano:
**riquadro** (una chat nel mosaico), **workspace** (un insieme di layout con
nome), **autopilota** (l'agente che porta a termine un compito), **sessione**
(una conversazione di Claude Code esistente su disco).
