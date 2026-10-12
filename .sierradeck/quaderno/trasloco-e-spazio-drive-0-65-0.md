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

# Provato fra i due PC (12/10, progetto «SierraDeck-prova-collaudo», dal portatile a questo PC)

- **Interruzione vera**: il primo «salva sul Drive» del portatile superava i 4 secondi del ponte. Il trasloco si è fermato con il motivo, il giro l'ha ripreso da solo due minuti dopo dallo stesso passo, ed è finito. Dalla 0.66.1 le rotte `/api/trasloco/*` e `/api/workspace/crea|progetto` sono «lente» (45 s).
- **«Annulla tutto»** provato tre volte: la copia del portatile torna al suo posto, l'unione qui si annulla, la casa torna al portatile.
- **I file finivano solo nei «recuperati»** (0.65.0–0.66.2): l'analisi ignorava la copia sul Drive di un id che qui aveva una cartella registrata. Le cause erano due:
  - la cartella registrata poteva non esistere più, perché era nel recupero (corretto nella 0.66.1);
  - lo stesso id ha una cartella anche su un altro PC, e lo sa il suo battito, non il registro di qui, che si unisce solo con «Fondi» (corretto nelle 0.66.2 e 0.66.3, con `idsDaConfrontareSulDrive` e `altroveConCartella`).
  Con la 0.66.3 il passo «Confronto i file… 1/2» ha dato 24 file da aggiungere, e i 24 file e le 4 chat sono arrivati nella cartella.
- **Da sistemare**: le prove ripetute «annulla e rifai» sullo stesso progetto hanno moltiplicato le copie di conflitto del salvataggio (`*.conflitto-drive-…conflitto-drive-…`). Succede quando due PC salvano a turno lo stesso id con file diversi. Il salvataggio non dovrebbe fare la copia di conflitto di una copia di conflitto.

# Spazio vero del Drive di Nicholas (12/10, letto dal pannello del portatile)

Il Drive di Nicholas ha 15 GB e ne sono usati 13,84 (12,99 nel Drive). SierraDeck ne occupa 6,05 GB in 13.111 file:

| Tipo | Spazio | File |
|---|---|---|
| chat | 4,29 GB | 4.077 |
| progetti | 509 MB | 8.037 |
| file senza voce | 817 MB | 977 |
| indice, chiavi e workspace | 421 MB | 8 |
| recupero | 9 MB | 3 |
| battiti | 0,2 MB | – |

Proposte:
- copie doppie: 1.531 chat salvate due volte, 2,0 GB;
- recupero scaduto: 974 file, 817 MB.

Le pulizie le conferma Nicholas, e conviene farle quando tutti i PC sono sulla 0.65 o successiva: un PC più vecchio ricaricherebbe le chat tolte.
