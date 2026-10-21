---
titolo: "Collaudo 0.84.0 — coordinazione e agente finito: 4 difetti trovati e corretti (perché c-34 restava «lavoro»)"
quando: 2026-10-21T22:45:00+02:00
tag: ["0.84.0", "collaudo", "autopilota", "agente-finito", "segnali", "trappola"]
---

Collaudo di c-66 (21/10) sui punti 3.2 e 3.4 della lista lavori, già in main
(c-57, c-59). Test: `tests/autopilot-host/collaudo-coordinazione-0-84-0.test.ts`.
Trovati 4 difetti; la Revisione ha chiesto di correggerli sullo stesso ramo
(21/10 sera): **corretti, escono con la 0.84.1** (la 0.84.0 era già uscita).

## Cosa funziona (provato)

- Le forme della riga `SEGNALE:` (fatto, bloccata con/senza motivo, aspetto
  c-N, aspetto — cosa, avanti); «fattore» non è un segnale; riga tutta in
  grassetto o fra apici letta.
- Il quadro unico ordina bloccate → in attesa → finite → avanti, conta le chiuse.
- Doppioni: stesso compito scritto diverso = doppione; un compito già fatto non
  si ridà; un avvio fallito e una Revisione sì; una chat «rimandata» non blocca.
- Agente finito: c-52 (Rilascio senza ramo) chiusa con `chiudiChat` va nel
  recupero; mai chi chiede, mai un'adottata, mai la chat dell'autopilota.

## Difetti e correzioni

**D1 — la causa vera di c-34 «lavoro» nell'elenco.** `riprendiAutopilota`,
`src/autopilot-host/server.ts:2015`: con `eraFinito` rimette a «lavoro» TUTTE
le chat e le riavvia (riga 2033), anche quelle col ramo unito o già nel
recupero. Dai dati veri di ap-f1e631f5: 20/10 23:33 c-34 chiusa (ramo unito);
21/10 03:24 autopilota «finito»; 06:08 «Riprendi» di Nicholas → tutte le chat
riaperte (subito dopo il programma ne richiude a raffica: c-13, c-14, c-27…
«ha finito da 5 minuti»); 09:48 c-34 riceve messaggi come chat al lavoro;
15:53 il supervisore la richiude. Con la 0.84.0 è peggio: una chat già
mandata nel recupero viene ripresa con `--resume`. **Corretto:** da
«finito» tornano al lavoro solo le chat non concluse (`chatConclusa` in
`posti.ts`: `conclusa`, `approvata` o `nelRecupero`). Se sono tutte concluse
riparte solo l'ultima (per `dal`, mai una nel recupero) per l'ultimo giro; se
non ce n'è nessuna si aprono i compiti in coda.

**D2 — Rilascio senza ramo mai nel recupero dopo T6.** `server.ts:3435` dà
`conclusa` solo alle chat con `ramo`; le chat di Rilascio (c-63, c-64) chiuse
dal «finito» restano fra le chiuse e non vanno mai nel recupero. **Corretto:**
`concluseAFine` in `posti.ts` (pura, provata senza git): conclusa ogni chat
che ha lavorato, con o senza ramo; non la Revisione né una mai partita.

**D3 — `**SEGNALE:** fatto` perso.** `senzaRigaSegnale` toglie la riga, ma
`rigaSegnale` non la legge (`pulisci` in `src/shared/segnali-flotta.ts:62`
toglie gli asterischi solo agli estremi; la regex di riga 72 vuole `:` subito
dopo «SEGNALE»). Il «fatto» diventa «avanti». **Corretto:** un'etichetta sola
`ETICHETTA` per leggere e togliere; vale anche `**SEGNALE**: …`.

**D4 — la conversazione ripristinata viene richiusa.** Se Nicholas fa
«Ripristina» e riapre la chat, è accesa, ferma e ancora `finita`:
`daChiudereDaSole` (`src/autopilot-host/posti.ts:122`) la richiude dopo 5
minuti e poi ogni 10. **Corretto:** una chat nel recupero da più di
`NEL_RECUPERO_SI_RICHIUDE_MS` (20 min) non si chiude più; prima resta un solo
nuovo tentativo, per la consegna «chiudi» persa.

## Altro visto, non provato

- c-62 è «lavoro» con 0 giri dal 21/10 16:55: probabile avvio mai partito
  rimasto appeso; da guardare con il punto blocchi.
- Pagina e app non mostrano ancora il segnale (già scritto da c-57).

## Stato (21/10 sera)

Ramo c-66 verde (servizio, renderer, condivisi, pty: 2978 test; `tsc` pulito), ultimo commit di codice `9f48c392`, aspetta la Revisione; c-68 ha le stesse correzioni: se ne unisce uno solo. Resta per la 0.84.1 il punto 2 della riga 5 (segnale in vista su pagina e app), non cominciato qui per non mescolarlo a un ramo in Revisione.

22/10, dopo l'installazione della 0.84.0: suite rilanciata sul ramo, ancora verde (272 file, 2978 test; `tsc` pulito). Il ramo torna alla Revisione.
