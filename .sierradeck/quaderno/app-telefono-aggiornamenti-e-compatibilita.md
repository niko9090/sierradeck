---
titolo: "App del telefono: aggiornamenti da sola e compatibilità con i PC vecchi (0.43.0, app 2.46.0)"
quando: 2026-10-02T16:00:00+02:00
tag: ["android", "aggiornamenti", "compatibilita", "workmanager", "notifiche", "font", "decisione-nicholas", "trappola"]
---

# Le richieste (Nicholas, 02/10)

«Vorrei che nel cellulare l'app cercasse per i cavoli suoi la versione disponibile e che sia sempre compatibile con le versioni precedenti. Migliora anche l'app in generale del cellulare perché non mi piace molto.»

I miglioramenti generali per ora sono solo i punti aperti dell'analisi del 30/09: carattere, parole di stato, notifiche. Le «due o tre cose che danno più fastidio» le deve dire Nicholas: niente restyling inventato.

# Aggiornamenti da sola

- **Il controllo** è in `ControlloApp.kt` ed è un `CoroutineWorker` di WorkManager (`work-runtime-ktx` 2.9.1).
  - Gira ogni 8 ore (`enqueueUniquePeriodicWork`, KEEP) e una volta a ogni avvio (`enqueueUniqueWork`, REPLACE), con la rete come vincolo.
  - Lo programma `MainActivity.onCreate`, anche prima dell'accoppiamento.
  - Legge **direttamente** `releases/latest/download/app-android.json` (`Aggiornamenti.fileDaGitHub()`): niente PC, niente limite dell'API.
- **Una notifica sola per versione**: `daNotificare(installata, trovata, giaNotificata)` è pura, e l'ultima versione notificata sta nelle preferenze `aggiornamenti`.
  - È sul canale «Aggiornamenti dell'app», con le note (al massimo 3 righe) e l'azione «Scarica e installa».
  - L'azione apre `MainActivity` con `aggiorna_versione` e `aggiorna_apk` (APK controllato con `apkAmmesso`), poi `Apertura.aggiornamento` apre il dialogo di sempre (`DialogoAggiornamentoApp`).
- **`app-android.json`** dalla 0.43.0 è `{ versione, apk, programma, note }`.
  - Le note sono le righe di `novita.ts` di quella versione, senza `**` (`scripts/note-novita.mjs`).
  - Le app vecchie leggono solo `versione` e `apk`: niente si rompe.

# Compatibilità

- **App verso PC vecchi:**
  - `FunzioniPc.kt`: la versione minima di ogni funzione, presa dal git (`git log -S` sulla rotta più `git describe --contains`).
  - `PcCorrente.versione` arriva da `/api/ciao` (da sempre) e da `/api/stato.computer.versione` (dalla 0.43.0).
  - Una funzione mancante si mostra **spenta**, con «… arriva aggiornando il PC alla X». Senza versione nota si prova: un 409, o il 404 generico `{"errore":"non trovato"}`, dice la stessa cosa. Un 404 con un altro motivo resta quel motivo.
- **Le risposte vere dei PC vecchi:** `android/app/src/test/resources/pc/{0.36.0,0.38.0,0.42.0}/*.json|.stato`.
  - Generate così: worktree sul tag, `deps()` del loro `client-rotte.test.ts`, bundle esbuild con `@shared` della versione, rotte chiamate davvero. `ciao.json` è corretto con la versione del tag, perché le deps dei test dicono `0.5.0`.
  - Test: `CompatibilitaPcTest`.
- **PC verso app vecchie:** `tests/main/compatibilita-app-vecchie.test.ts`.
  - Controlla le rotte di oggi (`stato`, `domande`, `autopilota`, `app`, `ciao`) contro i modelli dell'app 2.39.0, estratti da `Modelli.kt` del tag v0.36.0 in `tests/fixtures/app-2.39-modelli.json`.
  - Guarda i campi obbligatori e il tipo di ogni campo presente.

# Il difetto trovato dal test (trappola)

- **Cosa succedeva.** In `/api/domande.voci`, le risposte da toccare di un **autopilota** erano **stringhe**, mentre ogni app legge `opzioni` come oggetti `{numero, testo, scelta}`. kotlinx non decodificava, e l'intera scheda Domande dell'app andava in errore.
- **Da quando.** C'era dalla 0.36.0. Dalla 0.41.0 ogni domanda del supervisore ha le sue scelte, quindi il difetto capitava sempre.
- **Correzione su due lati:**
  - il PC manda oggetti (`vociPerLeApp` in `domande-telefono.ts`);
  - l'app li legge anche come stringhe (`OpzioneTollerante`, un `JsonTransformingSerializer`), per i PC dalla 0.36 alla 0.42.

# Miglioramenti (punti aperti del 30/09)

- **Il carattere.** JetBrains Mono (OFL 1.1) è in `res/font/`, con la licenza in `assets/licenze/JetBrainsMono-OFL.txt`. Si chiama `FontTerminale` in `Tema.kt`, al posto di ogni `FontFamily.Monospace`. Cornici e blocchi (`╭ ▄ █`) restano in colonna.
- **Le parole di stato nelle righe strette.** `parolaPerRiga`: sotto i 380 dp c'è la parola breve (al massimo 12 lettere), e il titolo ha l'ellissi.
- **Le notifiche.** Gli avvisi sono raggruppati (`GRUPPO_AVVISI`), con un riassunto silenzioso dal secondo in poi (`riassuntoAvvisi`), che apre le Domande. Hanno `setOnlyAlertOnce` e la categoria messaggio o stato.

# Da fare

- **Sul telefono vero** (S25 Ultra, adb): oggi non era collegato. Da vedere la notifica dell'aggiornamento, i gruppi e le righe strette.
- **Le preferenze di Nicholas** su cosa non gli piace dell'app.
