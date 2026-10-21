---
titolo: "Test lenti a PC carico (0.81.0): import a freddo dentro i test e troppi avvii di git"
quando: 2026-10-20T19:15:00+02:00
tag: ["test", "vitest", "criteri", "prestazioni", "0.81.0"]
---

# Test che scadevano col PC carico (20/10, c-17)

Tutto misurato col PC al 100%, con le suite delle altre chat e del servizio aperte. Va letta insieme a `suite-orfane-criteri-0-81-0.md`.

## La causa vera: il PC carico, non file appesi
I criteri dei test scadevano perché il servizio installato (0.80.1) lasciava aperte le suite dei criteri scaduti. Ce n'erano fino a 21 insieme, con la CPU al 100%. Nessun file di test era appeso: misurati uno per uno, chiudono tutti. Col PC carico, però, tre test superavano il loro tempo, per le cause qui sotto.

**Esito:**
- alle 16:39, «Gli altri test del programma passano» e Android verdi;
- alle 16:53, «I test del programma principale passano» verde (comando nuovo: `node node_modules/vitest/vitest.mjs run tests/main --maxWorkers=2`, senza `npx`);
- le tre correzioni sono in main (unione `2ee49e1a`).

## La regola che esce da qui
**Un modulo di `src` si importa in cima al file di test, non con `await import(...)` dentro il test.** A freddo, la trasformazione di un modulo grande (es. `client-server`, `client-rotte`) costa decine di secondi e viene contata nel tempo del test, che è di 20 s. L'import dinamico serve solo se ci sono `vi.mock`, `vi.doMock` o `resetModules`, oppure se il modulo legge `window` o l'ambiente **al caricamento**. In tutti gli altri casi va in cima.

Era già successo il 19/10 con `rimozione-sicura.test.ts`.

## Corretti
| File | Test | Causa | Prima | Dopo | Commit |
|---|---|---|---|---|---|
| `tests/main/file-autopilota.test.ts` | «file in commit dalla partenza e file da salvare, con il diff» | non appeso: circa 36 avvii di git, ognuno 0,5-4 s a PC carico (misurati uno per uno; un processo vuoto costa 0,4 s). Ogni chiamata al diff ricalcola l'elenco. | 40-60 s, scaduto a 60 | 30 s | `498f2b7f` |
| `tests/main/pc-remoto.test.ts` | «i due lati insieme…» | `client-server` importato dentro il test | 20,1 s, scaduto | 0,83 s | `6fc4fab7` |
| `tests/renderer/cambio-schermo.test.ts` | «scrive nel registro e, per un autopilota, non cambia» | due moduli importati dentro il test dopo `resetModules` | 8 s sotto carico (1,2 s oggi) | 2 ms | `3f14cbaf` |

Per `file-autopilota` la correzione sta nel test e non tocca il codice:
- autore e `core.autocrlf` passano dall'ambiente invece che da tre `git config`;
- le chiamate al diff passano da un git vero che ricorda le risposte (il repository non cambia fra una chiamata e l'altra).

## Misure
**tests/main.** Gruppi di 10 file, uno alla volta, con un tetto di 300 s ciascuno:
- 19 gruppi, nessuno al tetto;
- circa 436 s di test veri, mentre i gruppi in tutto sono durati circa 36 minuti: il resto è trasformazione e caricamento dei moduli;
- un solo test rosso, `pc-remoto`.

Intera dopo le correzioni: **verde, 1807 test, 374 s**.

**Altri test, una cartella alla volta:**

| Cartella | Test | Tempo |
|---|---|---|
| `tests/renderer` | 558 | 57 s |
| `tests/autopilot-host` | 634 | 155 s |
| `tests/shared` | 1498 | 209 s (190 s di trasformazione e caricamento) |
| `tests/pty-host` | 35 | 14 s |

Tutte verdi, nessun file che non chiude.

Il criterio intero (`tests/autopilot-host tests/renderer tests/shared tests/pty-host --maxWorkers=2`), con le correzioni: **verde, 2725 test, 306 s**. Sta sotto i 9 minuti.

## A rischio, non corretti (oggi passano)
- **`cassaforte-pacchetto.test.ts`, «regge un contenuto grosso»:** 17 s. Comprime e decomprime 8 MB, è lavoro vero di CPU.
- **`autopilot-host/worktree.test.ts`:** 5-16 s per test. Sono git veri: worktree, unioni, conflitti.
- **`server.test.ts`, «riprendere un autopilota in intervista»:** 7,8 s. Interroga il servizio a ripetizione e crea l'autopilota con `cwd: process.cwd()`, cioè dentro il repository vero, che è grande.
- **Altri file con `await import('../../src/main/…')` dentro i test**, senza mock: `portatile-non-raggiunto`, `grafica-0-81-0`, `residenza`, `registro`, `quaderno-store`, `prove-senza-avanzi`, `identita-app`, `consegna-durante-il-turno`, `cassaforte-motore`, `cassaforte-magazzino`, `cassaforte-google-drive`. Se uno diventa rosso per tempo, la correzione è la stessa: import in cima.

## Attese fisse sullo schermo di xterm (21/10, c-39)
- **Trappola:** `digerisci = () => new Promise(r => setTimeout(r, 20))` nei test con `@xterm/headless`. A PC carico xterm non ha ancora scritto e il test legge lo schermo vecchio.
- **Rimedio (in `tests/main/sottofondo.test.ts`):** nel `creaTerminale` del finto, avvolgere `t.write` e passare il callback di xterm (`write(data, cb)`). Si contano le scritture in sospeso e `digerisci` aspetta che siano zero.
- **Controprova:** con un `digerisci` che non aspetta niente devono cadere dei test. Se non cade niente, l'attesa non serve a nulla.
- **Ancora da fare:** lo stesso `setTimeout(r, 20)` c'è in `consegna-durante-il-turno.test.ts` e in `consegna-in-sottofondo.test.ts`.
- **Sotto carico doppio** (le due suite in parallelo) cadono per tempo `cassaforte-pacchetto` (20 s) e `ospite` «claude.exe parte solo da lì» (60 s). Da soli passano.
- **Copia di lavoro di una chat senza `node_modules`:** si collega quello della cartella principale con una junction (`New-Item -ItemType Junction -Path node_modules -Target <principale>\node_modules`). Git la ignora (`node_modules/`). Si toglie con `cmd /c rmdir node_modules`, che toglie solo il collegamento.
