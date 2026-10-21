---
titolo: "Rapporto 0.82.1: le chat non si bloccano più (cause e numeri)"
quando: 2026-10-21T17:30:00+02:00
tag: ["release", "0.82.1", "autopilota", "criteri", "supervisore", "rapporto"]
---

Patch chiesta da Nicholas il 21/10 («non sto riuscendo a lavorare»). Fatta da c-53 sul ramo `rilascio/0.82.1`, partito dal tag **v0.82.0** (senza niente della 0.83.0). Le stesse correzioni sono in main, dal ramo c-53. **Non installata.**

## Le cause, dai registri di questo PC (20 e 21/10)

1. **Il PC soffocato dai criteri.** Ogni chat che finiva un turno rilanciava i suoi criteri, e i comandi lunghi (vitest, gradle) partivano tutti insieme. Al picco del 21/10 ce n'erano **34 insieme** (16 il 20/10). Le suite scadevano senza un test rosso («rosso per tempo scaduto»: 125 volte il 20/10, 64 il 21/10).
   La cache non teneva per due motivi:
   - l'impronta del codice comprendeva lo stato della cartella principale, dove consegne e file del programma cambiano di continuo senza un commit;
   - la cache scadeva dopo 10 minuti.
   C'era anche un errore di riconoscimento: `node node_modules/vitest/vitest.mjs run` non era riconosciuto come comando lungo.
2. **Il supervisore scaduto.** Il supervisore è un altro `claude` sullo stesso PC carico, e scadeva dopo 5 minuti: 23 volte il 21/10. Si riprovava subito, e la chat restava ferma nell'hook altri 5 minuti. Poi decidevano le regole, che con i criteri verdi sanno dire solo «rileggi l'obiettivo». Dopo 3 giri uguali l'antiloop sospendeva la chat.
3. **Git Bash non trovato** da alcune chat (c-41, c-459, c-502). L'hook ECC `hookify-runtime` scadeva, e il suo blocco valeva come rifiuto di tutti gli strumenti.
4. **Chat che aspettano un'altra chat** giro dopo giro, senza che nessuno le sbloccasse.

## Le correzioni (ognuna con i suoi test)

- **(a) Criteri.** L'esito si ricorda per commit e comando, senza scadenza; si rimisura solo quando cambia il commit di main o del ramo. «Non misurato» e «scaduto per tempo» non si ricordano. Se due chat chiedono la stessa misura insieme, il comando gira una volta sola. I comandi lunghi vanno uno alla volta per PC, in fila (`turni-criteri.ts`). Un'unione aspetta il comando lungo che gira nella sua cartella, e intanto lì non ne parte un altro.
  Test: `turni-criteri.test.ts`, `criteri-veloci.test.ts`.
- **(b) Supervisore scaduto.** Non si riprova più subito: la chat prosegue con l'ultima istruzione valida e il supervisore riprova al giro dopo. Al terzo mancato di fila arriva a Nicholas una riga (avviso «da sapere»), una volta sola; da lì il supervisore si interroga un giro ogni tre. Niente si sospende: l'antiloop non conta i giri senza supervisore. L'antiloop usa ora l'impronta completa del lavoro (`improntaLavoro`), non il solo commit.
  Test: in `server.test.ts` e in `rete-sicurezza.test.ts`.
- **(c) Git nel PATH di ogni chat e del supervisore** (`main/git-nel-path.ts`). L'installazione si cerca in quest'ordine: preferenza `percorsoGit`, PATH del programma, PATH di sistema e utente dal registro, `InstallPath` di Git per Windows. Si aggiungono `cmd` e `bin` in fondo al PATH e `CLAUDE_CODE_GIT_BASH_PATH`. Nessun percorso scritto nel codice. Un `PATH` con maiuscole diverse non si duplica più.
  Test: `tests/main/git-nel-path.test.ts`.
- **(d) Chat che aspetta un'altra** (`attese-chat.ts`). L'autopilota riconosce «aspetto c-N», «in attesa di c-N» e simili.
  - Al 2° giro di fila: **sblocca** («ha finito, fai git merge e prosegui»), oppure **sposta** («fai intanto il resto del tuo compito»).
  - Al 3° giro: **chiude** la chat. Il lavoro resta sul suo ramo e il compito torna in coda, dopo quello della chat attesa.
  Test: `attese-chat.test.ts` e due prove in `server.test.ts`.

## I numeri

Misure dei criteri, ricalcolate sui registri veri come se ci fosse già la 0.82.1 (una misura per commit e comando; script in scratchpad, `misure.py`):

| Giorno | Prima | Dopo | Comandi lunghi insieme (picco) |
|---|---|---|---|
| 20/10 (17,2 ore) | 679 (39,5 all'ora), 383 lunghe | 180 (10,5 all'ora), 89 lunghe | 16 → 1 |
| 21/10 (14,5 ore) | 459 (31,6 all'ora), 253 lunghe | 227 (15,6 all'ora), 110 lunghe | 34 → 1 |

Il «dopo» è una stima prudente: le misure fatte nelle copie delle chat, quando il ramo non c'è più, sono contate tutte. Il conto vero si fa dal registro dopo l'installazione: righe `[criterio] parte in` all'ora.

## Revisione

Fatta da un revisore TypeScript sul diff di c-53. Nessun bug grave né deadlock.

Sei punti medi e bassi, corretti con i loro test (commit `730f3b0b` sul ramo di rilascio):
- la fila dei comandi lunghi non si ferma più dietro chi aspetta un'unione;
- l'impronta della cache conta anche le modifiche non salvate ai file tracciati, esclusa `.sierradeck/`;
- al massimo 600 esiti ricordati;
- una strategia nuova delle regole vale più dell'ultima istruzione;
- una chat chiusa in attesa non conta come fatta;
- Git va sopra l'ambiente del fornitore.

Un punto resta aperto, per scelta della consegna («senza sospendere»): con il supervisore guasto del tutto e i criteri verdi, la chat continua a girare finché lui non torna a rispondere. Nicholas lo sa dall'avviso al terzo giro. Da riguardare nella 0.84.0 (blocchi).

## Release

- **v0.82.1 pubblicata il 21/10 alle 17:05**, non bozza, «Latest». Tag `v0.82.1` sul commit `730f3b0b` del ramo `rilascio/0.82.1`: v0.82.0 più le correzioni, le novità e `chore(versione)`. Su origin è stato spinto solo il tag.
- Allegati (5, tutti «uploaded»):
  - `SierraDeck-Setup-0.82.1.exe` e il suo `.blockmap`;
  - `latest.yml` (dice 0.82.1; la `size` combacia con l'exe);
  - `SierraDeck-2.82.0.apk`, riallegato da v0.82.0 con `npm run allega-apk -- --senza-build` (firma Ferrari Consulenze verificata; `android/` non è cambiato);
  - `app-android.json`.
- Test sul ramo di rilascio: typecheck pulito. 4725 test verdi (main, servizio, renderer, condivisi, pty), poi 2268 rifatti dopo le correzioni della Revisione.
- **Mai installata da noi.** La installa Nicholas.
- **In main** le stesse correzioni arrivano dal ramo c-53 (commit de4a9468, d61ae879, 4df4161f, 490bc4ad e quello della Revisione). La versione di main resta quella della 0.83.0 in arrivo.
- La copia `SierraDeck.sierradeck-wt\rilascio-0-82-1` resta sul disco con `dist/`. La sua `node_modules` è una junction verso la cartella principale: per toglierla usare `rmdir` sulla junction **prima** di cancellare la cartella, mai `rm -rf` attraverso la junction.

## Trappole viste durante il lavoro

- Gli **hook ECC sono accesi in questa copia** (`GateGuard`): chiedono i «fatti» alla prima modifica di ogni file. Rallenta, ma non blocca.
- **Bash → Python con heredoc**: le barre rovesciate e i caratteri non ASCII (—, emoji) si rovinano, e le sostituzioni falliscono in silenzio (in un caso sono finiti byte NUL nel sorgente). Le modifiche vanno scritte da file con lo strumento di scrittura, o con l'editor.
