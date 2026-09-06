---
titolo: "«Fondi con il Drive»: unione fra un PC e un Drive che hanno chat diverse (0.14.0)"
quando: 2026-09-06T12:00:00+02:00
tag: ["drive", "sincronia", "fusione", "multi-pc", "workspace", "progetti"]
---

# Perché

Un PC con le sue conversazioni e un Drive con altre (di un altro PC) non
stavano in nessuno dei due gesti esistenti: «Ripristina» (vince il Drive)
e «Salva ora» (vince il PC, file per file). Nicholas: «fare il match fondendo
le info e aggiungere ciò che non c'è… un pannello dove si può personalizzare
il tutto», «possibilità massima di scelta».

# Com'è fatto

- `src/main/cassaforte/fusione.ts`: `pianifica()` (puro) → `PianoFusione`
  con `chat` (etichette dai titoli dei due archivi, workspace, cartella dal
  slug), `progetti` (voci per progetto, conteggi), `assetto`
  (`impostazioni.json`, `istantanee.json`), `workspace` (di qua/di là/in
  comune), `totali`. Ogni voce ha `dove`, `diverse`, firme e `predefinita`:
  solo-pc → carica, solo-drive → scarica, diverse → chat: vince la **più
  lunga** (un jsonl cresce), progetto: vince la **più recente**; assetto
  diverso → salta (vale il PC).
- `ScelteFusione` = `{ voci: percorso → 'carica'|'scarica'|'copia'|'salta',
  workspace: { modo: 'unione'|'pc'|'drive', escludi } }`. `copia` solo per i
  progetti (versione del Drive accanto come `.conflitto-drive-…`, caricata).
- `fondiArchivi(pc, drive, modo, escludi)`: per nome, slot per slot, chat per
  chat (`aggiungiPaneA`), ordine e attivo del PC, poi `unaChatUnWorkspace`.
  `fondiRegistri`: per id, percorsi di tutti i PC.
- `eseguiFusione()`: parte dal manifesto del Drive e applica solo le scelte;
  il resto del Drive resta com'è. Poi `scriviManifesto`.
- `sincronia.anteprimaFusione(pw?)` / `eseguiFusione(scelte, pw?)`: se la
  cassaforte del Drive è un'altra serve la sua passphrase (per leggere), e
  all'esecuzione la si **adotta** (`adottaCassaforteDelDrive` + `adotta(mR)`):
  da lì il PC usa quella. Workspace e registro si fondono prima sul disco e
  salgono come `sierradeck/workspaces.json` e `progetti-drive.json` (carica).
  Le cartelle dei progetti che ricevono qualcosa si creano
  (`preparaRipristino(soloId)`). Dopo, `rimappaChat()`.
- UI: `ModaleFusione.tsx` dal pannello Account («Fondi con il Drive…», anche
  dal riquadro «cassaforte diversa»): passphrase → piano con gruppi
  (Chat / ogni Progetto / Impostazioni e salvataggi / Workspace) apribili,
  `<select>` per voce, tasti di gruppo (unione, solo PC→Drive, solo
  Drive→PC, le diverse tutte e due, lascia tutto), workspace con modo e
  checkbox di esclusione, conto in fondo → Fondi → esito.

# Trappole

- Le voci `sierradeck/workspaces.json` e `progetti-drive.json` NON compaiono
  nel piano: le decide il modo dei workspace, e salgono sempre (fuse).
- `impostazioni.json` è per-PC: predefinito «lascia» se ci sono tutte e due.
- Una chat «diversa» non ha `copia` (un `.conflitto-….jsonl` verrebbe
  indicizzato come chat): si sceglie PC o Drive.
- Il piano legge il Drive con la maestra del Drive; se la cassaforte è la
  stessa serve essere sbloccati.
