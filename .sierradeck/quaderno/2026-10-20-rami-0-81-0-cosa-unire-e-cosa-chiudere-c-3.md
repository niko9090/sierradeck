---
titolo: "Rami della 0.81.0: cosa unire e cosa chiudere (Revisione di c-3, 20/10)"
quando: 2026-10-20T16:05:00+02:00
tag: ["0.81.0", "rami", "revisione", "rilascio"]
---

Consegna c-284. La Revisione è stata fatta in sola lettura con `git diff main...ramo`.

| Ramo | Decisione | Perché |
|---|---|---|
| c-241 (= c-22) | **unito** (b8cc5b4b, c-3) | notifiche: consegne in sottofondo al primo colpo, niente doppio lampeggio, salvaLavoro solo nel worktree. Typecheck ok, 41 test dei file toccati verdi |
| c-12 | unito (94584ef4) da una terza chat, né c-3 né c-289 | riquadro «Adesso» e «Hai risposto» |
| c-12-verifica, c-18 | uniti dalla stessa terza chat | c-18: Drive e dati, Revisione senza bug |

**Dal 20/10 alle 16:10 le unioni le fa solo c-289.** c-3 non tocca più main. c-289 unisce c-10 e c-24 e chiude gli altri rami.
| c-24 | **da unire** | contiene c-231/c-20: 20 minuti per i comandi vitest. La regola riconosce anche i due criteri divisi, `tests/main` e il resto. Conflitto solo in `analisi-0-80-0.md`: si tengono le due sezioni |
| c-10 | **da unire dopo una correzione** | righe brevi nella conversazione. L'unico conflitto è l'import da `@shared/autopilota` in `server.ts`: si tengono `conStatiDatati`, `SILENZIO_DA_DIRE_MS` e `ultimoTraguardoDi`. Tocca `Panoramica.kt`, quindi l'APK va ricompilato |
| c-20, c-231 | chiudere | sono dentro c-24 |
| c-23, c-248 | chiudere | correggono lo stesso `worktree.test.ts` in modo peggiore: il beforeAll non ha un tempo suo e cade nei 20 s |
| c-3 | chiudere | i 2 commit sono doppi di c-14, già in main (`errori-arrivati-lavoro.ts`) |
| c-12-0-80-1 | chiudere | è dentro c-12 |
| c-19 | chiudere | contiene solo la scheda «rilascio in attesa», ormai superata |

## Note di Revisione da tenere d'occhio
- **Tetto dell'hook:** è 3600 s, pensato per una suite e la sua rimisura. Con due criteri vitest che scadono tutti e due si arriva a 80 minuti nel caso peggiore. Se capita, basta portare `TIMEOUT_HOOK_S` a 5400.
- **c-10:**
  - il testo «se tace per un'ora» è scritto fisso;
  - per un ramo unito possono uscire due righe, «Revisione: … unito» e «Sviluppo: X unito».

## Trappola
**Due chat Rilascio hanno ricevuto la stessa consegna e univano in main insieme.** Un `git merge` lanciato mentre l'altra chat risolveva un conflitto si è fermato con «Exiting because of an unresolved conflict», senza danni.
- **Prima di unire:** guardare `git reflog -5` per vedere chi sta unendo, e mettersi d'accordo su chi unisce.
- **I test:** su main girano già i giri di vitest delle altre chat. Dopo ogni unione bastano il typecheck e i test dei file toccati; i due criteri interi si lanciano una volta sola, a macchina scarica.

## Punto 2 della consegna (i due workspace del 19/10)
Non si può fare adesso, per due motivi:
- `/api/workspace/elimina` è vietata alle chat e non va aggirata a mano (`pulizia-19-10-visitafacile-e-nexora.md`);
- «Elimina workspace» esiste solo dalla 0.81.0.

Si fa dopo che Nicholas l'ha installata, in quest'ordine: prima l'autopilota va in NexoraOS, poi i due workspace vanno nel recupero.
