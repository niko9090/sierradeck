---
titolo: "Collaudo 0.84.0 — coordinazione e agente finito: 4 difetti, tutti corretti (perché c-34 restava «lavoro»)"
quando: 2026-10-21T21:20:00+02:00
tag: ["0.84.0", "collaudo", "autopilota", "agente-finito", "segnali", "trappola"]
---

Collaudo di c-66 (21/10) sui punti 3.2 e 3.4 della lista lavori, già in main
(c-57, c-59). Test: `tests/autopilot-host/collaudo-coordinazione-0-84-0.test.ts`
(12 verdi + 4 `it.fails`, uno per difetto: corretto il difetto, il test
diventa rosso e si toglie `.fails`).

## Cosa funziona (provato)

- Le forme della riga `SEGNALE:` (fatto, bloccata con/senza motivo, aspetto
  c-N, aspetto — cosa, avanti); «fattore» non è un segnale; riga tutta in
  grassetto o fra apici letta.
- Il quadro unico ordina bloccate → in attesa → finite → avanti, conta le chiuse.
- Doppioni: stesso compito scritto diverso = doppione; un compito già fatto non
  si ridà; un avvio fallito e una Revisione sì; una chat «rimandata» non blocca.
- Agente finito: c-52 (Rilascio senza ramo) chiusa con `chiudiChat` va nel
  recupero; mai chi chiede, mai un'adottata, mai la chat dell'autopilota.

## Correzioni (c-68, 21/10, ramo `ap/ap-f1e631f5/c-68`, per la 0.84.1)

Tutti e 4 **corretti**, tolto `.fails`, test verdi (16 nel file):

- **D1 corretto** — `riprendiAutopilota`: da un autopilota finito ripartono solo
  le chat senza `conclusa`, `approvata` o `nelRecupero`. Se sono tutte
  concluse si aprono solo i compiti in coda; un messaggio per l'autopilota
  parte con la sua chat (altrimenti resterebbe appeso). Tolto il test
  «fotografia» del comportamento vecchio.
- **D2 corretto** — a T6 ricevono `conclusa` anche le chat senza ramo (tranne
  le Revisioni); `agenteFinito` considera conclusa una chat `finita` senza
  ramo di un autopilota `finito` (vale anche per c-63/c-64 già in archivio).
- **D3 corretto** — `rigaSegnale` e `senzaRigaSegnale` accettano asterischi,
  trattini bassi e apici fra «SEGNALE» e i due punti, e dopo.
- **D4 corretto** — `daChiudereDaSole` salta del tutto una chat con
  `nelRecupero`: è andata nel recupero una volta, se è accesa l'ha rimessa
  Nicholas. Prezzo: se la chiusura verso il recupero si perde, non si
  riprova da qui (la chiusura vera la fa `nelRecuperoQuandoChiusa`).

## Difetti trovati da c-66 (descrizione originale)

**D1 — la causa vera di c-34 «lavoro» nell'elenco.** `riprendiAutopilota`,
`src/autopilot-host/server.ts:2015`: con `eraFinito` rimette a «lavoro» TUTTE
le chat e le riavvia (riga 2033), anche quelle col ramo unito o già nel
recupero. Dai dati veri di ap-f1e631f5: 20/10 23:33 c-34 chiusa (ramo unito);
21/10 03:24 autopilota «finito»; 06:08 «Riprendi» di Nicholas → tutte le chat
riaperte (subito dopo il programma ne richiude a raffica: c-13, c-14, c-27…
«ha finito da 5 minuti»); 09:48 c-34 riceve messaggi come chat al lavoro;
15:53 il supervisore la richiude. Con la 0.84.0 è peggio: una chat già
mandata nel recupero viene ripresa con `--resume`. Correzione attesa: alla
ripresa restano chiuse le chat con `conclusa`, `approvata` o `nelRecupero`.

**D2 — Rilascio senza ramo mai nel recupero dopo T6.** `server.ts:3435` dà
`conclusa` solo alle chat con `ramo`; le chat di Rilascio (c-63, c-64) chiuse
dal «finito» restano fra le chiuse e non vanno mai nel recupero.

**D3 — `**SEGNALE:** fatto` perso.** `senzaRigaSegnale` toglie la riga, ma
`rigaSegnale` non la legge (`pulisci` in `src/shared/segnali-flotta.ts:62`
toglie gli asterischi solo agli estremi; la regex di riga 72 vuole `:` subito
dopo «SEGNALE»). Il «fatto» diventa «avanti».

**D4 — la conversazione ripristinata viene richiusa.** Se Nicholas fa
«Ripristina» e riapre la chat, è accesa, ferma e ancora `finita`:
`daChiudereDaSole` (`src/autopilot-host/posti.ts:122`) la richiude dopo 5
minuti e poi ogni 10. Va saltata una chat con `nelRecupero`.

## Altro visto, non provato

- c-62 è «lavoro» con 0 giri dal 21/10 16:55: probabile avvio mai partito
  rimasto appeso; da guardare con il punto blocchi.
- Pagina e app non mostrano ancora il segnale (già scritto da c-57).
