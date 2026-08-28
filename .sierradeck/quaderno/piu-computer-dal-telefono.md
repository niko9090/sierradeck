---
titolo: "Più computer da un telefono solo: le postazioni"
quando: 2026-08-28T16:10:00+02:00
tag: ["telefono", "accoppiamento", "postazioni", "prodotto"]
---

## Il problema
L'app era nata pensando a **un** computer. Chi ne ha tre in casa — il fisso, il
portatile, quello di lavoro — restava legato al primo con cui si era accoppiato:
l'indirizzo era uno solo, e per cambiarlo bisognava buttare via l'accoppiamento e
rifarlo col QR. **Cambiare computer costava quanto perderne uno.**

## La scoperta
Metà del lavoro c'era già. `Collegamento` ha sempre salvato le chiavi **per
indirizzo** (`chiave:<indirizzo>`), e scriveva un elenco `indirizzi-noti` a ogni
accoppiamento. Solo che non lo leggeva nessuno — esattamente come `Guasti.ultimo()`,
scritto per mesi e mai mostrato, e come `indirizziNoti()` qui.

**È la terza volta in questo progetto** che la funzione mancante non era da
scrivere ma da *collegare*. Vale la pena dirlo come regola: quando una
funzionalità sembra grossa, prima si cerca cosa il codice già ricorda e non
mostra. Un dato scritto e mai letto è una funzionalità a metà che nessuno ha
finito.

## Come sta adesso (0.12.23 / app 2.14.0)
- `Postazioni`: elenco di `{ indirizzo, nome, tenuta, ultimoUso }` in JSON nelle
  preferenze, con **recupero** dal vecchio `indirizzi-noti` — chi aveva già
  accoppiato dei computer li ritrova senza rifare niente.
- **Pillola in cima a ogni schermata** col nome del computer che stai guardando e
  il pallino della connessione. Sta lì e non dentro «Computer» perché cambiare
  macchina è un gesto che si fa *mentre* si fa altro: guardi una chat, ti accorgi
  che è dell'altro banco, cambi e continui. E con tre computer in casa, sapere
  quale stai comandando **prima** di scrivere un comando non è un dettaglio.
- Il selettore è un foglio dal basso: tocchi e ci sei. Cambiare non rifà
  l'accoppiamento — la chiave c'è già. Solo un computer mai visto porta al QR, e
  ci arriva **senza un ramo apposta**: chiave vuota → `collegato` falso →
  ingresso. Il caso nuovo cade da solo nella strada giusta.
- **La spunta «tienila»** era la richiesta esplicita: spuntata non si dimentica
  mai, non spuntata è di passaggio e restano le cinque più recenti. Senza quella
  distinzione l'elenco diventa una discarica di indirizzi provati una volta.
- Rinominare: «studio» si legge, `192.168.1.191` no. Un nome scritto a mano vince
  su quello che manda il computer — chi ha chiamato una macchina «studio» non
  vuole ritrovarsela «DESKTOP-4F2K1».
- Il computer manda il proprio hostname in **`/api/stato`**, non in `/api/ciao`:
  il nome di una macchina non si regala a chiunque sia sulla rete, si dice a chi
  si è già presentato con la chiave.

## Due difetti trovati per strada
**`Collegamento.dimentica()` faceva `clear()`.** Cioè buttava via *tutto*: le
chiavi di ogni computer, l'elenco dei noti, la misura del carattere. Con un
computer solo non si vedeva; con tre, «scollegati da questo» voleva dire perdere
anche gli altri due. Ora toglie solo l'indirizzo corrente, e la chiave resta —
per togliere davvero un accesso c'è `Postazioni.dimentica`, che è un gesto
esplicito e cancella anche la chiave (le due cose vanno insieme: una chiave che
resta per un computer sparito dall'elenco è un accesso che nessuno può revocare
perché nessuno sa che c'è).

**`Postazioni.usata` stava per riscrivere le preferenze ogni due secondi**,
perché la chiama il polso di `/api/stato`. È lo stesso errore che stamattina ha
scollegato il telefono dal computer — `dispositivi.json` riscritto a ogni
richiesta — e stava per essere rifatto dall'altra parte lo stesso giorno.
Throttle al minuto: serve a ordinare un elenco, al minuto è già precisione
superflua.

Vedi anche [[telefono-si-scollega-da-solo]] e [[app-android-nativa]].
