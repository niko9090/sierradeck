---
titolo: "0.84.0 — Controllo e coordinazione: i segnali delle chat e nessun compito doppio"
quando: 2026-10-21T18:30:00+02:00
tag: ["0.84.0", "autopilota", "flotta", "segnali", "coordinazione", "trappola"]
---

Punto 3.2 della lista dei lavori. Fatto da c-57 sul suo ramo, il 21/10.

## Come funziona

- **Ogni chat della flotta chiude il turno con una riga** `SEGNALE: avanti | fatto | bloccata — motivo | aspetto c-N | aspetto — cosa`. La regola le arriva nel primo messaggio (`regoleDiConsegna` in `nel-mosaico.ts`). **Non alla Revisione**: la sua ultima riga deve restare `REVISIONE: OK/DA RIFARE`.
- **«Parto»** non lo scrive la chat: è il primo hook che arriva da lei (un comando o una notifica, `segnaPartenza` in `server.ts`).
- Senza la riga, un «aspetto c-12» detto a parole vale lo stesso (`chatAttesa`); se no vale «avanti».
- Il segnale sta sulla chat: `ChatGovernata.segnale` (`@shared/segnali-flotta`). Si conserva su disco (`parseChat` lo legge: **un campo nuovo della chat che non passa da `parseChat` sparisce al primo salvataggio**).
- Un segnale che chiede una decisione (fatto, bloccata, aspetto) si scrive **una volta** nelle decisioni: «segnale da c-1: bloccata: …». Lo stesso segnale al giro dopo non si ripete.
- **Il quadro unico**: `quadroFlotta` mette nel prompt del supervisore tutte le chat aperte con il loro segnale, prima quelle bloccate, che aspettano o dicono «fatto». Decide lui (chiudiChat, istruzioni, chiudere).
- Le attese fra chat (0.82.1, `attese-chat.ts`) adesso partono dal segnale.
- `domandaInFondo` toglie la riga `SEGNALE:` finale: la domanda prima del segnale resta la domanda.

## Nessun lavoro dato due volte

- `chiHaGia` / `codaSenzaDoppioni`: stesso compito = stesso testo senza maiuscole, accenti, punteggiatura. Ce l'ha una chat aperta, o una chiusa che ci ha lavorato (cicli > 0).
- **Non sono doppioni**: un avvio fallito (cicli 0, `dopoAvvioFallito` lo rimette in coda) e una Revisione chiusa (si riusa per lo stesso ramo).
- Si controlla in `apriChatMancanti` prima di aprire (il doppione esce dalla coda e si scrive perché) e sulla mossa `apriChat` del supervisore (rifiutata).

## Trappola trovata e corretta

Una chat aperta con la mossa `apriChat` in un turno «prosegui» **spariva dall'archivio**. `apriChatMancanti` la salvava, poi il salvataggio del turno (`salva(inCerchio)`) riscriveva la copia di prima. Il processo restava vivo ma orfano, e il compito tornava in coda, pronto per una seconda chat. Adesso, dopo l'apertura, la fermata rilegge chat, coda e decisioni dal disco (blocco `if (apriDopo)`). Il test è in `server.test.ts`: «prima di aprire una chat si controlla…».

## Test

- `tests/shared/segnali-flotta.test.ts`: lettura dei segnali, quadro, doppioni, conservazione su disco.
- `tests/autopilot-host/server.test.ts`: i tre casi «(0.84.0)» sul servizio vero.

## Cosa manca

Pagina e app non mostrano ancora il segnale. Il dato arriva già con `GET /autopiloti` (`chats[].segnale`), e `parolaSegnale` dà la parola da mostrare.
