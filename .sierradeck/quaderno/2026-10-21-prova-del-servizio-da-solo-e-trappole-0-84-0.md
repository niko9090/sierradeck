---
titolo: "Provare il servizio degli autopiloti da solo, e le trappole trovate (0.84.0)"
quando: 2026-10-21T19:10:00+02:00
tag: ["prova", "servizio", "autopilota", "trappola", "git", "0.84.0"]
---

## Il servizio vero da solo, senza l'app (c-56, 21/10)

Per una prova di durata non serve tutta la copia di prova con la finestra. Basta il servizio di un ramo:

1. `npx electron-vite build`, che produce `out/main/autopilot-host.js`.
2. `node out/main/autopilot-host.js` con queste variabili:
   - `APPDATA=<cartella di prova>`: archivio, registro ed errori finiscono lì;
   - `SIERRADECK_PORTA_AUTOPILOTI=47651`: mai 47630, che è il servizio vero;
   - `SIERRADECK_VERSIONE=…-prova`.
3. Un programmino fa la parte delle chat e del Gestore:
   - le chat: `POST /hook/pretool` e `/hook/stop?ap=&chat=`;
   - il Gestore: `GET /consegne` → `/consegne/conferma` → `/consegne/esito {partita}`, poi `/battiti {segni, ferme}` e `/stato-programma`.

Il supervisore resta il `claude` vero.

**Trappole della prova:**
- **L'archivio scritto a mano vuole `"versione": 1`.** Senza, il servizio lo mette da parte come `…json.illeggibile-1` e l'autopilota sparisce.
- **Senza `/stato-programma` lavorano al massimo 2 chat:** le altre vanno «in pausa: limiti del piano non ancora letti». Va mandato `{letto, chat: [], limiti: {cinqueOre: {percentoLetto, lettoIl}, settimana: {…}}}`.
- **Le chat di una flotta senza ruolo uniscono il ramo a ogni turno.** Con `ruolo: 'sviluppo'` il ramo passa prima dalla Revisione.
- **Per cancellare una cartella di prova, il percorso va scritto per intero.** La guardia di SierraDeck blocca `Remove-Item $p`, perché il percorso contiene una variabile. Più semplice: una cartella nuova per ogni prova (`note/prova-084b`, `…c`), tolte alla fine con il loro nome.

## Trappole del codice

- **Nel servizio, mai `spawnSync` dove passa un giro.** Ferma tutto il processo: hook, salute e guardiano. Il 20/10 la sola unione ha fermato il servizio 33 minuti. Le operazioni git dei giri ora sono «passi» (generatori) in `worktree.ts`, e girano sia col git sincrono sia con quello asincrono.
- **Un'operazione che diventa asincrona perde l'atomicità.** Due `git merge` nella stessa cartella ora possono incrociarsi. `turni.unione` ne tiene una sola per cartella, e il posto va preso **dentro** il controllo di `aspetta`: fra un `await` e l'altro, un'altra unione vedrebbe la cartella ancora libera.
- **Una funzione `async` che restituisce una promessa la fa aspettare a chi chiama.** In un test, `async function x() { return { risposta } }` va bene; `return risposta` invece blocca il test fino a quando la promessa si risolve.
- **I salvataggi di un turno dopo un `await` non devono riscrivere la coda.** Il guardiano può aver consegnato o messo da parte qualcosa nel frattempo. Si salva con `salvaNelTurno` (`codaDalDisco`), non con `salva`.
- **Un worktree non ha `node_modules`.** Per `tsc` e `vitest` serve un collegamento alla cartella principale (`mklink /J`). Si toglie con `rmdir`, mai con una cancellazione ricorsiva: cancellerebbe i `node_modules` veri.
- **Gli heredoc della Bash di Git mangiano i backslash.** `'C:\\x\\'` diventa `'C:\x\'`. Per il codice si usa lo strumento di scrittura dei file.
