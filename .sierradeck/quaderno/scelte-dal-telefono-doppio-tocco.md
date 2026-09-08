---
titolo: "Le scelte dal telefono premute due volte: foto vecchia e domanda che ricompare (0.16.3)"
quando: 2026-09-08T13:10:00+02:00
tag: ["telefono", "scelte", "terminale", "bug", "android", "pagina"]
---

# Il difetto (Nicholas, 2026-09-08)

«Le domande quando compaiono e le premo non vengono sempre prese e si
ripresentano, e la chat però ha già proseguito con l'azione.» In realtà il
primo tocco era preso: era la domanda a ricomparire, e il secondo tocco
finiva nella domanda dopo.

# Perché

- `/api/scegli` controllava l'opzione sulla **foto** delle chat che la
  finestra manda al Core ogni 2 s (`client:chat`, `codaGrezza` dallo schermo
  xterm). Il telefono legge `/api/storia` ogni 2 s. Fra invio dei tasti,
  ridisegno di Claude Code, foto e lettura passano fino a ~4 s in cui la
  stessa domanda è ancora «viva» per tutti: l'app la rimostrava, il secondo
  tocco passava il controllo (foto ancora vecchia) e frecce+invio andavano
  nella domanda successiva o nel prompt.

# La correzione, su tre lati

- **Gestore** (`client-rotte.ts`): `/api/scegli` chiede lo schermo di
  adesso alla finestra (`deps.schermoDi` → `chiediRigheAlleFinestre(…,
  schermo=true)` → renderer `righeDiPty`, 24 righe) e ripiega sulla foto solo
  se nessuna finestra risponde. Dopo un invio riuscito ricorda per chat la
  **firma** della domanda (i testi delle opzioni, non il cursore che si
  muove prima dell'invio) e per `RISPOSTA_FRESCA_MS` = 8 s: `/api/dentro` e
  `/api/storia` non rimandano `scelte` uguali, e un secondo `/api/scegli`
  uguale torna 409 «gia mandata: aspetta che lo schermo cambi».
- **App Android** (`Chat.kt`): `sceltaRisposta` (firma, quando); nel giro di
  lettura, scelte con la stessa firma entro 8 s → nascoste. Serve con un
  computer vecchio e nel giro fra una lettura e l'altra. Il 409 con «mandata»
  ha il suo messaggio.
- **Pagina servita** (`client-pagina.ts`): stesso meccanismo (`sceltaRisposta`,
  `firmaScelte`, `SCELTA_RISPOSTA_MS`).

# Da sapere

- Se dopo 8 s la stessa domanda è ancora lì, è davvero lì (l'invio non è
  arrivato) e ricompare: si può ritoccare.
- `scelteDiTerminale` accetta un elenco numerato anche senza cursore
  («si assume la prima»): un elenco in prosa nella risposta di Claude può
  comparire come «sta aspettando che tu scelga». Non toccato: il tocco manda
  solo un invio vuoto, ma se disturba è il prossimo candidato.
