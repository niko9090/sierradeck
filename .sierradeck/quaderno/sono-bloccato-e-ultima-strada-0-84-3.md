---
titolo: "0.84.3 — «Sono bloccato» in parole semplici, l'ultima strada, la domanda che non ferma"
quando: 2026-10-23T02:30:00Z
tag: ["autopilota", "domande", "0.84.3", "mai fermo"]
---

Caso vero del 22/10: «Come vuoi che proceda?» con le scelte «rivedi i criteri / ti dico io la strada /
fermati». Non diceva di quale lavoro né cosa non passava, e «rivedi i criteri» chiedeva a Nicholas un
lavoro a mano. (I gesti a mano, «lo giudico io» e la chiusura con criteri non misurabili sono di c-89:
`gesti-a-mano-e-criteri-giudicati-0-84-3.md`. Qui il resto, ramo c-95.)

**Come funziona adesso**

- `chiediBloccato` (`src/autopilot-host/decisione.ts`) è l'unica fonte della domanda, per le regole e
  per la rete di sicurezza. Porta `bloccato: { falliti, tentativi, errori }` sulla mossa.
- `partiBloccato` (`src/shared/domanda-strutturata.ts`): frase in vista «‹lavoro›: il controllo «X» non
  passa. Come vado avanti?» (o «non riesce nemmeno a partire»). `nomeControllo` toglie sigle e nomi
  interni («i difetti D1 e D2 del collaudo» → «i difetti del collaudo»), altrimenti `scartaSeNonVa` la
  butterebbe. Scelte fisse: «Lascia stare quel controllo e vai avanti» (consigliata), «Ti scrivo io
  cosa provare», «Sospendi l’autopilota».
- **Ultima strada** (`src/autopilot-host/ultima-strada.ts`, nel ramo `chiediUtente` di `server.ts`):
  in una flotta il compito passa a una chat nuova (`chatCheSostituisce` di mai-fermo, stessa cartella e
  stesso ramo, `ultimaStrada: true`) che rilegge gli errori; la vecchia va nel recupero. Con una chat
  sola la stessa chat riceve l'istruzione, una volta dopo l'ultima risposta di Nicholas.
- **La domanda che non ferma**: la prima volta il turno non è trattenuto (contesto `bloccato.continua`),
  la chat resta `lavoro` e lavora al resto. Se torna a fermarsi sullo stesso controllo, la domanda è già
  aperta (gemella) e allora aspetta trattenuta come prima.
- **Le scelte le esegue il programma** (`eseguiRispostaBloccato`): «lascia stare» → `criterio.giudicato`;
  «sospendi» → autopilota `sospeso` e tutte le chat ferme; testo libero → alla chat così com'è. Se la
  chat sta lavorando, la risposta va in `daConsegnare` (le arriva alla fine del turno).
- Le vecchie «Come vuoi che proceda?» aperte: `eVecchiaBloccato` in `domandaDaNonFare` → superate, la
  chat riparte rileggendo gli errori.
- **Sotto ogni scelta cosa succede**: `SceltaScheda.conseguenza` (dalle parti, o dalla `descrizione`
  delle opzioni di Claude Code, quindi anche dagli altri PC). PC `SchedaDomandaVista.tsx`, pagina
  `sceltePagina` in `client-pagina.ts`, app `SchedaDomandaVista.kt`. Il «?» resta con «Cosa succede con
  ogni scelta» per le app vecchie.

- **Le risposte da scrivere** (Revisione): «Ti scrivo io cosa provare» ha `libera: true`
  (`SceltaDomanda` → `SceltaScheda`). Al tocco apre il campo e non risponde: `toccoScelta` sul PC,
  `tastoScrivi` nella pagina, `apreIlCampo` nell'app. Se un'app vecchia manda la frase come testo,
  `POST /domande/:id/risposta` risponde 409 e la domanda resta aperta.

**Trappole**
- Una scelta che chiede a Nicholas di scrivere qualcosa va segnata `libera`, altrimenti il tasto manda
  la frase stessa come risposta e la domanda si chiude senza contenuto.
- Il controllo delle domande vale anche per quelle del programma: «Sospendi questo lavoro» è stata
  respinta da `RIFERIMENTI_VAGHI` («questo lavoro»). Prima di cambiare il testo di una scelta, passa il
  test `validaDomanda(...).completa`.
- `rispostaBloccato` riconosce le scelte dall'inizio del testo: cambiare le costanti `SCELTA_*` cambia
  anche le risposte già date (domande aperte prima di un aggiornamento finiscono nel testo libero).
- Le domande degli autopiloti non viaggiano fra PC (il battito porta solo le chat): «anche da un altro
  PC» vale per le opzioni spiegate delle chat.

Test: `tests/autopilot-host/sono-bloccato-0-84-3.test.ts`, `SceltaSpiegataTest.kt`.
