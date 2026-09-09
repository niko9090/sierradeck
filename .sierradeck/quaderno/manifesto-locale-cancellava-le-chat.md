---
titolo: "BUG GRAVE chiuso: il manifesto locale «gonfio» cancellava dal Drive le chat degli altri PC (0.19.1)"
quando: 2026-09-09T11:30:00+02:00
tag: ["drive", "sincronia", "bug", "dati", "fusione", "manifesto"]
---

# Cos'è successo (dal registro del 2026-09-08, PC fisso)

- 14:36 «Drive cambiato… cassaforte del Drive adottata… FUSIONE richiesta»
  (602 solo PC, 549 solo Drive, 0 uguali: i due PC hanno le stesse chat
  sotto slug diversi, vedi sotto).
- 14:43 SALVA automatico **durante la fusione** → «606 caricati, 1155 in
  tutto»: il manifesto locale diventa quello del Drive intero, con le 549
  chat del portatile che qui non c'erano.
- 14:58 SALVA automatico → «1 caricati, **385 rimossi**»: quelle 549 meno le
  174 già scaricate erano «nel manifesto locale ma non su disco» →
  `forseCancellati` → cancellate dal Drive.
- 15:07 «FUSIONE ok: 604 caricati, 174 scaricati, 375 saltati»: i blob non
  c'erano più. «Non scarica le altre chat per errori vari» (Nicholas).

# La causa

`salvaIncrementale` restituiva `nuovo` = manifesto del Drive fuso con i miei
caricamenti, e `sincronia` lo scriveva come manifesto locale. Ma il
manifesto locale è anche «cosa questo PC HA»: al salvataggio dopo, ciò che
sta lì e non su disco (prefisso `chat`, che è di tutti) viene cancellato dal
Drive. Bastava che un altro PC avesse salvato chat che questo non aveva
ripristinato. In pratica: **con due PC e il salvataggio automatico, le chat
nuove dell'uno venivano cancellate dall'altro** se non ripristinava prima.

# La cura (0.19.1)

- `sincronia.scriviManifestoLocale` filtra SEMPRE con `soloSuDisco()`: solo
  le voci il cui file esiste su questo disco (per prefisso → cartella della
  radice, `percorsoSicuro`, `existsSync`). Vale per salva, ripristina,
  fusione, togli/ripristina progetto.
- `salvaIncrementale`: legge sempre il manifesto del Drive (una chiamata) e
  **rimette** i file che ha, che credeva sul Drive, e che il Drive non ha più
  (`base.file[p] === undefined && prec.file[p] !== undefined`, non nei
  progetti, dove togliere è una scelta che si propaga). Così il portatile
  rimette da solo le sue chat cancellate. `invariato` solo se davvero
  niente da fare.
- Il lavoro Drive uno alla volta (0.18.0) impedisce che un automatico parta
  durante una fusione.
- Test `cassaforte-manifesto-locale.test.ts`: B salva due volte senza
  ripristinare e le chat di A restano; una chat persa dal Drive risale; una
  cancellata davvero qui sparisce anche dal Drive.

# Velocità e diagnosi

- `google-drive.ts`: mappa nome→id imparata da ricerche/creazioni/`elenca()`;
  404 su un id ricordato → dimentica e ricerca. `scarica` era 2 chiamate
  per file (ricerca + GET).
- `fusione.ts`: `conLimite(voci, PARALLELI=6)` + `archivio.elenca()` prima;
  `esito.perche {blobMancante, localeMancante, nonScritto}` nel registro.
  Anche ripristino (`elenca()` prima) e salvataggio (se >10 file).
- Con l'annulla parallelo, «fatti» dipende dal momento: il test lo verifica
  a conto, non a numero fisso.

# Da sapere / limite noto

- **Slug per PC**: le chat stanno sotto `chat/projects/<slug della cwd>/…` e
  lo slug contiene il percorso locale; `rimappaChat` copia la trascrizione
  sotto lo slug del PC nuovo. Risultato: sul Drive la stessa conversazione
  esiste una volta per PC (0 «uguali» fra i due). Non perde niente, ma
  raddoppia e confonde «diverse/uguali». Candidato a un lavoro futuro (chiave
  per sessionUuid, non per percorso).
- Le 385 chat cancellate il 2026-09-08 erano del portatile: il portatile le
  ha ancora; con la 0.19.1 sul portatile, il primo «Salva ora» le rimette.
