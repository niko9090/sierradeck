---
titolo: "Trappola: test che dipendono dal giorno o dal carico del PC"
quando: 2026-10-24T00:30:00+02:00
tag: ["test", "criteri", "trappola", "0.85.1"]
---

La notte del 23→24/10 il criterio «gli altri test passano» è diventato rosso senza che il codice fosse cambiato. I test (corretti da c-146, commit `fb98ee8b`) erano:

- **`richieste-nicholas-0-85-0.test.ts`**: si aspettava `giorno: '23/10'` per una richiesta scritta *adesso*. Dopo mezzanotte diventa «24/10». Regola: se il dato nasce da `Date.now()`, il valore atteso va calcolato con la stessa funzione (`giornoDi(new Date().toISOString())`), mai scritto fisso. Le date fisse vanno bene solo se il test fissa anche l'ora.
- **`collaudo-mai-fermo-0-84-1.test.ts`** (la notte intera, 440 minuti simulati uno per uno): 31 s col PC carico, oltre i 20 s comuni. Ha ora un limite suo di 90 s (messo in parallelo anche da un'altra chat: c-146 aveva scelto 120 s, all'unione è rimasto quello di main).
- **`campo-autopilota-fluido.test.tsx`**: misurava il disegno della chat intera 45 volte. Ogni disegno costa 400-600 ms, quindi con il PC carico superava i 20 s di limite del test. Regola: nei test di misura, poche ripetizioni per la parte lenta e un limite di tempo esplicito.

Se un criterio di test diventa rosso di notte o con molte chat aperte, controlla per primo questi casi prima di sospettare il codice.

**`richieste-nicholas-0-85-0.test.ts` nel giro dell'hook (24/10 notte, c-143).** L'hook di fine turno lo ha dato fallito 3 volte con lo stesso testo troncato. Rifatto a mano subito dopo, lo stesso comando nella cartella principale ha passato 305 file su 305. Causa probabile, non provata: l'hook misurava mentre la chat lanciava i suoi giri completi, e `attendi` aspetta al più 4 s (160 × 25 ms). **Una chat non deve lanciare giri completi di test mentre l'hook sta misurando.** Prima di cambiare una prova, rifai il comando esatto del criterio a PC calmo. Se è verde, la prova non va toccata.

**Il file che cade cambia a ogni giro (24/10 notte, c-143).** Nel giro dell'hook è caduto prima `richieste-nicholas-0-85-0.test.ts`, poi `server.test.ts`. Rifatto da solo, `server.test.ts` passa 163 prove su 163. In quel momento il PC aveva il processore al 100%, con 18 processi claude e 21 processi node. Quando il file rosso cambia ogni volta, la causa è il carico, non il codice. La Guardia del PC che rimanda i criteri pesanti è in main (0.85.1, c-148). Il servizio installato è ancora la 0.85.0, quindi lì la guardia non lavora: si risolve con la 0.85.1 installata da Nicholas, non toccando i test.
