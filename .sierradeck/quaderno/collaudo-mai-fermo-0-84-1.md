---
titolo: "Collaudo 0.84.1 — autopilota mai fermo: 2 difetti trovati"
quando: 2026-10-22T11:30:00+02:00
tag: ["0.84.1", "0.84.3", "collaudo", "autopilota", "guardiano", "mai-fermo"]
---

Collaudo di c-81 (22/10) sulla correzione di c-72 (`src/autopilot-host/mai-fermo.ts`,
come funziona: `autopilota-mai-fermo-0-84-1.md`). Test in
`tests/autopilot-host/collaudo-mai-fermo-0-84-1.test.ts`: servizio vero, minuto
per minuto, su tempi lunghi.

## Cosa regge (6 test verdi)

- **La notte intera, 23:34 → 06:51**, chat che non rispondono mai: il primo giro
  entro 15 minuti, poi mai un buco più lungo di 15 minuti fra un giro e l'altro.
  In ogni minuto ogni compito è di una sola chat al lavoro. Al massimo 2 chat
  nuove per compito, poi solo riprese. Ogni vecchia chiusa e mandata nel recupero
  una volta sola. Id tutti diversi. Una riga sola a Nicholas per compito.
- Una chat che **lavora davvero per 2 ore** (battiti del Gestore, nessun turno
  chiuso): mai interrotta, mai riscritta, mai sostituita.
- Una chat che **aspetta Nicholas** (bloccata) per 3 ore: intatta. Nessun compito
  «Riprendi il lavoro» aperto al suo posto. La sorella muta viene ripresa.
- **Dopo «Installa»** (`/pausa-aggiornamento`) per un'ora: nessun giro, nessuna
  chat interrotta, chiusa o aperta. Dopo `/gestore-avviato` il giro riparte entro
  15 minuti.
- **Riavvio a metà**, dopo le riprese: nessuna chat nuova prima di 10 minuti dal
  riavvio, poi tre chat nuove senza doppioni. A un secondo riavvio le vecchie
  (finite, nel recupero) non ripartono.
- **«Finito» con un criterio rosso**: rifiutato.

## Difetti (test con `.fails`: quando li si corregge diventano rossi, e il `.fails` va tolto)

**D1, medio — una chat muta dall'avvio del servizio resta abbandonata finché una sorella lavora.**
- Causa: `/battiti` segna anche la chiave dell'autopilota
  (`src/autopilot-host/server.ts:3985`), e `chiTace` usa quella chiave come
  ripiego per la chat che non ha segnali suoi (`src/autopilot-host/guardiano.ts:154-155`).
  La chat muta eredita i battiti della sorella, non viene mai messa da parte, e
  `giroMaiFermo` tocca solo le messe da parte o le già riprese
  (`mai-fermo.ts`, `daToccare`).
- Quando capita: dopo ogni riavvio del servizio, per una chat ferma al prompt
  senza niente in coda o col terminale chiuso, mentre un'altra lavora.
- Passi: autopilota con c-1 e c-2 al lavoro. Battiti solo per c-1 ogni minuto
  per 120 minuti. Risultato: c-2 mai messa da parte, mai ripresa.
- Correzione possibile: per una chat della flotta il ripiego deve essere la
  chat stessa (`dal`, avvio del servizio), non l'autopilota. Il ripiego
  sull'autopilota serviva alle flotte nate prima della misura per chat.

**D2, lieve — una consegna del servizio vale come «ha risposto».**
- Causa: `avviaLavoro` fa ripartire l'orologio del silenzio
  (`src/autopilot-host/server.ts:926`). `mossaPer` (`mai-fermo.ts`, `haRisposto`)
  legge quell'orologio come una risposta della chat dopo la ripresa.
- Effetto: dopo un riavvio la ripresa d'avvio cancella la ripresa da solo. La
  chat muta viene interrotta e ripresa un'altra volta, e passa a una chat nuova
  10 minuti più tardi (circa 20 minuti dal riavvio invece di 10). Lo stesso
  succede coi messaggi in coda portati alla chat ferma.
- Passi: caso della notte. Giro da solo con le tre riprese, riavvio 5 minuti
  dopo, `riprendiLavori({ servizioAppenaPartito: true })`. Dopo 15 minuti nessuna
  chat nuova.
- Correzione possibile: per `haRisposto` contare solo i segnali della chat
  (hook, battiti), non l'orologio rimesso da `avviaLavoro`.

## Corretti nella 0.84.3 (c-87, 23/10)

- **D1**: `chiTace` (`guardiano.ts`) per una chat con `dal` ripiega su
  `max(dal, avvio del servizio)`, non più sulla chiave dell'autopilota. Il
  ripiego sull'autopilota resta solo per le chat senza `dal` (flotte vecchie).
  Il server passa `avvioServizio` a `chiTace`.
- **D2**: le consegne del servizio stanno in una mappa a parte
  (`ultimaConsegna` in `server.ts`). `ultimoSegnale` le conta ancora (orologio
  del silenzio come prima), ma `giroMaiFermo` riceve `ultimaRisposta` =
  `segnaleDellaChat` (solo hook e battiti) per decidere «ha risposto».
  Trappola: se si torna a scrivere in `ultimoTurno` da `avviaLavoro`, D2 torna.
- **Il motivo vero**: il giro non scrive più «apro le chat, se il PC ha posto».
  `aperturaPossibile` (server) calcola quante chat si aprirebbero e, se
  nessuna, perché (compiti che aspettano altri lavori, PC senza posto, tetto,
  freno solo-Revisioni, compito già di una chat); `giroMaiFermo` lo riceve come
  `vista.apertura` e la riga dice «apro N chat» o «non apro niente: …».
- I due `it.fails` ora sono `it` verdi; il test del riavvio chiede il passaggio
  entro 15 minuti (prima 25).

## Non provato qui

La prova di 2 ore nella copia di prova la sta facendo c-72 (numeri a metà nel
commit `c0576f48`, sul suo ramo). Non ne ho fatta una seconda in parallelo: due
copie di prova insieme si contendono il PC e falserebbero i numeri.

## Trappola: la Revisione e `node_modules`

Il 22/10 la Revisione ha respinto questo ramo («test e TypeScript rotti») senza
nessun difetto nel codice: a fine lavoro avevo tolto con `rmdir` la giunzione
`node_modules` dalla copia, e la Revisione misura i criteri **nella copia della
chat**. Senza la giunzione `vitest` e `tsc` non partono. Con il ramo portato su
main (`e7a67471`) e la giunzione rimessa: TypeScript pulito, 3051 test verdi più
i 2 `.fails`. Era già successo a c-70. Finché il ramo aspetta la Revisione, la
giunzione resta; si toglie (sempre con `rmdir`, mai una cancellazione ricorsiva)
quando la chat viene chiusa.
