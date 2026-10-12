---
titolo: "0.65.0: il trasloco (Sposta progetto = Rendi residente) e lo spazio sul Drive"
quando: 2026-10-12T16:15:00+02:00
tag: ["trasloco", "sposta progetto", "rendi residente", "rimozione sicura", "spazio Drive", "pulizia", "recupero", "0.65.0"]
---

# Perché

«Sposta progetto» (0.42) metteva le chat del vecchio PC nel recupero senza confrontarle: niente confronto della tappa 3 (`rimozione-sicura.ts`) né della 0.60 (`residenza.ts`). Nicholas lo ha vissuto come «cancella tutto».

# Il trasloco: un passaggio solo

Il trasloco gira **sul PC che diventa residente**. Le regole stanno in `src/shared/trasloco.ts`, il lavoro in `src/main/trasloco.ts`. Non è codice nuovo per copiare o togliere: compone i pezzi che c'erano già.

1. **Raccolta**: ogni altro PC con una copia la salva sul Drive (`/api/trasloco/salva`).
2. **Analisi**: `residenza.avvia`, che confronta le cartelle di qui e le copie sul Drive. Il dettaglio dice «Confronto i file di … 2/5».
3. **Unione**: `residenza.conferma` mette qui i file che mancano, le versioni diverse nei recuperati, le chat, un solo workspace e la casa.
4. **Copie vecchie**: su ogni altro PC, `/api/trasloco/togli` fa partire la rimozione sicura. Quella confronta con il residente, copia qui quello che c'è solo là e poi sposta la cartella nel recupero di quel PC per 30 giorni. Lo stato si legge con `/api/trasloco/togli-stato`.
5. **Fine**: il riassunto, con «Annulla tutto» per 30 giorni. Annullare vuol dire: `/api/trasloco/ripristina` sugli altri PC, `annullaUnione` qui, e la casa a chi c'era prima (`casaPrima`, o il PC da cui è partito «Sposta»).

Come si comporta:
- **Stato su disco**: `<dati>/traslochi/<id>.json`, scritto prima e dopo ogni passo.
- **Se si ferma**: un PC che non risponde ferma il trasloco con `fermo.riprovaDaSolo`. Il giro, ogni 2 minuti, lo riprende dal passo fermo. Dopo un riavvio l'analisi in memoria è persa, e il passo «unione» la rifà prima di unire.
- **«Sposta progetto…» da un PC**: salva qui, chiede `/api/trasloco/avvia` al PC di destinazione e segue lo stato con `/api/trasloco/stato` (`traslochiSeguiti`, in `traslochi-seguiti.json`).
- **«Rendi residente qui»** (azione `residente-qui`): avvia direttamente il trasloco.
- **Le rotte `/api/trasloco/*`**: solo fra PC della stessa cassaforte, anche sul canale WebRTC (`ROTTE_VIA_CANALE`).
- **Per chi collauda**: `/api/prova/trasloco` accetta solo i progetti «SierraDeck-prova-…».

# Lo spazio sul Drive

Le regole stanno in `src/shared/spazio-drive.ts`, il lavoro in `src/main/spazio-drive.ts`.

- **Misura**: la quota viene da `about?fields=storageQuota`, che con il permesso `drive.appdata` basta. I file vengono da `files.list` con `size` e `modifiedTime` (`elencaConDimensioni`).
- **Tipo dei file**: i file dei dati si chiamano `f_<sha256 del percorso>`, quindi il tipo si ricava dal manifesto. Gli altri hanno un nome parlante: `pc-`, `posta-`, `presenza-` e simili sono battiti; `sierradeck.manifesto.*` sono copie di sicurezza e vanno nel recupero.
- **Proposte di pulizia**:
  - copie doppie, cioè la stessa sessione sotto due slug (resta la più lunga);
  - chat ferme da più di 60 giorni che sono intere sul disco di un PC (dal battito, con il nuovo `locali.chat[].size`);
  - copie del manifesto più vecchie di 30 giorni, e file `f_` senza voce più vecchi di 2 giorni.
- **Una pulizia confermata**: prima la si scrive nel registro `pulizie-drive` sul Drive, cifrato, con le voci del manifesto. Poi le voci escono dal manifesto (`modificaManifestoDrive`, sotto il lavoro in corso). I file restano 30 giorni. «Annulla» rimette le voci, a meno che nel frattempo non ce ne sia una più nuova. Il giro cancella i file scaduti; «Svuota adesso» lo fa prima, con conferma.
- **Trappola**: `salvaIncrementale` ricarica sul Drive le chat che un PC ha e che il Drive «ha perso». Per questo `escludi(p, firma)` tiene fuori i percorsi puliti finché la copia di un PC non è più lunga (`restaFuori`). Il registro va letto presto, 20 s dopo l'avvio, prima del primo salvataggio.
- **Dove si vede**: «Progetti» sul PC, nella pagina e nell'app (`spazio` in `/api/drive/pannello`, azioni `spazio-*` in `/api/drive/azione`). La prima misura arriva dopo il pannello (`subito()`), e la finestra rilegge finché c'è.
