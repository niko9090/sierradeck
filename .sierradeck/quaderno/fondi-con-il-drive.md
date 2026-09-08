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

# 0.16.1 — il pannello si capisce (feedback di Nicholas: «caotico e non preciso»)

- Nomi delle chat: `titoliIndice` (da `listSessions(db)`: `aiTitle`, `cwd`,
  `lastTimestamp`, `messageCount`) → etichetta = titolo dell'indice, poi
  titolo dei workspace, poi «Conversazione»; `cartella` e `quando` sulla voce.
  Mai il codice della sessione.
- Chat raggruppate per cartella di progetto (`perCartella`), sezioni apribili
  con conteggi e tasti di gruppo. Azioni: «porta sul Drive» / «porta qui» /
  «tieni tutte e due» / «lascia com'è».
- Workspace: per riga un `<select>` in chiaro (entrambi: «unisci: qui + le
  chat del Drive» / «tieni com'è qui»; solo Drive: «crealo qui con le sue
  chat» / «non portarlo»; solo qui: «resta com'è»), con la riga che spiega
  cosa vuol dire unire. `escludi` = i workspace con «tieni qui» / «non
  portarlo». Una frase in testa distingue chat (conversazioni) e workspace
  (fasce a schermo).


# Procedura consigliata (portatile → PC fisso, 2026-09-07)

1. Portatile aggiornato; Account → Connetti a Drive con **lo stesso account
   del fisso** (djniko90@gmail.com): due PC si parlano solo sullo stesso Drive.
   «Cassaforte diversa» qui è normale: è il caso della fusione.
2. Se la chat lavora su una cartella che il fisso non ha, PRIMA metterla in
   «Progetti sul Drive» (altrimenti sul fisso la chat riparte su un percorso
   che non esiste; la rimappatura vale solo per i progetti registrati).
3. «Fondi con il Drive…» → passphrase del fisso → piano: la chat voluta
   «porta sul Drive», il resto «lascia com'è» se non deve viaggiare; il suo
   workspace «unisci» (se esiste anche di là) o «resta com'è» (solo qui: si
   crea di là con le sue chat). Fondi → riavvia.
4. Sul fisso: Account → «Ripristina», possibilmente col fisso fermo.
   TRAPPOLA: se il fisso ha riscritto `workspaces.json` DOPO la fusione
   (basta spostare una chat), al ripristino vince il suo perché più recente,
   e la chat arriva senza workspace. Non è persa: nel workspace voluto,
   «▣ Riprendi» in console e la si sceglie per nome.

# 0.17.2 — tasti che dicono cosa fanno (Nicholas: «il fondi si vede poco e non sembra neanche un'opzione; unisci tutto non cambia nulla»)

- Causa del «non cambia nulla»: i tasti di gruppo cambiavano le tendine di
  righe in sezioni **chiuse** (le cartelle delle chat partivano tutte chiuse:
  `aperti` iniziale era `{'chat'}`, chiave che non esisteva), e «unisci» =
  predefinite = lo stato iniziale, quindi davvero non cambiava niente. E
  nessun tasto mostrava di essere quello in vigore.
- `src/renderer/fusione-scelte.ts` (puro, provato): `azioniPossibili`,
  `sceltePerTutte(voci, conCopia, a, attuali)`, `gruppoInVigore` (il tasto è
  acceso se premerlo non cambierebbe niente), `riassunto`/`riassuntoInParole`.
- `ModaleFusione.tsx`: tasto in vigore con `✓`, `aria-pressed` e classe
  `tasto--acceso`; un tasto di gruppo apre le sezioni che tocca; `Conto` (→ N
  sul Drive · N qui · N come sono) accanto a Chat, a ogni cartella e a ogni
  progetto; la prima cartella parte aperta. Piede `.fusione__piede` con il
  conto e il tasto `.fusione__fondi` («Fondi adesso →», colore d'accento,
  più grande). Nel pannello Account il tasto «Fondi con il Drive…» è primario.
