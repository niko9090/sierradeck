---
titolo: "Progetti sul Drive: le cartelle viaggiano con le chat (tappa 1)"
quando: 2026-09-04T18:00:00+02:00
tag: ["drive", "sincronia", "progetti", "cassaforte", "multi-pc", "architettura"]
---

# Perché

Sul secondo PC arrivavano le chat ma non le cartelle dei progetti: «di fatto
non riesco a lavorare» (Nicholas, 2026-09-04). Deciso il piano a tre tappe:
1) le cartelle viaggiano con le chat; 2) presenza/lock e passaggio di
testimone fra PC; 3) conflitti. Decisioni confermate: motore cifrato nostro
(non Google Drive per desktop), `.git` incluso, passaggio di testimone
obbligatorio (tappa 2).

# Com'è fatto (0.12.56)

- **Registro condiviso** `progetti-drive.json` (nell'allowlist della
  cassaforte, prefisso `sierradeck/`): `{ id, nome, percorsi: { <pcId>: path }, aggiuntoIl }`.
  Modulo `src/main/progetti/registro.ts` (puro + store).
- **Identità del PC** `pc.json` (NON sincronizzato): `{ id, nome, cartellaProgetti }`.
  `cartellaProgetti` predefinita = `~/Progetti SierraDeck`. `src/main/progetti/pc.ts`.
- **Radici in più** per la cassaforte: prefisso `progetto-<id>`, cartella =
  percorso locale. `Radice.elenca` (nuovo) delega l'elenco dei file a
  `elencaFileProgetto` (`src/main/progetti/file.ts`): rispetta i `.gitignore`
  a ogni livello (`src/shared/gitignore.ts`, sottoinsieme provato), esclude
  sempre `node_modules`, `.venv`, `__pycache__`, `build`, `.next`, ecc.,
  salta i symlink e i file > 100 MB. `.git` viene.
- **Ripristino in due tempi** (`sincronia.ripristina`): prima tutto tranne
  `progetto-*` (così arriva il registro), poi `preparaRipristino()` dà una
  cartella a chi non ce l'ha qui (`<cartellaProgetti>/<nome>`, e aggiorna il
  registro con il pcId di qui), poi i `progetto-*`.
- **Rimappatura delle cwd** (`rimappaCwd`/`rimappaWorkspace`): una cwd che
  non esiste ed è dentro il percorso di un progetto **su un altro PC** diventa
  la stessa sottocartella nel progetto di qui. Si fa all'avvio e dopo ogni
  ripristino (`rimappaChat` in `index.ts`), e **si copia la trascrizione**
  sotto il nuovo slug (`pathToSlug(cwd)`) perché Claude Code cerca
  `~/.claude/projects/<slug>/<uuid>.jsonl` dal percorso: senza copia,
  `--resume` va a vuoto.
- **Guardia sulle cancellazioni** (`salvaIncrementale`): si cancella dal
  Drive solo ciò che sta sotto un prefisso che questo PC HA. Prima, un PC
  senza il progetto di un altro lo avrebbe cancellato dal Drive al primo
  salvataggio (il manifesto diceva «c'era, ora non c'è»).
- **Automatico**: ogni 5 min se c'è un progetto locale sul Drive (15 altrimenti),
  un giro 1 min dopo l'avvio, e alla chiusura (`before-quit`, tetto 45 s) —
  quindi anche prima di un aggiornamento.
- **UI**: pannello Account → «Progetti sul Drive»: elenco, «Metti una cartella
  sul Drive…», «Sta già qui…» (collega un progetto arrivato da altrove a una
  cartella locale), «Togli», cartella di ricezione con «Cambia».

# Trappole e limiti noti

- «Togli» toglie dal registro ma **non** cancella i file dal Drive (per la
  guardia sopra, nessun PC li considera suoi): restano finché non si
  ripulisce a mano. Da sistemare quando serve.
- `.git/index.lock` o file transitori possono finire nel manifesto; innocui.
- Due PC che modificano lo stesso file: vince l'ultimo che salva, senza
  avviso. È la tappa 3. La tappa 2 (presenza + testimone) rende il caso raro.
- Il primo salvataggio di un progetto grosso può durare minuti (upload di
  ogni file, 6 in parallelo). Il tetto di 45 s alla chiusura può troncarlo:
  riprende al giro dopo, incrementale.
- Un progetto aggiunto sul PC B con lo stesso **nome** di uno arrivato da A e
  senza percorso locale viene **collegato** (non duplicato): è voluto.

# Tappa 2 (0.12.57): presenza e passaggio di testimone

- **Presenza** `presenza-<id>` e **staffetta** `staffetta-<id>`: due piccoli
  oggetti cifrati nell'archivio del Drive (fuori dal manifesto), via
  `sincronia.scatola()`. Presenza = `{ pcId, pcNome, da, battito }`, vale 10
  min dall'ultimo battito (`PRESENZA_SCADUTA_MS`); battito ogni 2 min mentre
  ci sono chat vive; senza chat vive per 5 min si lascia da soli.
- **Ronda** (`src/main/progetti/presenza.ts`, `creaRonda`), ogni 30 s dal
  main: per ogni progetto legge presenza+staffetta e decide. Le «chat vive»
  di un progetto = `chatAperte` con `viva` e `cwd` dentro il percorso locale.
- **Chi apre una chat** in un progetto in mano a un altro PC riceve l'avviso
  (`impostaPrimaDiAprire` in `ipc.ts` → `ronda.primaDiAprire`, una volta per
  progetto) → `ModaleTestimone`: «Prendi il testimone» / «Continua senza».
  La chat si apre comunque; ma finché il progetto è `altro`, `radiciLocali`
  lo **esclude dal salvataggio** (non si sovrascrive il lavoro dell'altro).
- **Passaggio**: B scrive la staffetta e aspetta fino a 90 s (poll 3 s). A, al
  suo giro, vede la staffetta: `salva()` → iberna le chat del progetto
  (`progetti:iberna-chat` → renderer `store.iberna` + `pty.kill`) → cancella
  presenza e staffetta → avviso «ceduto». B vede la presenza sparita →
  `sincronia.ripristinaProgetto(id)` (solo quel prefisso, con `manifestoPrec`
  per saltare gli invariati ed `elimina` per togliere ciò che A ha cancellato)
  → scrive la sua presenza → `rimappaChat()`. Se A non risponde: `nonRisponde`
  → «Prendilo lo stesso» = `forza` (salta l'attesa).
- **Ripristino incrementale** (`ripristinaIncrementale` con `manifestoPrec`):
  un file uguale nel manifesto di prima e in quello del Drive, e presente sul
  disco, non si riscarica. Vale anche per «Ripristina» completo.
- Trappola: `ripristina()` completo sovrascrive anche `workspaces.json` (è il
  suo mestiere); per il testimone si usa SOLO `ripristinaProgetto`.
- Non ancora: il telefono non vede le presenze; i conflitti (due PC che hanno
  scritto lo stesso file) sono la tappa 3.

