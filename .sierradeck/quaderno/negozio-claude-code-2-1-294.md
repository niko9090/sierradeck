---
titolo: "Il negozio provato dal vero con Claude Code 2.1.294: cosa funzionava, cosa no, cosa è cambiato (0.53.0, app 2.53.0)"
quando: 2026-10-08T17:30:00+02:00
tag: ["negozio", "plugin", "skill", "mcp", "marketplace", "claude-code", "telefono", "pagina", "prove-dal-vero", "causa"]
---

# La richiesta (Nicholas, 08/10)

«Migliora e correggi tutta la parte di negozio perché molte cose non si vedono o non funzionano».

# Come si è provato

- **Il CLI vero.** `claude.exe` 2.1.294, con `CLAUDE_CONFIG_DIR` su una cartella temporanea. Così la configurazione vera non si tocca: Claude Code tiene lì **anche** `.claude.json`, provato.
- **Cosa c'era dentro:**
  - un marketplace di prova in una cartella (plugin `saluta` con una skill);
  - un server MCP finto in Node, che risponde a `initialize` e `tools/list`;
  - uno http irraggiungibile.
- **Cosa vede una chat.** Si è controllato con `claude -p` dopo ogni modifica, sulla stessa cartella temporanea.
  - Per entrare serve il token: `.credentials.json` copiato senza `refreshToken`, con la scadenza a ore.
  - La cartella temporanea va **cancellata a mano**: la protezione di SierraDeck non lascia cancellare fuori dal progetto.
- **I moduli veri.** Si sono provati con un harness esbuild contro il CLI vero: `scratchpad/vero/negozio-vero.ts`.
- **La configurazione vera di Nicholas.** Ricontrollata alla fine, è identica a prima: nessun plugin, nessun MCP, solo la fonte ufficiale.
- **Dati per i test.** Le risposte vere del CLI, con i percorsi resi neutri, stanno in `tests/fixtures/claude-2.1.294-negozio/`.

# Esito di ogni funzione

| Funzione | Com'era (0.52.6) | Perché | Ora (0.53.0) |
|---|---|---|---|
| Elenco del catalogo, PC | funzionava | 3542 plugin in 4-5 s, `claude-plugins-official` più la directory `anthropic-plugin-directory` (~3200) | tenuto in memoria 60 s, dimenticato dopo ogni azione |
| Elenco del catalogo, telefono | **non funzionava** | arrivava tutto il catalogo (~2 MB), senza ricerca | 30 (installati e più installati) + `totalePlugin`; il resto con la ricerca |
| Ricerca | solo PC | sul telefono e nella pagina non c'era | `/api/negozio/cerca` (fino a 50), app e pagina |
| Dettaglio | funzionava | `plugin details` solo per gli installati | gli installati non avevano descrizione (il CLI non la manda): ora presa dal `marketplace.json` |
| Fonte: aggiungi | funzionava | — | `--json`; errori leggibili (`invalid_source` → «la cartella non esiste») |
| Fonte: aggiorna | solo «tutte» | — | anche una per una, con la data dell'ultima lettura |
| Fonte: togli | **testo sbagliato** | 2.1.294 **disinstalla anche i plugin** di quella fonte | detto prima, con il secondo clic |
| Plugin: installa | funzionava, ma con `--yes` al buio | `--yes` accetta il comando che il marketplace vuole eseguire | `--json` senza `--yes`; se c'è `shownCommand` si mostra e si conferma con `--accept-command <sha256>` |
| Plugin: installa dal telefono | **falliva** sulle installazioni lunghe | timeout di lettura dell'app a 15 s, un'installazione da git ne prende 7-60 | rotte del negozio a 200 s (`Api.ROTTE_LENTE`) |
| Plugin: aggiorna | **mancava** | — | `plugin update --json`; «aggiornamento disponibile» calcolato |
| Plugin: abilita, disabilita | funzionava | ma «già spento» tornava come errore (`already_in_goal_state`) | è riuscito |
| Plugin: disinstalla | funzionava | — | `--json`; «non installato» spiegato |
| Skill: aggiungi, togli (utente e progetto) | **mancava** | — | «Nuova skill» (scrive SKILL.md), «Importa da una cartella», «Togli» (nel Cestino) |
| Skill: spegni | funzionava (`skillOverrides`, provato in chat) | gli override del progetto non si leggevano; le skill dei plugin non si vedevano | letti da utente, progetto e locale; le skill dei plugin si vedono in sola lettura |
| MCP: elenco | **solo i locali** | utente (`mcpServers` in cima a `.claude.json`) e `.mcp.json` mancavano | tutti e tre, più quelli di plugin e claude.ai (sola lettura) |
| MCP: spegni | **non funzionava** | scriveva `disabledMcpjsonServers`, che vale solo per `.mcp.json`; il server restava acceso in chat (provato) | `projects[cartella].disabledMcpServers`, come l'interruttore di `/mcp` (provato) |
| MCP: aggiungi stdio e http | **mancava** | — | `claude mcp add-json -s local/user/project` |
| MCP: variabili e segreti | **mancava** | — | una chiave per volta nel file giusto; i valori non si mostrano mai e non vanno al telefono (`comeMostrare` copre anche `--token xxx`) |
| MCP: togli | **mancava** | — | `claude mcp remove -s <ambito>` |
| MCP: connesso o in errore | **mancava** | — | `claude mcp list` (prova davvero i server, 1-2 s), errore con il motivo |
| MCP del `.mcp.json`: approva, rifiuta | **mancava** | — | `.claude/settings.local.json` del progetto (Claude Code ci sposta da solo le scelte trovate in `.claude.json`) |
| «Questa chat» (`--settings`) | plugin e skill funzionavano; **MCP no** | `disabledMcpjsonServers` come sopra | `deniedMcpServers: [{serverName}]` (provato: la chat non avvia il server) |
| Pagina servita | **negozio assente** | — | Computer → Negozio: stessi stati, ricerca, azioni, Riprova, conferma |
| `CLAUDE_CONFIG_DIR` | `.claude.json` letto dalla home | — | `percorsiClaude()` |

# Cosa è cambiato in Claude Code (2.1.x) rispetto a quando il negozio è nato

- **`--json` nei comandi di plugin e fonti.** Dà una riga con `outcome` e `failureCode` (`not_found`, `not_installed`, `already_in_goal_state`, `invalid_source`, `not_configured`). In caso di errore il codice d'uscita ora è 1: il commento «esce sempre con 0» non vale più.
- **`plugin list --available --json` toglie dai disponibili i plugin installati.** La versione nel catalogo si legge:
  - dal `marketplace.json` delle fonti scaricate: `version`, oppure `source.sha`, che vale per la versione installata `sha12-hash` dei plugin presi da git;
  - da `folderVersion`, per le fonti in una cartella.
- **`plugin install --yes`.** Non vuol dire più «niente domande»: accetta il comando dichiarato dal marketplace.
- **`plugin marketplace remove`.** Disinstalla anche i plugin di quella fonte, con i loro dati.
- **Le chiavi degli MCP:**
  - `disabledMcpServers` per spegnere, in `.claude.json`;
  - `enabledMcpjsonServers` e `disabledMcpjsonServers` per approvare o rifiutare, in `.claude/settings.local.json`;
  - `deniedMcpServers` per vietare un server, valido in ogni file di impostazioni e con `--settings`.
- **`skillOverrides`.** Accetta `on`, `name-only`, `user-invocable-only` e `off`, ma non vale per le skill dei plugin.
- **Quando le modifiche si vedono.** Le skill si rileggono da sole anche nelle chat aperte (`/reload-skills` serve solo se la cartella non c'era). Per plugin e MCP serve una chat nuova, oppure `/reload-plugins`.

# Lo stato di ogni voce, uguale ovunque

- `src/shared/negozio.ts` ha gli stati, i testi e la lettura delle risposte del CLI:
  - `statoPlugin`, `statoSkill`, `statoMcp`;
  - `cosaCambia`, cioè cosa cambia dopo ogni azione;
  - `esitoCli`, `motivoLeggibile`, `saluteDaMcpList`, `aggiornamentoDisponibile`, `vetrina`, `comeMostrare`.
- Il PC mette `stato` (etichetta, tono, spiegazione) in ogni voce. Pannello, pagina e app lo **mostrano**, non lo ricalcolano.
- Con un PC di prima, app e pagina ripiegano su attivo, spento o da installare.
- La risposta d'esempio di `/api/negozio` per l'app (`android/app/src/test/resources/negozio/api-negozio-0.53.json`) la fanno le funzioni vere. `tests/shared/negozio-app.test.ts` controlla che sia la stessa, e `NegozioVistaTest.kt` la legge.

# Trappole

- **Percorsi lunghi su Windows.** Con una cartella di configurazione dal percorso lungo, `git clone` dei plugin fallisce con «Filename too long»: è successo nella prova. Il messaggio ora dice il rimedio (`git config --global core.longpaths true`).
- **Comandi del marketplace da confermare.** Nessun marketplace di prova dichiarava un comando: il giro `shownCommand` → conferma → `--accept-command` è provato solo sul formato descritto da `claude plugin install --help`. Il campo del testo del comando si cerca in `command`, `display`, `text` e `cmd`.
- **`claude mcp get` stampa i valori delle variabili e delle intestazioni in chiaro.** Non usarlo per mostrare qualcosa.
- **I connettori di claude.ai** (per esempio «claude.ai Claude Docs») compaiono in `mcp list` ma non nei file: sono «altro», in sola lettura.

# Proposta, non fatta: lo scoping per chat

Lo scoping per chat **c'è già**: è la linguetta «Questa chat», con `--settings` all'avvio della chat e la chiave per cartella in `negozio-scope.json`. La «mancanza» nella memoria era vecchia; la parte MCP era rotta ed è corretta.

Si potrebbe:
- passarlo per **singola chat** invece che per cartella;
- mostrarlo nell'app.

# Da provare con Nicholas

1. Il pannello sul PC dopo l'aggiornamento: «Plugin», «Da aggiornare», «MCP» → «Verifica i collegamenti».
2. Dal telefono: una ricerca, l'installazione di un plugin da GitHub (deve arrivare in fondo anche se ci mette più di 15 s), un MCP spento e riacceso.
3. Dalla pagina: Computer → Negozio.
