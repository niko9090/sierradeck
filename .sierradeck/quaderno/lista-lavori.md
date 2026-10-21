---
titolo: "Lista dei lavori: le richieste di Nicholas in ordine di priorità"
quando: 2026-10-21T17:45:00+02:00
tag: ["lista-lavori", "priorità", "release", "nicholas"]
---

Questa è la lista delle richieste di Nicholas dal 19/10 in poi, in ordine di priorità. **Va aggiornata a ogni release e a ogni nuova richiesta.** Quando una cosa cambia si aggiorna lo stato della sua riga, senza togliere la riga. Una voce fatta passa in «Già fatte» con la versione in cui è arrivata.

Stati possibili: **da fare**, **in corso** (si dice chi la fa), **fatto in X.Y.Z**, **aspetta Nicholas**.
Regole che valgono sempre: una release per versione e **mai installata da noi**. Nessuna funzione si toglie senza il sì di Nicholas. Niente dati privati nel codice o nei test.

Prima versione: c-52, 21/10, sul suo ramo e mai unita. Questa la sostituisce (c-54, 21/10) ed è quella da tenere aggiornata.

## Adesso, in ordine

| # | Richiesta | Data | Stato |
|---|---|---|---|
| 1 | **0.82.1 (patch): le chat non si bloccano più.** L'ha chiesta Nicholas perché così non riesce a lavorare. Parte dal tag v0.82.0 e porta le stesse correzioni anche in main | 21/10 | **fatto in 0.82.1**: pubblicata il 21/10 alle 17:05 da c-53, non installata. Le stesse correzioni sono in main dal ramo c-53. Cause e numeri in `rapporto-0-82-1.md` |
| 1a | Un criterio si rimisura solo quando cambia il commit di main o del ramo: l'esito si ricorda per commit e per comando. I comandi lunghi (vitest, gradle) vanno uno alla volta per PC e mai durante un'unione. Nel rapporto: misure all'ora prima (448 in un giorno) e dopo | 21/10 | fatto in 0.82.1 (`turni-criteri.ts`). Misure all'ora, ricalcolate sui registri: 39,5 → 10,5 il 20/10 e 31,6 → 15,6 il 21/10; comandi lunghi insieme da 34 a 1 |
| 1b | Se il supervisore va oltre il tempo, la chat non si ferma: prosegue con l'ultima istruzione valida e lui riprova al giro dopo. Dopo il tetto di 3 tentativi arriva una riga a Nicholas, senza sospendere | 21/10 | fatto in 0.82.1. Con il supervisore guasto del tutto la chat continua a girare: da riguardare in 3.1 |
| 1c | Git nel PATH di ogni chat aperta dal programma, trovato dal sistema o dalle preferenze, mai scritto nel codice. Così gli hook ECC non rifiutano più gli strumenti (`2026-10-21-trappola-senza-git-bash-nel-path-gli-hook-ecc-bloccano-tutti.md`) | 21/10 | fatto in 0.82.1 (`main/git-nel-path.ts`, anche per il supervisore). Da verificare dopo l'installazione |
| 1d | Se una chat aspetta un'altra chat per più di un giro, interviene l'autopilota: sblocca, sposta il lavoro o chiude | 21/10 | fatto in 0.82.1 (`attese-chat.ts`) |
| 1e | Release 0.82.1: ramo nato da v0.82.0, APK 2.82.0 riallegato, `latest.yml` e `app-android.json`, non bozza. Rapporto in `rapporto-0-82-1.md` con le cause e i numeri | 21/10 | fatto in 0.82.1: ramo `rilascio/0.82.1` nato da v0.82.0, tag sul commit `730f3b0b`, 5 allegati, Latest, non bozza. La copia `rilascio-0-82-1` è ancora sul disco: la sua `node_modules` è una junction, va tolta con `rmdir` prima della cartella |
| 2 | **0.83.0 (minor): l'app Android e la pagina del telefono rifatte.** Quattro voci fisse (Adesso, Chat, Progetti, Altro); la casella per scrivere all'autopilota sempre visibile; velocità; leggibilità; nessun file Kotlin oltre le 800 righe; nessuna funzione tolta. Il sì di Nicholas alla ristrutturazione completa è del 21/10 | 21/10 | **fatto in 0.83.0**: pubblicata il 21/10 alle 17:45 da c-55 (tag su `67072521`, APK 2.83.0 firmato, latest.yml e app-android.json controllati), non installata. «Hai risposto: …» anche a mano (`f50a70ce`). Il foglio delle foto e la mappa aspettano la conferma di Nicholas nella coda verso il telefono. Rapporto: `rapporto-0-83-0.md` |
| 3 | **0.84.0 (minor)**, divisa nei sei punti qui sotto | 21/10 | da fare: è la prossima |
| 3.1 | Blocchi: in `blocchi-0-84-0.md` le cause vere delle fermate dal 15/10, prese dai registri di tutti i PC accesi, ognuna con una correzione e un test. Prova: 4 chat per 30 minuti in copia di prova | 21/10 | da fare |
| 3.2 | Controllo e coordinazione: ogni chat riferisce all'autopilota quando parte, finisce, si blocca o aspetta. Lui vede tutto in un punto solo e decide. Nessun lavoro dato due volte | 21/10 | da fare |
| 3.3 | Storico: l'autopilota scrive nel quaderno le sue azioni, un file per lavoro, senza doppioni. Si legge anche da pagina e app | 21/10 | da fare |
| 3.4 | Agente finito: quando il suo ramo è unito o scartato, la chat si chiude da sola. La conversazione va nel recupero di 30 giorni e si rimette con un tocco. Mai chiudere una chat al lavoro o adottata non nostra | 21/10 | fatto sul ramo c-59 (21/10), esce con la 0.84.0: `agenteFinito` in `autopilot-host/posti.ts`, `main/agente-finito.ts`, test in `tests/autopilot-host/agente-finito.test.ts`. Scheda `agente-finito-0-84-0.md` |
| 3.5 | Plugin ECC con gli agenti specializzati su ogni PC acceso (questo, DESKTOP, LAPTOP; NB-PROBOOK quando si accende), con gli hook spenti. In una scheda la versione per PC e come si accendono gli hook. Oggi gli hook sono spenti solo nella cartella principale e accesi in molte copie delle chat | 21/10 | da fare |
| 3.6 | Domande chiare per sempre: ognuna si capisce da sola, senza sigle come «c-12» e senza «l'altra chat». Le scelte dicono cosa comportano. Ovunque si veda una risposta si vede anche la domanda intera. Un controllo automatico prima di mostrarla; le domande vecchie ricontrollate. Test sui casi veri del 20-21/10 | 21/10 | da fare |
| 4 | Rami di questo lavoro: ognuno unito in main dopo la Revisione, oppure chiuso perché doppio o superato, con la scelta scritta nel rapporto. Nessuna chat finita resta aperta | 21/10 | in corso, a ogni release |

## Aspettano Nicholas

Sono cose che può fare o decidere solo lui. Non si fanno al posto suo e non gli si chiede di chiudere chat a mano.

| Cosa | Da quando | Stato |
|---|---|---|
| **Tre gesti per i workspace sbagliati del 19/10**, possibili dalla 0.81.0 (sul PC c'è la 0.82.0): 1) Autopiloti → «Recupero VisitaFacile…» → «Sposta in…» → NexoraOS; 2) Workspace → «⋯» su «dentro al mio server nexora c'è gia un» → Elimina; 3) Workspace → «⋯» su «visitafacile» → Elimina. Restano 30 giorni in «Eliminati». Il visitafacile vero su DESKTOP non si tocca | 20/10 | aspetta Nicholas |
| **«Chat delle prove» sul Drive**: da togliere, la conferma lui | 16/10 | aspetta Nicholas |
| **Cartella `prova-c2` su DESKTOP**: la storia delle sue chat in `~/.claude/projects` di DESKTOP non si raggiunge da lontano (`pulizia-portatile-da-fare.md`) | 16/10 | aspetta Nicholas |
| **I «⋯» di c-38 e c-36**: Istruzioni, File e «Ha deciso» dell'autopilota dietro «⋯» (c-38); un «⋯» per riga nei workspace (c-36) | 21/10 (0.82.0) | aspetta Nicholas |
| Come spegnere gli hook ECC nelle copie delle chat: A) copiare `settings.local.json`; B) avviare le chat con la variabile; C) `env` in `.claude/settings.json`. Riguarda il punto 3.5 | 21/10 | aspetta Nicholas |

## Già fatte (dal 19/10)

| Richiesta | Data | Stato |
|---|---|---|
| Mai chiedergli di chiudere le chat a mano: `chiudiChat` chiude i rami già uniti o mancanti | 19/10 | fatto in 0.80.0 |
| Autopiloti che non si fermano da soli (prima parte) | 20/10 | fatto in 0.80.1 |
| Domande non ripetute e sempre in italiano | 20/10 | fatto in 0.80.1 |
| «Elimina workspace» con recupero di 30 giorni, «Errori arrivati», «Sposta in…» per gli autopiloti | 19-20/10 | fatto in 0.81.0 |
| Le chat chiuse non ricevono più giri né compiti | 20/10 | fatto in 0.81.1 |
| Domande controllate contro lo stato vero: niente «pubblico la 0.81.1?» se è già pubblicata | 20/10 | fatto in 0.82.0 |
| Quante chat lavorano insieme lo decide il PC; colori fissi per le attività; menu dei workspace; «Apri cartella»; meno cose in vista | 20-21/10 | fatto in 0.82.0 (installata su questo PC) |
| Le chat non si bloccano più: criteri per commit e uno alla volta, supervisore lento che non ferma, Git nel PATH, chat che aspettano sbloccate (voci 1a-1e) | 21/10 | fatto in 0.82.1 (pubblicata il 21/10, non installata) |

## Come si aggiorna

- **A ogni release:** le righe della versione passano in «Già fatte» come «fatto in X.Y.Z». Si cambia `quando:` in cima.
- **A ogni nuova richiesta di Nicholas:** una riga nuova al posto giusto per priorità, con la data.
- **Quando lui fa un gesto della sezione «Aspettano Nicholas»:** la riga va in «Già fatte» con la data e quello che resta da fare (per esempio il recupero di 30 giorni).
