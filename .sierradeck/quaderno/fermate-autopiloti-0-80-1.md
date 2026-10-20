---
titolo: "0.80.1: gli autopiloti non si fermano più per una chat muta, un supervisore muto o un criterio scaduto"
quando: 2026-10-20T12:00:00+02:00
tag: ["0.80.1", "autopilota", "guardiano", "supervisore", "criteri"]
---

# Perché
Il 19/10 ci sono state 6 sospensioni per «una chat non dà segnali» e 1 per «il supervisore non ha detto se il lavoro è concluso». Nicholas ha chiesto una patch prima della 0.81.0 (c-184). Ramo `ap/ap-f1e631f5/c-12-0-80-1`, fatto a partire da v0.80.0 (a22c1df), non da main.

# Cosa cambia
1. **Chat muta → messa da parte, non sospensione.**
   - In `controllaChatFerme` (server.ts) `chiTace` non porta più a `stato: 'sospeso'`. La chiave della chat (`chatId`, o l'id dell'autopilota se la chat è una sola) finisce in `Autopilota.daParte`.
   - Si scrive una decisione con il traguardo `esito: 'da-parte'`. `rigaTraguardo` la mostra come riga nella conversazione.
   - L'autopilota resta `lavoro`.
   - `chiTace` salta le chiavi in `daParte`, così la riga non si ripete.
   - Appena la chat chiude un turno, `tornaDaParte` (in `suStopMisurato`) la rimette nel conto.
2. **Supervisore che non risponde → riprovato subito una volta.**
   - Dopo la seconda volta decidono le regole. Se i criteri sono tutti verdi, `dalleRegole` (rete-sicurezza.ts) non restituisce più `sospendi` ma `prosegui` con `istruzioniRiprova`, cioè si rifà il giro.
   - Un giro a vuoto vero lo ferma ancora l'antiloop (3 giri uguali con il codice fermo).
3. **Criterio rosso per tempo scaduto → rimisurato una volta.**
   - `eseguiCriteri` (verifiche.ts) riconosce la riga `[comando interrotto dopo Ns]` con `scadutoPerTempo` e riesegue il comando.
   - Se scade di nuovo, è rosso davvero e l'uscita lo dice.

# Trappole
- **`daParte` si prende dal disco a fine turno** (`conservaCambiUtente`), come `tettoChat` e `limiti`.
  - Il guardiano lo scrive ogni 30 s, mentre un turno dura minuti.
  - Con la fotografia di inizio turno si perdeva una sorella messa da parte, o se ne resuscitava una già tornata. L'ha trovato la Revisione.
- **Limite noto:** se l'autopilota ha una chat sola, o tutte le sue chat sono da parte, l'autopilota resta «al lavoro» ma nessuno lavora.
  - Lo dice solo la riga nella conversazione: niente notifica.
  - È la richiesta di Nicholas («non sospende più»). Se serve, nella 0.81.0 si aggiunge una notifica «errore che blocca».
- **Un test vecchio passava per caso:** «eliminare chiude anche le sue domande» usava un formato del supervisore che non esiste più (`domandaUtente`).
- **Heredoc di Bash con Python:** `\\n` diventa un a capo vero dentro le stringhe TS. Per i testi con `\n` meglio usare Edit.
- La pagina e l'app non leggono l'`esito` del traguardo, solo `tono` e testo: un esito nuovo non richiede cambi su `android/`.
