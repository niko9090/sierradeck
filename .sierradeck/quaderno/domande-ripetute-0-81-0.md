---
titolo: "0.81.0: nessuna domanda ripetuta a Nicholas, sempre in italiano (lato servizio)"
quando: 2026-10-20T09:45:00+02:00
tag: ["0.81.0", "domande", "autopilota", "partecipe"]
---

**Perché.** La mattina del 20/10 a Nicholas è arrivata due volte la stessa domanda. Prima «Installi tu la 0.80.0?» (chat c-10), poi «Will you install the 0.80.0?» (c-12). Le due erano aperte insieme e lui ha risposto a 13 s di distanza, mentre la 0.80.1 era già installata. I filtri che c'erano non potevano vederlo:
- `memoria.trovaRisposta` cerca la stessa frase, o parole uguali con Jaccard ≥ 0,8;
- `domandaGemella` cerca parole uguali;
- fra due lingue diverse le parole in comune sono zero.

Questo è il pezzo di c-13 della correzione «Nicholas partecipe». La divisione del lavoro è in `2026-10-20-partecipe-chi-fa-cosa.md`.

# Come funziona (`src/autopilot-host/domande-doppie.ts`)
- **Argomento.** Per ora si riconosce solo «installare la versione X.Y.Z».
  - Conta solo un numero preceduto da `la/versione/release/sierradeck/the`, oppure scritto `vX.Y.Z`.
  - «installo vitest 0.34.6» non è una versione del programma.
  - Due domande sono uguali se hanno le **stesse** versioni, non solo una in comune.
- **Stato vero.** Si confronta con `deps.versione`, cioè `SIERRADECK_VERSIONE` del servizio installato.
  - «Installi la X?» con X ≤ versione installata non si chiede.
  - Alla chat si dice che è già installata.
- **Risposte già date** (`rispostaGiaData`):
  - sullo stesso argomento valgono **6 ore**;
  - dalla stessa chat, con somiglianza ≥ 0,5, valgono **24 ore**;
  - un «no», «aspetta», «dopo» o «non ancora» non si riusa mai.
  - La memoria ora ricorda anche la chat che aveva chiesto (`RispostaRicordata.chat`).
- **Lingua.** Una domanda in inglese torna al supervisore da riscrivere in italiano.
  - Il controllo è `sembraNonItaliano` in `domanda-strutturata.ts` e lo fa `validaDomanda`.
  - Le regole dei prompt dicono «Sempre in italiano».

# Dove si applica (server.ts)
- **`domandaDaScartare`** si usa sia nel ramo `chiediUtente` (fine turno) sia in `suNotification`.
  - Scrive una riga nel diario e una nel registro del servizio (`[domande] … scartata`).
- **Domanda uguale già aperta:**
  - dalla stessa chat si scarta;
  - da una sorella, la chat si **aggancia** con `contesto.ancheChat` e resta `bloccata`.
- **Una risposta di Nicholas chiude tutte le domande aperte sullo stesso argomento** (rotta `POST /domande/:id/risposta`). Ogni chat riparte con la stessa risposta.

# Trappole (trovate dalla Revisione)
- **Risposta «in tempo» o tardiva.** `rispondi()` chiama `suRispostaTardiva` **solo se nessuno aspetta** con `attendi`.
  - Con un hook trattenuto, le chat agganciate non ripartivano e restavano bloccate per sempre.
  - Adesso è la rotta della risposta che riprende sempre le `ancheChat`, con `riprendiChatBloccata`, che agisce solo se la chat è ancora `bloccata`.
  - Il contesto delle domande di fine turno porta `trattenuta: true`.
  - Una gemella di fine turno che riceve la risposta in tempo riprende la sorella che aveva chiesto da una notifica.
  - Una gemella con l'attesa scaduta entra nelle `ancheChat`.
  - `trattenuta` torna `false` quando l'attesa della chat proprietaria scade, e quando il servizio rilegge i contesti dal disco (dopo un riavvio nessun hook aspetta più).
- **I contesti si leggono prima di `rispondi`**: la risposta tardiva cancella il contesto.
- **Heredoc di Bash con Python:** `\b` diventa un backspace e `\n` un a capo vero. Le regex vanno scritte con Edit.
- **`GET /domande` mostra una sola domanda per autopilota.** Le altre sono `inFila`: nei test bisogna contarle con `registro.aperte(id)`.
