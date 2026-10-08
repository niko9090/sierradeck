---
titolo: "Rispondere alle domande delle chat (0.52.5, app 2.52.5): cause vere e prove dal vero"
quando: 2026-10-08T13:15:00+02:00
tag: ["domande", "AskUserQuestion", "scelte", "telefono", "pagina", "autopilota", "ospite", "prova-dal-vero", "causa"]
---

# La segnalazione (Nicholas, 08/10)

«Non riesco a rispondere alle domande. Controlla bene e migliora il tutto».
Gli autopiloti non avevano domande aperte: erano le domande delle **chat**.

# Causa vera 1: le domande di Claude Code non venivano riconosciute

Provato con `claude.exe` 2.1.293/2.1.294 in un pty, con lo schermo letto da xterm come fa il programma.

- AskUserQuestion disegna **una riga di spiegazione sotto ogni opzione**, `4. Type something.`, una cornice e `5. Chat about this`.
- `scelteDiTerminale` voleva le righe numerate **attaccate**, quindi per quelle domande restituiva `undefined`.
  - Su colonna Domande, pagina e app la chat compariva come «ha finito», con il solo campo di testo.
- **Il danno:** scrivere «Verde» e mandare finiva nel selettore, e Invio sceglieva **la prima opzione**. Provato: Claude riceveva «Rosso».
- Un numero digitato è una scorciatoia di Claude Code e risponde **subito**: l'Invio che seguiva andava nella domanda dopo.
- I permessi («Do you want to proceed? 1. Yes 2. No») erano già riconosciuti, perché hanno le righe attaccate.

# Cosa fa la 0.52.5

- **Riconoscitore** (`src/shared/scelte-terminale.ts`). Fra due opzioni ammette righe vuote, spiegazioni (rientro ≥ 4), cornici e la riga `Submit`.
  - Campi nuovi dell'opzione: `descrizione`, `libera` («Type something.», anche con il testo già scritto dentro), `spuntata` (caselle `[ ]`/`[✔]`) e `invio`.
  - Nella scelta multipla, `Submit` è una fermata del cursore con `numero: 0`.
  - Il cursore resta obbligatorio, come prima.
- **Tasti a pezzi** (`tastiPerRisposta`): frecce, poi il testo della risposta libera, poi Invio, ognuno a 150 ms dal precedente.
  - Strada: `tastiAChat` → IPC `client:tasti` → `suTasti` in `App.tsx`.
  - Mai il numero dell'opzione.
- **Testo scritto a una chat ferma su una scelta** (`rispostaDaTesto`, in `/api/scrivi`):
  - testo o numero di un'opzione → quell'opzione;
  - sì/ok/no → Yes/No;
  - «invia» → Submit;
  - qualunque altra cosa → «Type something.»;
  - se la domanda non ha «Type something.» (un permesso), risponde 409 con le opzioni e non scrive niente.
- **Lo schermo di adesso** (`schermoDi`) vince sulla foto, in `/api/scegli` e in `/api/scrivi`.
- **La firma** (`firmaScelte`, condivisa con pagina e app) conta le spunte: nella scelta multipla un tocco non nasconde la domanda per 8 s.
- **Grafica:**
  - spiegazione piccola sotto ogni opzione, ☑/☐, «Manda le scelte spuntate (Submit)»;
  - toccare «Type something.» dice di scrivere nel campo;
  - il 409 si mostra con la frase del PC.
  - Sul PC stanno in `EtichettaOpzione.tsx` (colonna e riquadro remoto), nella pagina in `etichettaOpzione`, nell'app in `SceltaVista.kt` / `TestoOpzione`.
- **Schermi veri:** `tests/fixtures/claude-2.1.294-domande/*.txt`, più `scelte.json`, che leggono il vitest e `SceltaVistaTest.kt`.

# Causa vera 2: autopilota NexoraOS, «il terminale della chat non è nato» (07/10 16:24 UTC)

- La chat dell'autopilota aveva la casa su un altro PC, decisa dalla **regola** della migrazione del 02/10 («la sua cartella c'è solo su quel PC»). Poi la cartella è arrivata anche qui.
- Alla consegna il riquadro si sveglia, `pty:spawn` passa dal cancello dell'ospite 0.52.0, che rifiuta l'avvio. Il riquadro diventa remoto e dopo 90 s arriva «guasto».
- Il registro lo mostra in ordine: «riquadro addormentato, lo sveglio» → «[remoto] … strada Tailscale» → «resa dopo 90 s, terminale mai nato».
- **Regola nuova** (`casaPerAutopilota` in `src/shared/ospite-chat.ts`): una chat governata vive sul PC del suo autopilota.
  - Casa altrove per regola o nascita → la prende questo PC, con fonte `sposta`. Pesa come una scelta, quindi l'altro PC chiude la sua copia, e si propaga con `/api/case`.
  - Scelta di Nicholas altrove → resta. La consegna lo dice subito, senza chiamarlo «guasto».
- **Dove:**
  - `fermaSeCasaAltrove` riceve `req.autopilota`;
  - `ospite.casaAltrovePerAutopilota`;
  - la guardia in `index.ts` funziona anche prima che l'ospite sia pronto (`daPrendereDopo`).
  - Nella consegna, un riquadro remoto viene riportato qui una volta (`riportaQui`); se resta remoto, la consegna lo dice dopo 8 s (`ATTESA_RIPORTO_MS`).

# Prove dal vero (08/10, claude.exe 2.1.294, Haiku), un caso per riga

Rotte vere del PC dietro il server HTTP vero: colonna = chiamata diretta; telefono = chiave del dispositivo, la strada di app e pagina; altro PC = chiave di casa con `creaClientPcRemoto`, cioè il ponte e il riquadro remoto.

| Strada | Tipo | Tasti | Claude ha ricevuto | Domanda sparita | Chat ripartita |
|---|---|---|---|---|---|
| colonna PC | scelta singola, tocco «Verde» | `↓ ⏎` | «Verde» | sì | sì |
| telefono | testo libero «Pappagallo» scritto nel campo | `↓↓`, testo, `⏎` | «Pappagallo» | sì | sì |
| telefono | multipla: tocco 1ª e 3ª opzione, Submit, «Submit answers» | `⏎` / `↓↓ ⏎` / `↓↓ ⏎` / `⏎` | «Lunedì, Mercoledì» | sì | sì |
| altro PC | due domande: tocco «Blu», scritto «2», riepilogo | `↓ ⏎` / `↓ ⏎` / `⏎` | «Blu», «Due» | sì | sì |
| telefono | permesso: scritto «forse» | nessuno, 409 con «1. Yes, 2. No» | — | — | — |
| telefono | permesso: scritto «sì» | `⏎` | comando eseguito, «54» | sì | sì |
| altro PC | chat con PIN: senza PIN scegli/scrivi | nessuno, 423 | — | — | — |
| altro PC | chat con PIN: dopo il PIN giusto, tocco «Blu» | `↓↓ ⏎` | «Blu» | sì | sì |
| (prima, 0.52.4) | scritto «Verde» nel campo | testo + `⏎` nel selettore | «Rosso» (la 1ª) | — | — |

- **Autopilota:** la linguetta Domande risponde con `/api/rispondi` al servizio. Non è cambiata ed è coperta da `domande-dal-servizio.test.ts`, che usa il servizio vero. Una chat **governata** ferma su AskUserQuestion compare nelle Domande come scelta, perché `raccogliDomande` esclude le governate solo dalle «ferme».
- **Validazione delle 5 parti:** riguarda solo la domanda scritta dal supervisore, che passa comunque con un'avvertenza. Le risposte non vengono mai controllate.

# Trappole

- Le opzioni le scrive Claude: «Lunedi» o «Lunedì» cambia da un giro all'altro. Il PC confronta il testo esatto e risponde 409 «cambiata» se non torna, che è giusto. Nelle prove leggere i nomi dallo schermo.
- Una chat con il PIN chiuso non mostra la domanda da fuori (0.49). Si vede dopo lo sblocco.
- Le chat degli **altri PC** nelle Domande arrivano dal battito, che non porta le opzioni: compaiono come «ha finito», senza pulsanti. Scrivere la risposta funziona lo stesso, perché `/api/scrivi` del loro PC la legge come scelta, ma solo se quel PC ha la 0.52.5. Dal riquadro remoto i pulsanti ci sono.
- Lo strumento di prova (`node-pty` + `@xterm/xterm` in Node, senza DOM) funziona: `righeDaSchermo(t.buffer.active, …)` dà le stesse righe del programma.
