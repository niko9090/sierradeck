---
titolo: "Autopilota: perché non ripartiva da solo, e perché ripartiva da capo"
quando: 2026-08-30T20:05:00Z
tag: ["autopilota", "servizio", "ripresa", "cicli-di-vita"]
---

# Il servizio e le chat non muoiono insieme

È la radice di entrambi i difetti chiusi in **0.12.41**, e va tenuta a mente
ogni volta che si tocca l'autopilota.

- Il **servizio** (`autopilot-host`) è lanciato `detached` + `unref`: sopravvive
  di proposito alla chiusura di SierraDeck. È tutto il suo mestiere — un lavoro
  delegato deve continuare a finestre chiuse.
- Le **chat governate** no: vivono nel Gestore (pty-host), e `chiudiRisorse()`
  le uccide tutte alla chiusura.

Chiudere e riaprire SierraDeck è quindi il caso in cui *tutte* le conversazioni
governate muoiono mentre il servizio resta convinto che stiano lavorando.

## Difetto 1 — nessuno ripartiva

`daRiprendere()` veniva chiamata **solo** dentro il callback di
`server.listen()`, cioè solo quando il processo del servizio nasce. Al ritorno
del Gestore il servizio è lo stesso di prima: non riparte, la ripresa non
scatta, e gli autopiloti restano scritti «al lavoro» davanti a chat che non
esistono. Restavano così fino a che il guardiano del silenzio, **un'ora** dopo,
li sospendeva — oppure finché qualcuno non li rimetteva in moto a mano.

Nota: `assicuraServizio()` non aiutava, perché quando il servizio risponde e la
versione combacia esce subito con `true`. L'unico caso in cui la ripresa
funzionava era l'aggiornamento di versione (`/spegni` → servizio nuovo → listen).

**Correzione**: `POST /gestore-avviato`. Il Gestore dichiara il proprio ritorno
all'avvio; il servizio rifà la ripresa. La logica sta in un posto solo —
`riprendiLavori()` in `server.ts` — chiamata sia all'avvio del processo sia
dalla rotta. Il confine fra i due processi va in una direzione sola (il Gestore
chiama, il servizio non può richiamare): per questo la dichiarazione parte da
chi *sa* che le chat sono morte.

**Attenzione alla doppia ripresa**: quando è il Gestore ad avviare il servizio,
scattano tutt'e due le strade a pochi secondi di distanza. `RIPRESA_RAVVICINATA_MS`
(30s) le fonde: due riprese ravvicinate sono lo stesso ritorno, e riprendere due
volte significa scrivere due ordini dentro la stessa chat.

## Difetto 2 — chi ripartiva, ripartiva da capo

In `esecutoreNelMosaico.avvia()`, `messaggio` assente copriva **due casi molto
diversi** con lo stesso testo: la prima partenza e il ritorno. Al ritorno la
chat riceveva `primoCompito()` — obiettivo e criteri, parola per parola —
dentro la conversazione di prima, con tutto il lavoro già fatto sopra. L'unica
lettura sensata di un ordine di cominciare è cominciare: rifaceva tutto.

**Correzione**: `ripartiDaDove()`, scelto da `riprende()`. Due condizioni,
entrambe necessarie:

1. la sessione esisteva già (altrimenti la conversazione deve ancora nascere);
2. ha chiuso almeno un turno (`cicli > 0`) — l'id di sessione si decide *prima*
   di aprire la chat, per poterla mostrare mentre nasce, quindi la sua sola
   presenza non prova che ci sia dentro qualcosa. In una flotta si guardano i
   cicli **della sua chat**, non quelli dell'autopilota: una chat appena aperta
   accanto a una che lavora da un'ora non sta riprendendo niente.

Il promemoria di obiettivo e criteri resta nel messaggio di ripresa, ma
dichiarato per quello che è: serve quando la trascrizione è stata riassunta via,
o quando l'obiettivo è stato cambiato a parole mentre si lavorava.

## Cose da non dimenticare

- Il `sessionId` che l'autopilota tiene in archivio è quello **vero e corrente**:
  ogni hook `Stop` lo riscrive. Quello memorizzato in `vive` dentro
  `esecutoreNelMosaico` è invece quello con cui la chat è nata, e ha la
  precedenza di proposito — è l'identità con cui il riquadro è registrato nel
  layout (`pane.sessionUuid` non viene mai aggiornato dopo la creazione).
  Invertire quella precedenza sembra una pulizia e non lo è: farebbe mancare il
  riquadro a `riquadroDi()`, che ripiegherebbe sull'adozione, e l'adozione fa
  **rinascere il terminale** a ogni messaggio.
- `--resume` vs `--session-id` li decide `src/main/config.ts` guardando se la
  trascrizione esiste. Sbagliare ramo lascia un riquadro vuoto.
