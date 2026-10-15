---
titolo: "0.74.1: tutti i workspace trasformati da soli (vista a elenco + autopilota dormiente), senza toccare niente che lavora"
quando: 2026-10-15T23:00:00+02:00
tag: ["0.74.1", "migrazione", "workspace", "autopilota", "sicurezza"]
---

DECISIONE DI NICHOLAS (15/10): «trasformare TUTTI i workspace, anche quelli esistenti». Con l'avvertenza: «verifica attentamente che non ci saranno problemi perché rischiamo un fermo di tutti i PC».

# Come è fatta (perché non può fermare un PC)
- **Cosa tocca:** la preferenza `workspaceElenco` e il suo file `migrazione-elenco.json`. **Non** scrive `workspaces.json`, `case-chat.json`, `finestre.json` né il sottofondo, non uccide, non riavvia, non riprende e non sposta niente.
- **L'autopilota di ogni workspace è un «dormiente»:** un record dentro `migrazione-elenco.json`, non un autopilota del servizio.
  - Non gira, non ha obiettivo né criteri, non lancia comandi, non compare fra i «fermi».
  - Nasce davvero solo quando Nicholas gli scrive nella colonna dell'elenco: allora parte con `autopilota.crea`, con il primo messaggio come obiettivo e partenza «aspetta il mio Vai».
  - Un workspace vuoto non ha cartella: «Affida un lavoro» apre il modulo.
- **Quando:** al primo avvio della versione nuova, nel main, prima che nasca una finestra (`index.ts`, subito dopo `riparaListaAllAvvio`). Solo i workspace dell'archivio di questo PC: quelli «Su altri PC» stanno nei battiti, non nell'archivio.
- **L'ordine** (`src/main/migrazione-elenco.ts`):
  1. copia atomica di workspaces, case-chat, finestre, impostazioni, sottofondo e autopiloti in `copie-di-versione/migrazione-elenco-<quando>` (si scrive in `.tmp`, poi un rename);
  2. stato `in-corso` con la preferenza di prima;
  3. preferenza;
  4. stato `fatta` con i dormienti.
- **Riavvio a metà:** trovato `in-corso`, rimette la preferenza com'era e rifà tutto da capo.
- **Errore:** rimette com'era, scrive `fallita` con il motivo, mette `[migrazione]` nel registro e una banda con «Riprova». Il programma parte comunque. Non riprova da sola.
- **«Torna come prima»** (banda, Impostazioni → Chat e autopiloti, pagina, app con `/api/migrazione/torna`): rimette la preferenza **esattamente** com'era e passa allo stato `annullata` (i dormienti spariscono). «Trasforma tutti» (`rifai`) la rifà.

# Due difetti trovati provando sui dati veri, e corretti
1. **Cambiare vista riavviava le chat.** Con due `<Mosaic>` in rami diversi di App, il passaggio elenco ↔ mosaico, e quindi anche «Torna come prima», smontava i terminali: i PID dei claude.exe cambiavano. Ora il mosaico sta in un posto solo e la colonna dell'elenco gli sta accanto; c'è un test che lo controlla (`tests/renderer/mosaico-un-posto-solo.test.ts`). Rifatta la prova con 2 chat vive: stessi PID dopo «Torna come prima», «Trasforma tutti», «Mosaico» ed «elenco».
2. **La chat principale di un autopilota si chiudeva quando lui finiva.** Ora si chiudono solo gli specialisti (le chat con un ruolo) che hanno finito, e mai una chat che sta scrivendo o che chiede qualcosa. La chat principale torna a Nicholas.

# Prove
- `tests/main/migrazione-elenco.test.ts`: i file delle chat restano identici byte per byte, la copia è atomica, il programma è idempotente, il riavvio a metà si completa, un guasto rimette tutto com'era, l'archivio illeggibile non blocca, «Torna come prima» e «Rifai» funzionano, solo i workspace di questo PC.
- `tests/main/compatibilita-pc-misti.test.ts`: i battiti **veri** della 0.69.0 e della 0.73.0, resi anonimi, e le risposte **vere** delle loro rotte, generate dai tag con un worktree e un bundle esbuild (`note/compat/genera.mjs`, `anonimizza.mjs`). Si vedono, si aprono le chat, si consegna; le risposte della 0.74.1 contengono tutto quello che leggevano i PC vecchi.
- **Copia staccata dei dati veri** (`note/vero-074`, senza Drive, ponte, chiave di casa, token o dispositivi): i 3 PC con `prova.mjs`. Questo PC con i suoi file; gli altri due ricostruiti dal loro battito. Nessuna chat persa (47, 1, 1), i file delle chat intatti; idempotente, riavvio a metà, guasto e «Torna come prima» provati. Poi la copia di questo PC aperta davvero: banda, autopilota dormiente, due chat vive come voci, pagina con «Torna come prima».

**Trappole:**
- per gli altri PC il Drive conosce solo le chat **aperte** nel battito, non tutti i loro riquadri salvati: il conto vero lo fa la migrazione quando parte là, e lo scrive riga per riga nel registro;
- lo strumento di clic sulla pagina sbaglia bersaglio se la pagina si ridisegna mentre scorre: per un tasto della pagina meglio `b.click()`.
