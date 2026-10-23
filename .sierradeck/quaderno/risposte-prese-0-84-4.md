---
titolo: "Risposte di Nicholas prese davvero dalle chat (0.84.4)"
quando: 2026-10-23T12:40:00+02:00
tag: ["domande", "risposte", "consegne", "registro", "0.84.4", "c-120"]
---

## Il caso vero (23/10)

Tre risposte «rifallo ancora» (06:39 per c-95, 06:40 per c-106, 07:22 per c-95) alla domanda del programma «Come vado avanti con …, che la Revisione ha già rimandato indietro N volte?». Dai dati del servizio (`autopiloti/ap-f1e631f5-….json` e `autopiloti/istruzioni/…`):

- erano tutte **risposte tardive** (l'attesa della chat era già scaduta): `suRispostaTardiva` → `riprendiChatBloccata` → consegna c-851, c-852, c-869;
- le consegne risultano «partita» nelle Istruzioni, ma nel registro (`log/sierradeck-2026-10-23.log`) non c'era nessuna riga del servizio che dicesse «la chat l'ha presa»: la riga `risposta tardiva (c-95): …` si scriveva **prima** della consegna, e la conversazione la leggeva già come «l'ha ricevuta»;
- **il perché sbagliato**: la consegna per c-106 portava «risposta tardiva (c-95)», e quella per c-95 delle 07:22 portava «apro la chat c-118…». Causa: `riprendiChatBloccata` salvava la riga ma passava ad `avviaLavoro` l'autopilota di prima, e `percheRecente` prendeva la riga precedente.
- **la risposta persa in silenzio**: se la chat non era più `bloccata` (alle 06:44 c-95 e c-106 erano state rimesse al lavoro con «Riprendi da dove eri»), `riprendiChatBloccata` non faceva niente. Lo stesso per una domanda senza contesto e per la chat sola non più in `attesa`.

## Come funziona adesso

Una risposta conta **solo quando la chat la riceve**:

1. **La chat aspetta con il turno aperto** (hook trattenuto): la riceve subito con la risposta all'hook. Riga `[domande] … presa da c-N: la aspettava`.
2. **Arriva dopo l'attesa**: parte una consegna, e la risposta è «in viaggio» in `risposteInViaggio` dell'autopilota (salvata su disco, sopravvive al riavvio). Riga `in viaggio con la consegna c-N`.
3. **La consegna risulta partita** (`/consegne/esito` partita): riga di decisione `risposta presa (c-N): …` e nel registro `presa da c-N`.
4. **Non parte** (non partita, non consegnata, persa, sostituita): **una** riconsegna con lo stesso testo (`risposta non presa (c-N): … la riconsegno una volta`). Se una consegna vecchia parte dopo, vale lo stesso come presa.
5. **Non parte neanche la seconda volta, o la chat non aspetta più** (ripartita, finita, sparita, autopilota fermo, contesto perso): `risposta al supervisore (c-N): …` e la risposta entra nel **dialogo** come istruzione (`dialogaDaSolo`): il supervisore la legge con il quadro intero e la esegue (messaggio alla chat, compito, cambio). La sua battuta compare nella conversazione.

Sotto «Hai risposto: …» (PC, pagina, app: tutti leggono `conversazione()`; nelle Domande di pagina e app c'è una nota sotto) si legge: «Ricevuta: la sto portando a …», «Presa: … l'ha ricevuta e riprende il lavoro», «Non presa … la riconsegno», «Non presa …: l'ho data al supervisore come istruzione, non va persa». Non tocca `android/`: l'app mostra già il `dettaglio` delle battute.

## Dove

- `src/shared/risposte-in-viaggio.ts`: forma, lettura, righe del diario, testo per il supervisore.
- `src/autopilot-host/server.ts`: `riprendiChatBloccata`, `portaRisposta`, `esitoConsegnaRisposta`, `rispostaAlSupervisore`, `dialogaDaSolo`; agganci in `/consegne/esito` e in `riportaInCoda`.
- `src/shared/chat-autopilota.ts` (`esitoRisposta`), `diario-autopilota.ts`, `storico.ts`, `domande-conversazioni.ts`.
- Test col caso vero: `tests/autopilot-host/risposte-prese-0-84-4.test.ts`.

## Trappole

- `avviaLavoro` del servizio ora torna `{ consegna }` o `{ rifiutata }`: in prova (nessun id) la risposta si scrive ma non si segue, e la conversazione resta su «la sto portando».
- Due domande uguali aperte: la prima risposta vale anche per l'altra (regola 0.81.0); nei test aprire una domanda sola se si vuole contare le consegne.
- `parseAutopilota` vuole `versione: 1`: rileggere un autopilota senza versione dà `undefined`.
