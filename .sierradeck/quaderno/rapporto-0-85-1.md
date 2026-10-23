---
titolo: "Rapporto 0.85.1"
quando: 2026-10-24T01:45:00+02:00
tag: ["0.85.1", "rapporto", "patch", "c-145", "c-146", "c-147", "c-148", "c-149", "c-143"]
---

# Rapporto 0.85.1 (patch)

**Stato (24/10, 01:45):** le 6 richieste della 0.85.1 sono fatte e stanno in `main`. L'ultima, le domande del 23/10, ci entra con il ramo c-149, che ha portato da c-143 solo i pezzi che mancavano. **La release non è ancora uscita.** Riscritto da c-149: la versione di c-143 (23/10, 22:00) descriveva come «da unire» pezzi che poi sono entrati in `main` da altre chat.

**APK: ne serve uno nuovo.** c-147 ha cambiato `android/` (`IndicatoreAutopilota.kt`, promesse aperte nell'indicatore). Quindi la 0.85.1 non riallega l'APK 2.85.0: si compila e si allega l'APK nuovo, sempre e solo con `npm run allega-apk`.

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

## Rami

| Ramo | Scelta |
|---|---|
| c-145, c-146, c-147 | uniti in `main` |
| c-148 | unito in `main`; restano 2 commit del quaderno fuori, da unire o chiudere |
| c-149 | testo fluido unito; con questo giro porta le domande del 23/10 e la correzione 0u da c-143 |
| c-143 | **da chiudere senza unirlo**: supervisore, guardia e campo sono doppioni di quelli in `main` (c-145, c-148, c-149); domande del 23/10, 0u e il rapporto sono entrati con c-149; il resto sono note del quaderno sul giro senza fine e il limite del collaudo (in `main` c'è già quello di 90 s) |

## Cosa resta

1. Revisione e unione di c-149 in `main`. Poi la junction `node_modules` delle copie si toglie con `rmdir`.
2. La release 0.85.1, quando tutto è in `main`:
   - `git fetch`, poi tag e `gh release create` prima di `npm run pubblica`;
   - controllare `latest.yml`;
   - **APK nuovo** (android/ cambiato con c-147), con `npm run allega-apk`, e `app-android.json`: 5 file;
   - non in bozza, mai installata.
