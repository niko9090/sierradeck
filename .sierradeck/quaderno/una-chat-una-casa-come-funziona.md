---
titolo: "Una chat, una casa: come è fatta (0.42.0) e dove guardare se qualcosa non torna"
quando: 2026-10-02T15:30:00+02:00
tag: ["drive", "sync", "multi-pc", "riordino", "sposta-progetto", "trappola"]
---

Il progetto (perché e regole) è in `2026-10-02-una-chat-una-casa-progetto.md`. Qui c'è com'è fatto, per chi deve metterci le mani.

# Pezzi

- **Le regole pure:** `src/shared/una-casa.ts`.
  - `decidiCasa`, `unisciCase`, `sessioneDiPercorso`;
  - `saleDaQui` e `scendeQui`;
  - `manifestoConProprietari` e `verificaMigrazione`;
  - `fuoriCasa`, `pianoRiordino`, `pianoAnnulla`;
  - `controlliSposta`, `verificaSposta`, `PASSI_SPOSTA` (con i testi dei passi).
- **Il disco:** `src/main/una-casa.ts`.
  - Le case: `case-chat.json` in userData e l'oggetto `case-chat` nella scatola del Drive.
  - Il riordino e l'annullamento: `riordini/<id>.json` e `recupero-riordino/<id>/<slug>/…`.
  - Le chat di qui vengono dall'**indice** (`listSessions(db)`), non dalla scansione del disco.
- **La procedura:** `src/main/sposta-progetto.ts`, dal lato di chi spedisce. Dal lato di chi riceve c'è `spostaGlobale` in `index.ts`, con le rotte `/api/sposta/pronto|ricevi|verifica` in `client-rotte.ts`, solo per il dispositivo `pc` (chiave di casa). Le rotte sono anche in `ROTTE_VIA_CANALE`, quindi funzionano via WebRTC.
- **La sincronia:**
  - `apriSincronia({ unaCasa })`: `salva` passa a `salvaIncrementale` `escludi` (le copie fuori casa non salgono) e `proprietario` (`pc` sulle voci `chat/`);
  - `arrivo` scarta le chat con `scendeQui` falso;
  - `migraUnaCasa(case)` fa copia, verifica, scrittura e rilettura. Se la rilettura trova una voce persa, rimette la copia di sicurezza.
- **Il giro:** `giroCasa` in `index.ts`, ogni 2 minuti (il primo dopo 45 secondi).
  - Unisce le case di qui con quelle sul Drive.
  - Una volta per PC fa la migrazione; il segno è `migrazione-una-casa.json` in userData. Se il file manca, la migrazione si rifà.
  - Poi segna le nascite: chat senza casa e mai viste sul Drive.
  - Rilegge il manifesto del Drive al massimo ogni 15 minuti.
- **L'interfaccia:**
  - `ModaleRiordina.tsx` e `ModaleSposta.tsx`, dalla scheda Drive (`PannelloDrive.tsx`);
  - i «Porta qui» del catalogo sono diventati testi che rimandano a «Sposta progetto…»;
  - dal telefono `/api/drive/porta` e `/api/drive/portaWorkspace` rispondono `ok: false` con la spiegazione.

# Trappole

- **`case` è una parola riservata** in TypeScript/JS: niente parametri chiamati così (si usa `cc`).
- **Nello stesso istante.** Due scelte di peso uguale (nicholas o sposta) fatte nello stesso istante: vince l'ultima arrivata (`>=`). Senza, «Annulla lo spostamento» non riportava la casa: era scritta nello stesso millisecondo del cambio, ed è stato visto nei test.
- **Annullare uno spostamento** riporta **sempre** la casa su questo PC. Il registro nasce dopo il cambio di casa, quindi la «casa di prima» lì dentro è già quella nuova.
- **Le chat aperte** non si spostano, né nel riordino né nell'archiviazione di «Sposta». Il riquadro va chiuso prima.
- **Una versione vecchia** dall'altra parte risponde 404 a `/api/sposta/pronto`. I controlli la chiamano «prima della 0.42.0»; `almeno()` rifiuta le versioni che non sono `x.y.z`.
- **«Porta qui» resta nel motore** (`sincronia.portaQui`), ma lo usa solo `ricevi` della procedura. «Ripristina dal Drive» e «Fondi» sono gesti espliciti e non filtrano per casa.
- **Le copie fuori casa.** Prima del riordino restano qui ma non salgono. Se ci si lavora sopra qui, il lavoro non va sul Drive: per questo «Riordina» le propone.

# Prove

- **vitest:**
  - `tests/shared/una-casa.test.ts`;
  - `tests/main/una-casa.test.ts`: disco vero (cartelle temporanee): riordino e annullamento, una chat aperta, una copia nuova al suo posto, la sincronia con `escludi` e `proprietario`, la procedura con un PC finto, la verifica diversa, una destinazione muta o vecchia;
  - `tests/main/client-rotte.test.ts`: rotte `/api/sposta` e «Porta qui» del telefono.
- **Da fare con Nicholas:** la migrazione vera sul Drive, il primo riordino sui due PC e uno spostamento vero.
