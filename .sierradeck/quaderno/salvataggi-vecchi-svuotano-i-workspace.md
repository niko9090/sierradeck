---
titolo: "I salvataggi vecchi che svuotavano i workspace (perMonitor → perSlot)"
quando: 2026-09-03T11:00:00+02:00
tag: ["istantanee", "salvataggi", "workspace", "migrazione", "difetto", "perdita-dati", "aggiornamenti"]
---

# Il fatto (2 settembre 2026)

Su un secondo PC, aggiornato dalla 0.12.4x alla 0.12.48: **i workspace restano,
ma sono tutti vuoti, tranne la chat che la finestra aveva davanti alla
chiusura**. Stesso sintomo delle perdite di agosto — ma la radice dei workspace
([[workspace-la-radice]]) era già chiusa e sana. La causa era altrove.

# La causa

Fino alla **0.12.44** un'istantanea (`istantanee.json`) archiviava i layout di
ogni workspace sotto `perMonitor` (chiave = geometria dello schermo). Dalla
**0.12.45** (commit a207043, «la radice») il campo si chiama `perSlot`, e
`parseWorkspace` in `src/shared/istantanea.ts` leggeva **solo** il nome nuovo.
L'archivio dei workspace (`parseArchivio`) invece aveva il ripiego
`perSlot ?? perMonitor` — la stessa rinomina, fatta in un file sì e nell'altro
no.

Effetto: ogni istantanea scritta prima della 0.12.45 tornava con i workspace
**a nome pieno e a mani vuote**. Nessuno scarto registrato: il campo mancava e
basta.

Poi il ripristino (`istantanee:carica` → `workspaceDopoRipristino`) fa quello
che deve: **dei workspace nominati nel salvataggio prende la versione salvata**.
Vuota. E la scrive. Le finestre ricevono i layout di `finestre` (le chat a
schermo alla chiusura), che finiscono nel workspace attivo. Risultato esatto
del sintomo.

Perché proprio dopo un aggiornamento: alla chiusura il renderer salva
«Ultima chiusura» (`NOME_AUTOMATICO`), e all'avvio compare la finestra
«Riprendi?» con l'elenco dei salvataggi. Chi viene dalla 0.12.44 ha «Ultima
chiusura» **nel formato vecchio**, scritta dalla versione vecchia un istante
prima di installare la nuova. Un clic su «Riprendi», e i workspace sono vuoti.

Il ripristino **non passa** dal rifiuto «una chat esce solo se congedata»
(`esitoDelSalvataggio`): quello vive in `layout:salva`, e qui non c'è una
finestra che dichiari niente. È un secondo scrittore dell'archivio, senza
guardia.

# La correzione (0.12.49)

1. `parseWorkspace` legge `perSlot ?? perMonitor` e passa le chiavi-monitor da
   `migraChiaviMonitor`, come l'archivio: un monitor, uno slot, uguale per tutti
   i workspace del salvataggio. Un workspace senza nessuno dei due finisce in
   `scartati`.
2. Il ramo «forma ancora precedente» delle finestre (un layout per monitor in
   cima al salvataggio) aveva lo stesso guasto: rinominato in `perSlot`, non
   leggeva più il vecchio `perMonitor`. Riparato.
3. Prima di riscrivere l'archivio, il ripristino ne mette da parte una copia:
   `workspaces.prima-del-ripristino.json` nella cartella dei dati (una sola,
   sovrascritta a ogni ripresa). Toglie l'irreversibilità, che era la parte
   peggiore.
4. Test in `tests/shared/istantanea.test.ts`: senza la correzione cadono in sei.

# Come si recupera, su un PC colpito

- **Se il programma non è stato chiuso dopo il danno:** aggiornare alla
  0.12.49 e riprendere di nuovo «Ultima chiusura» — il file dell'istantanea
  contiene ancora i `perMonitor` vecchi, e ora si leggono.
  ATTENZIONE: «Ultima chiusura» si **riscrive a ogni chiusura** del programma;
  chiudendo la 0.12.48 dopo il danno, contiene lo stato danneggiato.
- **Altrimenti:** `%APPDATA%\SierraDeck\workspaces.prima-dell-aggiornamento.json`
  è la copia fatta dalla versione vecchia prima di riavviare per aggiornarsi
  (esiste dalla 0.12.29). A programma chiuso, rinominarla in `workspaces.json`.
- Le conversazioni in sé non sono mai perse: sono le trascrizioni di Claude
  Code e si riaprono dal pannello Sessioni. Si perde solo la disposizione.

# La lezione

**Quando si rinomina un campo su disco, si cerca il nome vecchio in tutti i
lettori, non solo in quello che si sta guardando.** `grep perMonitor` avrebbe
trovato `istantanea.ts` in un secondo. E: un lettore che trova un campo assente
deve **dirlo** (`scartati`), non restituire un contenitore vuoto con lo stesso
nome — vuoto e assente sono due cose diverse, e la seconda non va scritta.

Terza: ogni scrittore dell'archivio che non passa dal rifiuto dei congedi
(ripristino istantanee, `workspace:cambia`, sync `ripristina`) è un punto in
cui una perdita **non viene fermata**. Oggi il ripristino ha almeno la copia
di sicurezza; gli altri due no.
