---
titolo: "Trappola: test che dipendono dal giorno o dal carico del PC"
quando: 2026-10-24T00:30:00+02:00
tag: ["test", "criteri", "trappola", "0.85.1"]
---

La notte del 23→24/10 il criterio «gli altri test passano» è diventato rosso senza che il codice fosse cambiato. I test (corretti da c-146, commit `fb98ee8b` e `070b93e7`) erano:

- **`richieste-nicholas-0-85-0.test.ts`**: si aspettava `giorno: '23/10'` per una richiesta scritta *adesso*. Dopo mezzanotte diventa «24/10». Regola: se il dato nasce da `Date.now()`, il valore atteso va calcolato con la stessa funzione (`giornoDi(new Date().toISOString())`), mai scritto fisso. Le date fisse vanno bene solo se il test fissa anche l'ora.
- **`collaudo-mai-fermo-0-84-1.test.ts`** (la notte intera, 440 minuti simulati uno per uno): 31 s col PC carico, oltre i 20 s comuni. Ha ora un limite suo di 120 s.
- **`campo-autopilota-fluido.test.tsx`**: misurava il disegno della chat intera 45 volte. Ogni disegno costa 400-600 ms, quindi con il PC carico superava i 20 s di limite del test. Regola: nei test di misura, poche ripetizioni per la parte lenta e un limite di tempo esplicito.

Se un criterio di test diventa rosso di notte o con molte chat aperte, controlla per primo questi casi prima di sospettare il codice.
