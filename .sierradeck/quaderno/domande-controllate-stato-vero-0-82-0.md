---
titolo: "0.82.0: domande controllate contro lo stato vero (release, rami, chat)"
quando: 2026-10-21T01:00:00+02:00
tag: ["0.82.0", "domande", "autopilota", "stato-vero", "c-34"]
---

**Perché.** Il 20/10 a Nicholas è arrivato «Pubblico adesso una 0.81.1…?». La
0.81.1 però era già pubblicata (non bozza) e già installata. Il filtro della
0.81.0 (`domande-ripetute-0-81-0.md`) guardava solo la versione in uso. In più
«una 0.81.1» non veniva nemmeno riconosciuta come versione.

# Come funziona
- **`src/autopilot-host/stato-vero.ts`** prepara lo stato vero di un autopilota:
  - le release con `gh release list --json tagName,isDraft` (senza bozze, senza «v»). Si rileggono al più ogni 2 minuti per cartella, e una lettura fallita non si tiene in memoria;
  - la versione installata (`SIERRADECK_VERSIONE`), **solo se il `package.json` del progetto si chiama `sierradeck`**. Prima valeva per qualunque progetto: un «installo la 0.3.0?» di NexoraOS sarebbe stato scartato;
  - le chat dell'autopilota (id, ramo, finita). Un ramo è unito se la chat è `approvata`, oppure se lo dice `git merge-base --is-ancestor ramo ramoBase`. Se git non trova il ramo (codice 128), non si sa.
- **`risoltaDalloStato`** (`domande-doppie.ts`):
  - «pubblico/release/publish/rilascio la X» è risolta se X è già fra le release;
  - «installo la X» è risolta se X ≤ la versione installata;
  - se la domanda parla di tutte e due le cose, devono essere vere entrambe;
  - **solo quando nella domanda non c'è nessuna versione**: «unisco c-N?» è risolta se il ramo è già unito, «chiudo la c-N?» se la chat è finita. Una chat nominata che non è di questo autopilota fa passare la domanda.
- **Il servizio** (`server.ts`, `domandaDaScartare`, ora `async`) legge `deps.statoVero`. Senza, usa le chat e `deps.versione`, senza GitHub. Una domanda scartata:
  - riceve una riga nel diario e nel registro (`[domande] … scartata`);
  - riceve il traguardo **`gia-fatto`** con `nota`. Nella conversazione diventa «Già fatto: la 0.81.1 è già pubblicata. Non te lo chiedo.»;
  - la riga la scrive il PC (`rigaTraguardo`), e la pagina e l'app la mostrano così com'è.

# Regola di prudenza
Se un fatto non si legge (manca gh, non c'è rete, il ramo è sparito), la domanda **passa**. Scartare una domanda vera è peggio che farla due volte.

# Test
- `tests/autopilot-host/stato-vero.test.ts`: il caso vero del 20/10 sia nel modulo sia nel servizio (domanda non aperta, riga «Già fatto» nella conversazione); una release non uscita che invece arriva; i rami e le chat.

# Trappole
- **Copia senza `node_modules`**: in un worktree nuovo i test non partono. NODE_PATH non basta, perché i moduli ESM come `node-pty` non lo leggono. Serve `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci` nella copia (circa 5 minuti). Niente junction verso la cartella principale: togliendo la copia si rischia di cancellare le dipendenze vere.
