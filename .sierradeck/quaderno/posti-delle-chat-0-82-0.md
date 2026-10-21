---
titolo: "Quante chat lavorano insieme: i posti decisi dal PC (0.82.0)"
quando: 2026-10-21T02:10:00+02:00
tag: ["autopilota", "posti", "carico", "0.82.0", "trappola"]
---

Dalla 0.82.0 il numero di chat degli autopiloti **al lavoro insieme** non è più
8 per autopilota: lo decide il PC, e vale per **tutti gli autopiloti insieme**.

## Dove sta
- `src/shared/posti-chat.ts` — le regole pure (`postiDalPc`, `prossimiPosti`) e i
  testi «N di M chat» / il «?» (`rigaPosti`, `spiegaPosti`), uguali su PC,
  pagina e app (la pagina e l'app li ricevono già scritti in `/api/stato`).
- `src/autopilot-host/misura-pc.ts` — processori, memoria libera, carico.
- `src/autopilot-host/posti.ts` — chi conta come «al lavoro», il tetto dentro i
  posti, quali chat finite chiudere da sole.
- Nel servizio (`server.ts`): `aggiornaPosti` e `chiudiFiniteDaSole` nel giro
  del guardiano (ogni minuto), `tettoNeiPosti` in `apriChatMancanti` e nella
  ripresa delle chat in pausa, `GET /posti-chat`.

## La regola
- Processori: 3 chat ogni 4. Memoria: le chat al lavoro + una ogni 800 MB liberi
  oltre una riserva di 2 GB. Vale il più piccolo; minimo 2, massimo 8.
- Carico (media mobile degli ultimi ~3 minuti): ≥70% → ×¾, ≥85% → metà.
- Scende subito, risale **di un posto ogni 3 minuti** e solo se il PC resta libero.
- «Più chat» ×1,5 / «Meno chat» ×⅔ (Impostazioni → Chat e autopiloti, preferenza
  `postiChat`, arriva al servizio con lo stato del programma). Cambiarla vale
  subito, senza la salita lenta.
- Le chat in più restano nei `compitiDaFare` e si dice una volta «in fila: parte
  quando si libera un posto». Chi lavora già **non si ferma mai** se il PC si carica.
- Chiusura da sole (consegna `chiudi`, come la «chiudi» del telefono: claude.exe
  spento, riquadro chiuso, conversazione fra le chiuse): chat `finita` e ferma
  al prompt da 5 minuti; chat di un autopilota finito/fermato da 30 minuti senza
  domande aperte. Mai una chat che lavora, mai una adottata, mai una `bloccata`.
  «Ferma al prompt» lo dice il programma (`ferma` nello stato del programma).

## Trappole
- **Su Windows `os.loadavg()` è sempre `[0,0,0]`.** Il carico si calcola dai
  tempi di `os.cpus()` fra due letture.
- **La prima misura non sapeva il carico** (21/10, trovato misurando): il
  servizio misurava per la prima volta alla ripresa delle flotte, subito dopo
  aver creato il misuratore → carico 0 → su un PC pieno apriva 6 chat invece di
  3. Ora la prima lettura si fa alla creazione e la primissima misura aspetta
  (con `Atomics.wait`, senza CPU) il secondo che manca. Letture a meno di 1 s
  l'una dall'altra non si confrontano: sono rumore.
- **«Ferma» non vuol dire «aspetta»**: `aspetta` è vero anche con una scelta o
  un permesso aperto. Una chat così non si chiude (`ferma` esclude `sceltaAperta`).
- Una `chiudi` persa (5 tentativi, nessuna finestra) non blocca il posto per
  sempre: dopo `RICHIUDI_DOPO_MS` (10 min) la chat ancora accesa si richiude.
  E `chiudi` non conta fra le consegne in attesa: non apre finestre da sola.
- Le chat finite **senza `dal`** (nate prima della 0.81.0) usano
  `ultimoEvento` dell'autopilota, che ogni `salva` sposta: le loro chiusure da
  sole possono slittare. Non è grave (si chiudono più tardi, mai prima).
- Lo stato del programma porta al massimo 80 chat: oltre, le altre non si
  chiudono da sole.
- **Un autopilota con compiti ma ancora senza chat non occupa un posto.** La chat
  singola conta solo se ha la sua `sessionId`; prima della correzione la flotta
  nuova si contava come «una al lavoro» e apriva una chat in meno.
- **Nei test l'archivio rimette `sospeso` un autopilota `lavoro` senza criteri**:
  le prove del servizio vogliono almeno un criterio.
- **Il freno senza limiti letti dà tetto 2** (`TETTO_SENZA_LIMITI`): per provare i
  posti nel servizio bisogna mandare dei limiti bassi con `/stato-programma`.
- Un autopilota con **una chat sola** (senza git o lavoro piccolo) parte sempre:
  la fila vale per le chat della flotta e per le riprese dalla pausa.
