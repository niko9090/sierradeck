---
titolo: "«Apri cartella» (0.82.0): come trova la cartella e dove si apre"
quando: 2026-10-21T01:10:00+02:00
tag: ["0.82.0", "workspace", "file", "android", "pagina", "c-37"]
---

# «Apri cartella» (0.82.0, ramo c-37)

**Cosa fa.** Sul PC apre in Esplora file la cartella del progetto di un
workspace o di una chat. Sulla pagina e nell'app apre la sezione **File** su
quella cartella (sul PC giusto, anche attraverso il ponte).

**Da dove viene il percorso** — mai dal codice, sempre dai dati del PC
(`src/shared/apri-cartella.ts`, cucito in `src/main/index.ts` →
`cartellaDaAprireGlobale`):
- **chat**: la sua `cwd` (chat aperte annunciate dalla finestra); se il
  riquadro salvato guarda un altro PC (`PaneSalvato.remoto` con `pcId` diverso)
  si risponde «La cartella è su <PC>: aprila da lì», non si apre niente;
- **workspace**: prima il progetto del workspace (`progettoPerWorkspaceGlobale(nome, { crea: false })`
  — guardare **non crea** la cartella), poi la cartella con più chat del
  workspace su questo PC, **mai** cartella utente, Documenti o radice di disco.

**Dove sono i tasti.**
- PC: «⋯» di ogni workspace nella tendina (c-36: prima era il piede «📁 Apri
  cartella», solo per quello attivo), tasto destro su una linguetta, comandi «⋯» della testata della chat
  (`TastoCartella.tsx`). Il perché di un rifiuto compare accanto ai workspace
  (⚠ + testo corto) o accanto al tasto della chat.
- Pagina: «⋯» di ogni workspace nel riquadro Workspace (c-36) e menu «⋯»
  dentro una chat.
- App: menu ⋮ della chat («Apri cartella») e «⋯» di ogni workspace in
  Gestione (c-36; prima un'icona cartella); nascosti se il PC è più vecchio della 0.82.0 (`FunzionePc.CARTELLA`).

**La rotta** `POST /api/file/cartella` `{ workspace } | { chat }` →
`{ progetto, percorso, cartella }`; 409 con `errore` se è altrove, se non c'è,
o se la cartella non sta in nessun progetto che la sezione File sfoglia
(`voceFileDi`: il progetto **più interno** che la contiene). È nelle liste del
ponte e del canale (PC e app) e fra le rotte lente (legge i progetti come
`/api/file/progetti`).

**Trappole incontrate.**
- Nella pagina `chiedi()` **non solleva** sul 409: torna l'oggetto con
  `errore`. Va controllato a mano (`window.apriCartella`).
- Nei test Kotlin il nome di funzione fra backtick non può contenere `:`
  (errore «Name contains illegal characters»): la compilazione dei test cade
  dopo 13 minuti di Gradle.
- Nel worktree non c'è `node_modules` né `android/local.properties`: giunzione
  verso la cartella principale e copia del file (entrambi ignorati da git).
- Una `FunzionePc` nuova entra da sola nella fascia «PC indietro»
  (`PcIndietro.testo` in `Gestione.kt`): `CompatibilitaVecchiTest` cade finché
  non la si esclude come `GESTIONE_CHAT`.
- In `SezioneFile` l'effect che apre la cartella ha la richiesta fra le chiavi:
  azzerarla lo rilancia e annulla `vai` a metà. `vai` va lanciato con `scope.launch`.
- «Could not connect to Kotlin compile daemon» è solo un avviso: Gradle compila
  senza demone e il build può essere verde lo stesso (guardare i risultati dei test).
- **(21/10, c-36) La rotta non era collegata**: `cartellaDaAprireGlobale` c'era,
  ma non veniva passata come `cartellaDaAprire` alle deps delle rotte in
  `index.ts` (accanto a `fileProgetti`), così pagina e app ricevevano sempre 409
  «Questo computer non sa ancora aprire la cartella di un workspace: aggiornalo
  alla 0.82.0.» anche da un PC 0.82.0. I test della rotta passavano perché
  costruiscono le deps a mano. Collegata; un test in
  `tests/main/menu-workspace-pagina.test.ts` guarda che il collegamento resti.
  Lezione: una dep opzionale nuova di `client-rotte.ts` va cercata anche in
  `index.ts`, non basta il test della rotta.
