---
titolo: "Agente finito (0.84.0): la chat si chiude e la conversazione va nel recupero"
quando: 2026-10-21T18:29:25+02:00
tag: ["autopilota", "0.84.0", "gestione-chat", "recupero"]
---

**Cosa fa.** Quando una chat della flotta ha finito il suo compito **e** il suo ramo è
chiuso (unito nel principale, o già tolto), l'autopilota la chiude da sola, la toglie
dall'elenco e manda la conversazione nel recupero di 30 giorni. Si rimette con un tocco:
«Ripristina» nella gestione delle chat (PC, pagina, app: c'era già dalla 0.79.0).

**Come è fatto (ramo c-59, 21/10).**
- `ChatGovernata.conclusa = { il, come: 'unito' | 'tolto' }`: la scrive il servizio dove il
  ramo si chiude davvero: `chiudiChat` con ramo già unito o mancante, unione riuscita in
  `chiudiChat`, unione finale T6. Con `approvata: true` (Revisione + unione) vale lo stesso.
- `agenteFinito(a, c)` in `autopilot-host/posti.ts` decide. **No** se: ramo in Revisione
  (può tornare indietro), chat adottata (non è nostra), chat dell'autopilota stesso, già
  mandata (`nelRecupero`). Una Revisione è finita solo quando il ramo che rivedeva è
  approvato: prima riusa la sua conversazione.
- `daChiudereDaSole` la mette fuori con `alRecupero: true` anche se è già spenta (prima
  restava nell'elenco per sempre), **mai** se il programma la vede al lavoro, e solo dopo
  `FINITA_SI_CHIUDE_MS` (5 min, il tempo di leggere l'ultima risposta).
- Il servizio segna `nelRecupero` (una volta sola: se Nicholas la ripristina, resta) e
  scrive la riga con traguardo `nel-recupero` nella conversazione dell'autopilota.
- La consegna `chiudi` porta `alRecupero`; il main, dopo aver chiuso il riquadro, chiama
  `nelRecuperoQuandoChiusa` (`main/agente-finito.ts`) che usa «Elimina dal PC» della
  gestione chat: quindi `cancellaSicura`, recupero di 30 giorni, stessi rifiuti (al lavoro,
  chiede, altro PC). Riprova 12 volte ogni 5 s finché il riquadro non è chiuso.
- `governataDa` non conta più come «governata» una chat con `nelRecupero`: senza, la
  gestione rifiutava l'eliminazione perché l'autopilota è attivo.

**Trappole.**
- La consegna `chiudi` non conta fra le «in attesa»: senza una finestra aperta aspetta che
  se ne apra una. Il recupero quindi può arrivare più tardi, non si perde.
- Il lettore dell'archivio (`shared/autopilota.ts`, lettura delle chat) scarta i campi che
  non conosce: un campo nuovo su `ChatGovernata` va aggiunto anche lì, altrimenti sparisce
  al primo salvataggio (il primo test falliva per questo).
- Le chat finite prima di questa versione non hanno `conclusa`: si chiudono come nella
  0.82.0 (la conversazione resta fra le chiuse), non vanno nel recupero.
