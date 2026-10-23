---
titolo: "Rapporto 0.85.1"
quando: 2026-10-23T22:00:00+02:00
tag: ["0.85.1", "rapporto", "patch", "c-143", "c-145"]
---

# Rapporto 0.85.1 (patch)

**Stato (23/10, 22:00):** le 4 richieste di Nicholas del 23/10 sera sono fatte e provate. Tre sono sul ramo `ap/ap-f1e631f5/c-143`, la quarta (il supervisore) è già in `main` con c-145. **La release non è ancora uscita**: prima c-143 va unito in `main` dopo la Revisione. Poi la chat di rilascio fa la 0.85.1. `android/` non è cambiato, quindi si riallega l'APK 2.85.0 (sempre con `npm run allega-apk`).

## Le richieste

| # | Richiesta | Dove | Prova |
|---|---|---|---|
| 1 | Supervisore: «spawn ENAMETOOLONG» (239 volte il 23/10, 124 di fila). Il prompt va sull'ingresso, non sulla riga di comando. Allarme dopo 3 fallimenti di fila | **c-145**, in `main` (`407cc4da`) | `supervisore.test.ts` (prompt di 48.006 caratteri con un claude finto), `indicatore-autopilota.test.ts`; il controllo `grep` del criterio passa |
| 2 | Guardia del PC | c-143 `5425393a` | `guardia-pc-0-85-1.test.ts`, 11 test |
| 3 | Testo fluido nella linguetta dell'autopilota | c-143 `1dadc186` | `campo-autopilota-fluido-0-85-1.test.tsx` |
| 4 | Domande del 23/10 rilette dal registro | c-143 `a7566e00` | `domande-del-23-10-0-85-1.test.ts`, 5 test |

**Doppione:** c-143 aveva fatto anche la richiesta 1 (`6e8b966a`), in parallelo a c-145. All'unione con `main` (`0509db01`) è rimasta solo la versione di c-145. I file `supervisore-muto.ts` e il suo test sono stati tolti, l'allarme è uno solo.

## 2. Guardia del PC

Prima di aprire una chat e prima dei criteri pesanti a fine turno, il servizio guarda l'ultima misura del PC. Il guardiano la prende ogni minuto, con `creaMisuratore`. Il PC è **carico** in due casi:
- il processore è sopra l'85% in due misure distanti almeno 60 secondi;
- la memoria libera è sotto il 15%.

Finché il PC è carico:
- **nessuna chat nuova**: i posti sono solo quelli già occupati;
- i **criteri pesanti** tengono l'esito di prima, segnato come «rimandato» nel quadro;
- le chat già al lavoro **continuano**: non si chiude e non si ferma niente;
- l'indicatore dice in giallo «PC carico: aspetto · memoria libera al 9% · consuma di più chrome (5,1 GB)». Lo dicono anche `/posti-chat` e il motivo «perché non apro».

Il programma più pesante si legge una volta per episodio, con `Get-Process`, in sola lettura. Nomi uguali si sommano. Per il processore servono due letture a un secondo di distanza. Provato sul PC vero: «claude (5,4 GB)», «claude (18% del processore)».

Codice: `src/shared/guardia-pc.ts` (regole e riga), `src/autopilot-host/processi-pesanti.ts` (la lettura), `server.ts` (`guardaIlPc`, `postiAdesso`, `misuraCriteri` col `tutti` spento).

Non coperto: la verifica finale prima di «finito» rimisura tutto anche col PC carico. È una volta sola e serve fresca.

## 3. Testo fluido

**Causa.** Il testo del campo stava nello stato di tutta `ChatAutopilota`. Ogni lettera ridisegnava:
- la conversazione intera (800 righe in una giornata come il 23/10);
- il Punto;
- le righe dal vivo.

In più ogni orario creava un formato nuovo (`toLocaleTimeString`).

**Correzione:**
- il campo è un componente suo, `CampoAutopilota`, con il suo stato: una lettera ridisegna solo lui;
- gli orari usano un `Intl.DateTimeFormat` fatto una volta sola.

**Tempo per lettera**, misurato nel test con 800 righe di diario e 6 chat:

| | Prima | Dopo |
|---|---|---|
| Una lettera | **643 ms** (tutta la chat) | **circa 2 ms** (solo il campo) |
| Il ridisegno di tutta la chat (ogni 5 s, quando arriva lo stato) | 643 ms | circa 200 ms (grazie agli orari) |

C'è un cambio di comportamento minimo: «Vai», «Riprendi» e «Disfa» non svuotano più quello che stavi scrivendo. Lo svuota solo «Manda».

## 4. Le domande del 23/10, una per una

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
| 19:14 | «Pubblico adesso?» (lavoro Revolut, a lavoro finito) | **sì**, ma poi **spariva da sola** | Alle 19:19:29 il diario diceva «la pubblicazione aspetta il tuo sì nella scheda Domande». Alle 19:19:50 il ricontrollo la chiudeva come «superata: il lavoro è già finito»: la domanda spariva e la pubblicazione restava appesa. **Corretto** (`a7566e00`): a lavoro finito il ricontrollo non tocca la domanda di pubblicazione finché aspetta il sì. Un sì arrivato dopo riapre il lavoro per pubblicare. Test: 2 rossi senza la correzione, verdi con |
| 15:09 | «Aggiornato dalla 0.84.3 alla 0.84.4 in 5 min…» | non è una domanda | avviso sull'aggiornamento, voluto |

Le domande nate dal supervisore muto («Cosa deve fare adesso la chat…?») il 23/10 **non sono arrivate**: nessuna nel registro. Le notifiche `idle_prompt` di c-144 sono state 12, fra le 18:27 e le 19:10. Le ha risposte tutte il programma, senza disturbare Nicholas. Sono ripetute perché quella chat girava a vuoto (`trappola-giro-senza-fine-chat-finita-0-85-0.md`).

## Misure sul ramo c-143 (dopo l'unione con main, `0509db01`)

- TypeScript senza errori.
- Servizio, renderer, condivisi e pty: 305 file, **3287 test verdi**.
- Principali: **1951 verdi** (2 saltati).
- Guardia delle cancellazioni pulita; controllo «prompt non sulla riga di comando» pulito.
- `android/` non è cambiato rispetto a `main`: niente APK nuovo, nessun file Kotlin oltre 800 righe (come in 0.85.0).

## Cosa resta

1. Revisione e unione di c-143 in `main`. Lo fa il programma. Poi si toglie la junction `node_modules` della copia con `rmdir`.
2. La richiesta 0.85.1f, le promesse non mantenute (consegna c-1086): **da fare**, non toccata da c-143.
3. La release 0.85.1:
   - `git fetch`, poi tag e `gh release create` prima di `npm run pubblica`;
   - controllare `latest.yml`;
   - 5 file, con l'APK 2.85.0 riallegato tramite `npm run allega-apk`;
   - non in bozza, mai installata.
