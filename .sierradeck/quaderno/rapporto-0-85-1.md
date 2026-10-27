---
titolo: "Rapporto 0.85.1"
quando: 2026-10-24T02:00:00+02:00
tag: ["0.85.1", "rapporto", "patch", "c-145", "c-146", "c-147", "c-148", "c-149", "c-143"]
---

# Rapporto 0.85.1 (patch)

**Stato (24/10, 01:52 ora italiana = 23/10 23:52 UTC): v0.85.1 PUBBLICATA** dalla chat c-150, sul ramo c-146, non bozza, **mai installata** (la installa Nicholas). Tag `v0.85.1` su `61f74643`, lo stesso commit di `main` su GitHub. Le 6 richieste stanno tutte nella release, con 5 file controllati: exe, blockmap, `latest.yml`, APK 2.85.1 e `app-android.json`.

**APK nuovo, 2.85.1.** c-147 ha cambiato `android/` (`IndicatoreAutopilota.kt`, promesse aperte nell'indicatore). Per questo la 0.85.1 non ha riallegato l'APK 2.85.0: è stato compilato e allegato il 2.85.1 release firmato, con `npm run allega-apk`.

## Le richieste

| # | Richiesta | Chi, commit in `main` | Prova |
|---|---|---|---|
| 1 | Supervisore: «spawn ENAMETOOLONG» (239 volte il 23/10, 124 di fila). Il prompt va sullo stdin; allarme dopo 3 fallimenti di fila | c-145, `407cc4da` | `supervisore.test.ts` (prompt di 48.006 caratteri), `indicatore-autopilota.test.ts`; il `grep` del criterio passa |
| 2 | Le chat riferiscono a ogni passo; chat muta richiamata con «dimmi il punto»; quadro per chat nel prompt e nel «?» | c-146, `7dcfd4c9` | `rapporti-chat-0-85-1.test.ts`; scheda `rapporti-chat-0-85-1.md` |
| 3 | Promesse legate a un fatto e a una scadenza | c-147, `8df8f171` | `promesse-0-85-1.test.ts` con le 7 risposte vere del 22-23/10; scheda `promesse-mantenute-0-85-1.md` |
| 4 | Guardia del PC | c-148, `d254775c` | `guardia-pc-0-85-1.test.ts`; scheda `guardia-pc-0-85-1.md` |
| 5 | Testo fluido nella scheda dell'autopilota | c-149, `362a465c` | `campo-autopilota-fluido.test.tsx`; scheda `testo-fluido-scheda-autopilota-0-85-1.md` |
| 6 | Domande del 23/10 rilette dal registro | c-143 `a7566e00`, portato da c-149 (`a362dedb`) | `domande-del-23-10-0-85-1.test.ts`, 5 test |

In più, da c-143 (`af387167`, portato da c-149 come `197d26a5`): il guardiano «installa solo Nicholas» non blocca più le copie con `../` né il `.blockmap` (riga 0u della lista). Test `divieti-installa-0-85-1.test.ts`.

## 4. Guardia del PC

Quella in `main` è di c-148: vedi `guardia-pc-0-85-1.md`. c-143 ne aveva fatta un'altra (`5425393a`) che **non è entrata**: la sua scheda `guardia-del-pc-0-85-1.md` è stata tolta perché descriveva codice che non c'è.

## 5. Testo fluido: tempo per lettera

Misurato con un autopilota di prova da 600 righe di diario e 12 chat, React in modalità sviluppo, nessun DOM nei test (il Profiler di React non gira, si cronometra il disegno del componente che tiene il testo):

| | Prima | Dopo |
|---|---|---|
| Una lettera | **≈ 620 ms** (tutta la chat; c-143 aveva misurato 643 ms) | **≈ 2–3 ms** (solo il campo) |
| Una rilettura dal servizio che cambia l'autopilota | ridisegnava anche il campo | il campo non si ridisegna (`memo`) |

Cause: il testo stava nello stato di tutta `ChatAutopilota`, e l'ora di ogni riga si calcolava con `toLocaleTimeString` (700 righe ≈ 190 ms solo di orari). Aperto, decide Nicholas: mostrare solo le ultime 200 righe del diario.

## 6. Le domande del 23/10, una per una (c-143, portate in main da c-149)

Fonti: il registro del servizio (`log/sierradeck-2026-10-23.log`, righe «domanda nuova che aspetta te»), il dialogo e il diario degli autopiloti, `domande-aperte.json`. Orari in UTC.

| Quando | Domanda | Doveva arrivare? | Causa e correzione |
|---|---|---|---|
| 03:49 | «Come vado avanti con … c-94, rimandato indietro 3 volte?» | **no**: tecnica | Regola «oltre 2 rifacimenti chiedi a Nicholas», usata anche col supervisore muto. Il rifacimento nasceva dall'ambiente della copia (manca `node_modules`). **Già tolta in 0.84.4** (`21727a1f`, `a214afd0`, test `oltre-rifacimenti-0-84-4.test.ts`). Qui il caso del 23/10 è riprodotto: si riconosce, si chiude se ancora aperta, e nel servizio la riga «chiedo a te» non esiste più |
| 05:05 | la stessa, per c-95 (3 volte) | no | come sopra |
| 06:39, 06:40 | la stessa, c-95 e c-106 | no | come sopra |
| 07:00 | la stessa, c-95 e c-106 (4 volte) | no, e ripetuta | come sopra |
| 07:22, 07:23 | la stessa (4 volte) | no, ripetuta | come sopra |
| 07:33 / 07:48 | la stessa, c-106 (5 volte) | no, ripetuta | come sopra |
| 11:42 | la stessa, da un altro PC (Gestore RDP) | no | stessa causa: sparisce quando quel PC ha la 0.84.4 o una versione successiva |
| 03:57 | due domande del 22/10 ancora aperte («rimandato indietro 5 volte») | no | chiuse dal ricontrollo come superate |
| 19:07 | «Mi dai il via?» (lavoro Revolut) | **sì**: l'avvio di un lavoro nuovo tocca a Nicholas | — |
| 19:14 | «Pubblico adesso?» (lavoro Revolut, a lavoro finito) | **sì**, ma poi **spariva da sola** | Alle 19:19:29 il diario diceva «la pubblicazione aspetta il tuo sì nella scheda Domande». Alle 19:19:50 il ricontrollo la chiudeva come «superata: il lavoro è già finito»: la domanda spariva e la pubblicazione restava appesa. **Corretto** (`a7566e00` su c-143, `a362dedb` in main): a lavoro finito il ricontrollo non tocca la domanda di pubblicazione finché aspetta il sì. Un sì arrivato dopo riapre il lavoro per pubblicare. Test: 2 rossi senza la correzione, verdi con |
| 15:09 | «Aggiornato dalla 0.84.3 alla 0.84.4 in 5 min…» | non è una domanda | avviso sull'aggiornamento, voluto |

Le domande nate dal supervisore muto («Cosa deve fare adesso la chat…?») il 23/10 **non sono arrivate**: nessuna nel registro. Le notifiche `idle_prompt` di c-144 sono state 12, fra le 18:27 e le 19:10. Le ha risposte tutte il programma, senza disturbare Nicholas. Sono ripetute perché quella chat girava a vuoto (`trappola-giro-senza-fine-chat-finita-0-85-0.md`).

## Ricontrollo dei criteri, uno per uno (c-148, 24/10, consegna c-1145)

Ogni commit è stato controllato con `git merge-base --is-ancestor <commit> main`: tutti sono in `main`. Gli 8 file di test qui sotto sono stati rilanciati insieme sul ramo c-148, che contiene tutto `main` (`777f9b52`): **110 test verdi su 110**.

| Criterio | Commit in `main` | Test che lo prova | Esito |
|---|---|---|---|
| Supervisore dallo stdin; allarme dopo 3 fallimenti | `407cc4da` (c-145) | `supervisore.test.ts` (prompt di 48.006 caratteri); `indicatore-autopilota.test.ts` («Supervisore muto»); il `grep` del criterio non trova più `'-p', prompt` | 35 + 16 verdi, grep ok |
| Rapporti delle chat a ogni passo, chat muta richiamata | `7dcfd4c9` (c-146) | `rapporti-chat-0-85-1.test.ts`: le sette forme della riga `RAPPORTO:`, «dimmi il punto», rapporto da hook e da fine turno | 14 verdi |
| Quadro intero nel prompt delle risposte e dietro «?» | `7dcfd4c9` (c-146) | `rapporti-chat-0-85-1.test.ts` («nel prompt delle risposte dalla scheda c'è il quadro intero», «lo stesso quadro nel «?» dell'indicatore»); `indicatore-autopilota.test.ts` (righe con «ultimo passo») | verdi |
| Promesse mantenute | `8df8f171` (c-147) | `promesse-0-85-1.test.ts` (con le risposte vere del 22-23/10), `promessa-autopilota.test.ts` | 17 + 4 verdi |
| Guardia del PC (85% per un minuto, memoria sotto il 15%) | `d254775c` (c-148) | `guardia-pc-0-85-1.test.ts`: soglie, attesa massima, turno dei pesanti, «no» alle chat, indicatore, servizio | 16 verdi |
| Testo fluido, tempo per lettera prima e dopo | `362a465c` (c-149) | `campo-autopilota-fluido.test.tsx`; misure nella sezione 5 (≈ 620 ms → ≈ 2–3 ms per lettera) | 3 verdi |
| Domande del 23/10 con causa e test | `a362dedb` (c-149, da c-143 `a7566e00`) | `domande-del-23-10-0-85-1.test.ts`; elenco nella sezione 6 | 5 verdi |
| Release con i 5 file | tag `v0.85.1` | `gh release view v0.85.1` (ricontrollo del 27/10, c-147): non bozza, `SierraDeck-Setup-0.85.1.exe`, `.blockmap`, `latest.yml`, `SierraDeck-2.85.1.apk`, `app-android.json` | ok |
| Nessuna funzione tolta | da `v0.85.0` a `v0.85.1` | `git diff --diff-filter=D --name-only v0.85.0 v0.85.1 -- src android/app/src/main` è vuoto: nessun file tolto (ricontrollo del 27/10, c-147) | ok |
| Rami uniti o chiusi con la scelta scritta | `cdddc545` (main = origin/main, push del 27/10 da c-157) | sezione «Rami»: fuori da `main` solo c-11, c-11-velocita, c-143, tutti chiusi col motivo | ok |

## Ricontrollo del 27/10 (c-159, consegna c-6121)

Gli 8 file di test della tabella qui sopra sono stati rilanciati insieme nella cartella principale: **110 verdi**. Ogni criterio della 0.85.1 è **già soddisfatto**:

- Supervisore dallo stdin e allarme: già soddisfatto. Prova: `407cc4da`, `supervisore.test.ts`, `indicatore-autopilota.test.ts`.
- Rapporti delle chat e quadro intero: già soddisfatto. Prova: `7dcfd4c9`, `rapporti-chat-0-85-1.test.ts`.
- Promesse mantenute: già soddisfatto. Prova: `8df8f171`, `promesse-0-85-1.test.ts`, `promessa-autopilota.test.ts`.
- Guardia del PC: già soddisfatto. Prova: `d254775c`, `guardia-pc-0-85-1.test.ts`.
- Scorrimento fluido, tempo per lettera: già soddisfatto. Prova: `362a465c`, `campo-autopilota-fluido.test.tsx`, misure nella sezione 5.
- Domande del 23/10: già soddisfatto. Prova: `a362dedb`, `domande-del-23-10-0-85-1.test.ts`, elenco nella sezione 6.
- c-149 (27/10, consegna c-6123): niente da aggiungere, le prove di ogni criterio sono già qui sopra e i rami chiusi sono nella tabella dei rami. I 5 file di test dei criteri, rilanciati in main il 27/10, danno 55 verdi su 55.
- Release: già soddisfatto. Prova: release `v0.85.1` non bozza, con i 5 file (exe, blockmap, `latest.yml`, APK 2.85.1, `app-android.json`).
- Rami: già soddisfatto. Prova: tabella «Rami» qui sotto. c-145…c-149 sono uniti, c-143 è chiuso perché doppio, c-148 è chiuso il 27/10 senza unirlo di nuovo, perché già in main.

Il 27/10 il `main` locale aveva 2 commit di note del quaderno in più di `origin/main`. Il push lo fa l'autopilota: le regole di questa chat dicono «niente push».

## Rami

| Ramo | Scelta |
|---|---|
| c-145 | **unito** in `main` dopo la Revisione (supervisore dallo stdin, allarme dopo 3 fallimenti) |
| c-146 | **unito** in `main` (rapporti delle chat; più 3 test che cadevano di notte o col PC carico, scheda `trappola-test-legati-all-ora.md`); il bump e la release partono da qui. Il commit di sola documentazione `90af6e3b` (c-150, controlli finali) è entrato in `main` con l'unione di c-146 (`0f7cca1a`) |
| c-147 | **unito** in `main` (promesse; cambia `android/`, quindi APK nuovo 2.85.1). Il commit di sola documentazione `574abf81` è entrato in `main` con l'unione di c-147 (`777f9b52`) |
| c-148 | **unito** in `main` dopo la Revisione (guardia del PC; il 24/10 anche il ricontrollo dei criteri qui sopra); i 2 commit del quaderno rimasti fuori (`370df097`, `971e7aa9`) uniti da c-147 il 24/10 (`3b1d12b1`), dopo aver salvato 3 note sporche nella cartella principale (`46e448cc`) |
| c-149 | **unito** in `main` dopo la Revisione (testo fluido; ha portato da c-143 le domande del 23/10 e la correzione 0u) |
| c-149 (27/10, consegna c-6090) | **chiuso senza unirlo di nuovo, perché già in main**: l'unico commit suo fuori da `origin/main` è la nota del quaderno `2461f946` (giro senza fine), già nel `main` locale e in attesa del push dell'autopilota; niente codice, niente Revisione, nessun bump |
| c-149 (27/10, consegna c-6100) | tutto nel `main` locale; in `origin/main` mancano solo note del quaderno (`2461f946`, `9f9b96df` e unioni di c-148/c-146) perché `main` non è ancora pushato: il push tocca all'autopilota, la chat non lo fa. Niente da rivedere |
| push del 27/10 (c-149, consegna c-6106) | `git push origin main` **riuscito**: `9135e919..b3f2f155`, 32 commit, controllati con `git diff --name-only`: solo file in `.sierradeck/quaderno/`. Dopo il push `main` = `origin/main`. Niente tag, niente release, niente installazione |
| c-143 | **chiuso senza unirlo, perché doppio** (deciso il 24/10, consegna c-1139): supervisore, guardia e campo sono doppioni di c-145, c-148 e c-149; i pezzi utili (domande del 23/10, 0u, rapporto) sono entrati con c-149. Le sue note (questo rapporto, `rapporto-0-85-0.md` e due trappole del quaderno) le ha portate in `main` c-148 il 24/10, copiando solo quei 4 file; il ramo resta fuori. Il 24/10 i suoi 8 commit fuori da `main` erano solo note del quaderno e unioni (rapporto, lista, giro senza fine, consegna della release): già in `main` o superate. Ricontrollato il 27/10 (consegna c-6091): dopo l'unione di `main` (`653d8a0f`) il ramo ha in più solo una riga della trappola del giro senza fine (la consegna c-1149); **resta chiuso senza unirlo**, niente da portare in `main` |
| c-11, c-11-velocita | **chiusi senza unirli**: superati da c-48 (velocità misurata, già in `main` dalla 0.85.0) |
| rilascio/0.82.1 | **chiuso senza unirlo, perché vecchio**: è il ramo della patch 0.82.1 del 21/10 (ultimo commit `730f3b0b`), fatta partendo dal tag v0.82.0. I suoi 6 commit fuori da `main` sono dentro il tag v0.82.1, già pubblicato; le versioni dopo hanno preso altre strade. Non c'entra con la 0.85.1 |
| c-147 (27/10, c-158, consegne c-1185/c-6083/c-6094/c-6099/c-6104/c-6107/c-6115/c-6119) | **chiuso senza unirlo di nuovo, perché già in `main`**: `git branch -a --no-merged main` non lo elenca; le promesse sono in `main` da `8df8f171`, test 21/21 verdi rilanciati il 27/10 |
| c-148 (27/10, c-159) | **chiuso senza unirlo di nuovo, perché già in `main`**: `git log main..HEAD` è vuoto. I commit che `origin/main` non ha ancora sono note del quaderno (giro senza fine del 27/10) e unioni, già nel `main` locale e in attesa del push dell'autopilota. Nessun codice nuovo; la guardia del PC (`d254775c`) è in main dal 23/10, con 16 test verdi rilanciati il 27/10. Nessun lavoro rimasto |
| c-146 (27/10, c-156, consegne c-1169/c-6081/c-6089/c-6095) | **chiuso senza unirlo di nuovo, perché già in `main`**: `git log main..HEAD` è vuoto. I commit che `origin/main` non ha ancora sono note del quaderno (nono caso del giro senza fine, `bfc97779`) e unioni, già nel `main` locale e in attesa del push dell'autopilota. I rapporti delle chat (`7dcfd4c9`) sono in main dal 23/10; `rapporti-chat-0-85-1.test.ts` rilanciato il 27/10: 14 verdi. Tolta con `rmdir` la junction `node_modules` della copia. Nessun lavoro rimasto |
| tutti i rami (27/10, c-143, consegna c-6101) | Controllo dopo `git fetch`: dei rami `ap/ap-f1e631f5/c-14x` e `c-15x` esistono solo c-143, c-145, c-146, c-147, c-148 e c-149, nessun c-15x. c-145…c-149 hanno **0 commit fuori dal `main` locale**: i commit che risultano «fuori da `origin/main`» ci sono solo perché `main` è 32 commit avanti a `origin/main` e non è ancora pushato. c-143 è fuori solo con note del quaderno, nessun file di codice. **Nessun ramo da mandare alla Revisione**, tutti già in main o doppi. Il push di `main` e la chiusura delle chat li fa l'autopilota. Poi il push del 27/10 è riuscito (riga «push del 27/10» qui sopra): le uniche note di c-143 non ancora in `main` sono questa riga, la riga c-143 con il ricontrollo del 27/10, la riga «giro» della lista e la nota su c-1149 nella trappola del giro senza fine |
| criteri e rami (27/10, c-143, consegna c-6117) | **Criteri soddisfatti**: lanciati insieme i 7 test indicati in questo rapporto, `supervisore.test.ts`, `rapporti-chat-0-85-1.test.ts` (c-146), `promesse-0-85-1.test.ts` (c-147), `guardia-pc-0-85-1.test.ts` (c-148), `campo-autopilota-fluido.test.tsx` con le misure prima/dopo (c-149), `domande-del-23-10-0-85-1.test.ts` e `divieti-installa-0-85-1.test.ts` (c-143/c-149): **95 su 95 verdi**. Release `v0.85.1`: `gh release view` dice non bozza, uscita 2026-10-23T23:52:40Z, 5 file (exe, blockmap, `latest.yml`, `SierraDeck-2.85.1.apk`, `app-android.json`). **Rami**: c-146, c-147, c-148, c-149 con 0 commit fuori da `main`; c-145 ha fuori solo `30195b3d` (2 righe di questo rapporto, chat c-157); c-143 solo note del quaderno; nessun ramo c-150. Il push di `main` e `chiudiChat` non li fa questa chat: le sue regole (c-1111) vietano push e cartella principale. Tocca all'autopilota |
| c-143 (27/10, consegna c-6161) | **Lavoro di c-143 già in main e pubblicato**: le domande del 23/10 (`a362dedb`) e i divieti dell'installazione (`197d26a5`) sono in `origin/main` e nella 0.85.1; test 95/95 verdi il 27/10 (consegna c-6117), codice non cambiato da allora. Sul ramo restano solo note del quaderno, unibili senza conflitti. **Finito** |
| Controllo del 27/10 (c-159, consegna c-6134) | `git branch -a --no-merged main` dà solo **c-11, c-11-velocita** (chiusi senza unirli, superati da c-48) e **c-143** (chiuso senza unirlo, doppio). c-145…c-149 sono uniti in `main`. Le chat c-150…c-159 non hanno un ramo loro: hanno lavorato sui rami qui sopra. `chiudiChat` è una mossa del supervisore e una chat non la può chiamare (`server.ts`, mosse del supervisore): la chiusura di c-143 e c-145…c-159 tocca all'autopilota |

Controllo del 24/10, 03:00 (c-150): `git branch --no-merged main` dà solo c-143. c-145 (`4e512cb1`) e c-149 (`7ceebf02`) non hanno più niente fuori da `main`. Tolte con `rmdir` le junction `node_modules` delle copie di c-147, c-148 e c-149, già unite; la copia di c-145 non l'aveva. Restano quella di c-143, ramo non unito, e quella di c-146, ancora al lavoro. `main` pushato su GitHub (`9135e919`); il tag `v0.85.1` resta su `61f74643`. La chiusura delle chat c-143 e c-145…c-149 con `chiudiChat` è un'azione dell'autopilota: le chat non la possono fare da sole.

Controllo del 27/10 (c-157, consegna c-6092): c-145 è **già tutto in `main`** (`git log main..c-145` vuoto, ultimo commit `9cf239a6`, solo note del quaderno sul giro senza fine): niente da unire, ramo chiuso così.

## La release

**0.85.1 pubblicata** il 23/10 alle 23:52 UTC (24/10 01:52 ora italiana) da c-146, non in bozza, con i 5 file controllati: `SierraDeck-Setup-0.85.1.exe`, il suo `.blockmap`, `latest.yml` (version 0.85.1, size uguale all'exe: 115.420.838 byte), `SierraDeck-2.85.1.apk` (APK nuovo, android/ cambiato con c-147) e `app-android.json`. Il tag `v0.85.1` e `main` su GitHub sono lo stesso commit (`61f74643`). **Mai installata da noi**: la installa Nicholas.

1. `git fetch`: `origin/main` (`121f4e93`, la 0.85.0) era solo indietro rispetto a `main` (83 commit), nessun altro PC aveva pubblicato. Push di `main` su GitHub.
2. Bump patch `61f74643`: 0.85.1, app 2.85.1 (versionCode 145), 6 righe in `novita.ts`. Prima: typecheck 0, `npm run build` 0, test delle novità 76/76.
3. Tag `v0.85.1` pushato, `gh release create` con le note da `noteDi`, poi `npm run pubblica`: una release sola, exe + blockmap + `latest.yml`.
4. `npm run allega-apk`: APK 2.85.1 release firmato Ferrari Consulenze + `app-android.json`.
5. Controlli (24/10, 02:20): una sola release `v0.85.1`, non bozza né pre-release, Latest; 5 file (`SierraDeck-2.85.1.apk` firmato «O=Ferrari Consulenze»). `releases/latest/download/latest.yml` dice `version: 0.85.1`, con la `size` dell'exe e lo sha512 uguale a quello dell'exe costruito.

**Intoppo:** nella copia della chat mancava `google-oauth.json` (non versionato) e `controlla-credenziali` ha fermato `pubblica` prima di caricare qualunque cosa. Copiato dalla cartella principale; idem `android/local.properties` per gradle. La chiave dell'APK sta nella cartella utente, quindi va bene da qualunque copia.

**Due chat sulla stessa release:** la consegna di release è arrivata anche a c-147 (c-1139). c-147 ha visto il bump di c-146 su `origin/main` subito prima del tag e ha tolto il suo, doppio: nessuna seconda release (vedi `pubblicare-una-release.md`).

## Cosa resta

- Niente da fare per noi sulla 0.85.1.
- Installarla: solo Nicholas. Con l'install finisce anche il giro senza fine dell'hook di fine turno (il supervisore installato è ancora quello che fallisce).
- Aperto, decide Nicholas: mostrare solo le ultime 200 righe del diario nella scheda.
- Le junction `node_modules` nelle copie delle chat si tolgono con `rmdir` quando i loro rami sono uniti o chiusi.
- Per la prossima versione (non è una richiesta di Nicholas): con i criteri verdi e il supervisore senza verdetto, l'hook di fine turno rifà il giro all'infinito (`istruzioniRiprova` in `rete-sicurezza.ts`). Il 27/10 è successo a c-149 e c-148 con decine di giri a vuoto. Correzione proposta: passare il compito della chat e chiuderla al secondo giro senza verdetto. Dettagli in `trappola-giro-senza-fine-chat-finita-0-85-0.md`.
