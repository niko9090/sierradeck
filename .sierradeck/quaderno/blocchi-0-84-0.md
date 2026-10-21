---
titolo: "Blocchi 0.84.0: perché chat e autopiloti si sono fermati da soli dal 15/10"
quando: 2026-10-21T18:45:00+02:00
tag: ["0.84.0", "autopilota", "blocchi", "registri", "guardiano", "git", "servizio"]
---

Censimento delle fermate non volute dal 15/10 al 21/10 alle 17:36. Le cause sono contate per tipo, ognuna con la sua prova e con la correzione oppure il motivo per cui non dipende da SierraDeck.

**Da dove vengono i numeri:**
- il registro di questo PC (`%APPDATA%\SierraDeck\log\sierradeck-2026-10-15…21.log`);
- il diario degli autopiloti (`autopiloti\ap-*.json`, campo `decisioni`);
- i tempi dei giri (`autopiloti\servizio\tempi.jsonl`).

Gli script con cui li ho contati stavano nella cartella temporanea della chat c-56. Per rifarli basta cercare nel registro le righe citate qui sotto.

## DESKTOP e LAPTOP: i registri non si leggono da qui

Il ponte in sola lettura (`/api/ponte`, `ROTTE_PONTE` in `src/shared/ponte-telefono.ts`) non ha nessuna rotta per i registri. Vuole inoltre la chiave di un telefono abbinato. Da qui si vede solo il battito degli altri PC (`pc-altrui.json`):

| PC | Versione | Chat |
|---|---|---|
| DESKTOP | 0.82.1 | 4: Fionda, Rilascio, e 2 «aspetta» |
| LAPTOP | 0.82.1 | 2: RdpManager, Rilascio |
| NB-PROBOOK | 0.79.0 | ultimo battito il 20/10 |

**Da fare:** per contare anche lì, serve una rotta del ponte che dia, in sola lettura, le righe «sospeso / in attesa / guasto» del registro. Altrimenti bisogna copiare i log a mano. La decisione spetta a Nicholas. Le correzioni qui sotto valgono per tutti i PC, perché il codice è lo stesso.

## Fermate dell'autopilota (stato «sospeso» o domanda a Nicholas)

| Causa | Quante | Prova (registro / diario) | Stato |
|---|---|---|---|
| «una chat non dà segnali» → sospeso | 8 | Riprendi di Nicholas: 17/10 07:52; 18/10 05:31; 19/10 09:21, 11:40, 13:46, 22:42; 20/10 06:40, 06:54 | corretta in 0.80.1: da allora 14 chat «messe da parte» senza sospendere |
| supervisore muto con criteri verdi → sospeso | 4 | 17/10 09:04, 20:58; 18/10 05:50; 19/10 14:12 | corretta in 0.80.1 |
| supervisore muto → domanda a Nicholas | 3 | 18/10 13:18; 19/10 11:57, 12:16 | corretta in 0.82.1 (prosegue, riprova, al tetto solo una riga) |
| correzione rifiutata per test «rosso per tempo» → domanda | 6 | 19/10, 5 volte; 20/10 12:42 | corretta in 0.80.1 e 0.82.1 (criteri uno alla volta, cache per commit) |
| antiloop → sospeso | 2 | 19/10 16:40 (c-7 aspettava un'installazione); 20/10 19:09 (c-16 chiusa, risvegliata) | la prima non dipende da SierraDeck (installa solo Nicholas); la seconda è corretta in 0.81.1 |
| «guasto: compito non partito» | 5 | 15/10 07:30 (permesso chiesto da Claude Code); 20/10 06:42, 3 volte, durante l'aggiornamento; 20/10 21:26 | le 3 dell'aggiornamento sono riprese da sole («riprendo 1 autopiloti interrotti», 5 volte in tutto); il permesso del 15/10 non dipende da SierraDeck |
| domande vere a Nicholas (login GitHub, installazioni, scelte; 4 sull'SSH del NAS per ap-79a4ce02) | — | diario | non dipendono da SierraDeck: erano decisioni sue. Una era in inglese: corretta in 0.80.1 |

Nicholas ha premuto **Riprendi 31 volte** su ap-f1e631f5. Undici di queste, senza motivo scritto, venivano dopo un «finito» con un obiettivo nuovo, quindi erano volute:
- 15/10: 06:42, 13:39, 19:32, 21:04, 21:52;
- 16/10: 07:27, 08:14, 14:55, 22:18;
- 18/10: 12:30;
- 21/10: 06:08.

**Dal 21/10 alle 08:46 non c'è più nessuna fermata dell'autopilota.**

## Fermate e ritardi delle chat: quello che la 0.82.1 non aveva risolto

### 1. Un messaggio per una chat ferma arrivava in ritardo: 36 volte, 33,6 ore in tutto

**Prova.** Nel registro compare 36 volte la riga «la chat c-N era ferma da X s: consegno»:

| Giorno | Volte |
|---|---|
| 19/10 | 17 |
| 20/10 | 15 |
| 21/10 | 4 |

- Ritardo mediano: 576 s.
- Ritardi più lunghi: 16416 s, 19266 s e **20503 s** (c-3, 20/10 13:28, cioè 5,7 ore).

**Causa.** Il guardiano saltava **tutto l'autopilota** finché una sola sua chat aveva una fermata in giudizio (il Set `inLavorazione`). Con dieci chat e criteri da 3 a 20 minuti, quasi sempre ce n'era una. Così le chat ferme con un messaggio in coda aspettavano, e lo stesso valeva per quelle mute da mettere da parte.

**Correzione** (commit 59d791c2):
- le fermate si contano per chat (`fermateInCorso`), e il guardiano salta solo la chat in giudizio;
- i salvataggi del turno dopo un `await` rileggono la coda dal disco (`codaDalDisco`), così un messaggio già portato dal guardiano non torna in coda e le sue righe del diario restano;
- `riportaInCoda` prima rinunciava in silenzio dopo 5 minuti. Ora riprova fino a 30 minuti e poi lo scrive nel registro.

**Test:** `tests/autopilot-host/guardiano-per-chat-0-84-0.test.ts`, 5 test. Il primo fallisce col codice di prima.

### 2. Il servizio fermo su git: 102 minuti il 20/10, 66 il 21/10

**Prova.**
- 980 «non ha risposto alla salute» e 2066 «elenca: il servizio non risponde».
- Periodi di blocco fino a 10 minuti di fila: 20/10 12:59 e 14:59; 21/10 07:23 e 07:46.
- In `tempi.jsonl` la fase «unione» dei giri fa 1985 s in tutto il 20/10. Il giro peggiore ci mette 95 s, e 50 giri superano i 10 s. Il 21/10: 299 s in tutto, massimo 24 s.

**Causa.** Il git dei giri (salvare, unire, togliere il worktree) usava `spawnSync`, che ferma tutto il processo. Intanto il servizio non rispondeva a nessuno:
- gli hook PreToolUse delle chat, che hanno 30 s di tempo;
- le fermate delle altre chat;
- la salute chiesta dal pannello.

**Correzione** (commit 98b32833): in `worktree.ts` ogni operazione è scritta una volta sola come «passi» (generatori) e gira sia col git sincrono sia con `gitAsincronoReale` (spawn). Il servizio usa quello asincrono a fine turno.

**Test:** `tests/autopilot-host/git-asincrono-0-84-0.test.ts`:
- con git vero, salvare, unire, il conflitto e il ramo già unito o mancante si comportano come prima;
- la salute risponde mentre l'unione è a metà;
- il merge non passa più dal git sincrono.

### 3. Doppioni del servizio a raffica: 62 avvii il 20/10, 45 il 21/10

**Prova.** «il servizio non è in ascolto: lo avvio» seguito da «la porta 47630 è già del servizio in funzione: questo doppione esce». È successo a decine nello stesso minuto: 20/10 14:33–14:34 e 15:06–15:07, 21/10 07:27. Tutti i doppioni sono usciti e non ci sono stati danni ai dati: prima di accorgersi della porta presa, un doppione legge e basta. Ma ogni avvio costa qualche secondo di CPU a un PC già al limite.

**Causa.** La conseguenza del punto 2: il servizio fermo su git non accettava la connessione entro mezzo secondo, e ogni chiamata del pannello ne avviava un altro.

**Correzione** (commit bcdf9ea1): se un avvio non ha riportato su il servizio, il prossimo aspetta un minuto.

**Test:** `tests/main/autopilot-client.test.ts`, «un avvio che non riporta su il servizio».

## Già corrette prima della 0.84.0 (per completezza)

- **Supervisore scaduto dopo 5 minuti: 65 volte.** Prima la chat si fermava: corretta in 0.82.1.
- **PC soffocato dai criteri** (fino a 34 comandi lunghi insieme il 21/10, suite «rosse per tempo»): corretta in 0.82.1. Questo PC ha ancora la **0.82.0**: la 0.82.1 non è installata, quindi i numeri del 21/10 sono ancora quelli vecchi.
- **«idle_prompt» risposti da soli: 135**, di cui 83 il 20/10, quasi tutti chat chiuse risvegliate: corretta in 0.81.1.
- **«warning LF/CRLF» e «not something we can merge»** (18-19/10): corretta in 0.80.0.

## Non sono fermate

- **«comando bloccato»: 43 volte.** È la guardia delle cancellazioni che fa il suo lavoro. I casi: variabili `$j/$d/$P` nei percorsi di `rm`, percorsi fuori dalle cartelle, la Revisione.
- **c-34 risulta «lavoro» dopo la chiusura del 20/10 alle 23:33.** Non ha fermato niente. Va guardato con il punto «agente finito» della 0.84.0.

## Prova nella copia di prova

La sezione arriva quando la prova è fatta: un autopilota con 4 chat per 30 minuti, in `SIERRADECK_PROVA`.
