---
titolo: "Aggiornamento senza tempi morti: 5 minuti, poi salvo e installo (0.84.3)"
quando: 2026-10-23T01:20:00+02:00
tag: ["aggiornamenti", "installa", "autopilota", "0.84.3", "fasi"]
---

Richiesta di Nicholas del 22/10 sera (riga 6 della `lista-lavori.md`), fatta da c-91 il 23/10.

## Il caso vero (registro del PC, 22/10)

- 15:28:51 UTC `INSTALLA 0.84.1 chiesto dal PC: aspetto la quiete`, 4 chat al lavoro.
- 15:48 «Aspetto da 20 minuti»: 3 chat («App Android: analisi, correzioni e allineamento» due volte, «ServerDSM»).
- 17:28:51 `non installo: 3 chat hanno ancora qualcosa in mano`. Pausa tolta, niente installato: **due ore perse**.
- 18:58 secondo «Installa», stessa attesa. Alle 19:22 il PC è sulla 0.84.1.

Causa: il tetto dell'attesa dopo «Installa» era `ATTESA_INSTALLA_MS` = 2 ore, e allo scadere si rinunciava. Per `inVolo` una chat «lavora» quando ha il terminale acceso e non aspetta te, e quelle tre non lo erano mai, anche se secondo il servizio nessuna chat stava lavorando davvero (11:02-19:22, `rapporto-0-84-2.md`). Perché il PC le vedesse al lavoro non è stato chiarito. Con il nuovo tetto non conta più.

## Come funziona adesso

- **Scaricamento in anticipo:** `scaricaAggiornamentiAutomatico` è già acceso di base (anche sul PC di Nicholas). La fase «scarico» si segna col suo tempo.
- **Dopo «Installa»:** pausa degli autopiloti, avviso in ogni chat («hai al massimo 5 minuti, fai un commit sul tuo ramo»), poi si aspetta **al massimo 5 minuti** (`ATTESA_INSTALLA_MS = SALVO_LE_CHAT_MS`). Allo scadere `attendiQuiete` con `alloScadere: 'installa'` **non rinuncia**: fa un commit sul ramo di ogni chat (`/salva-per-aggiornamento`, solo copie `ap/…`), annota chi era a metà e installa. Il commit si fa anche quando la quiete arriva prima. «Aggiorna adesso» resta e salta l'attesa.
  - `sistema:riavvia` (riavvio senza installare) usa ancora il vecchio comportamento: allo scadere rinuncia.
- **Fasi visibili con il tempo:** `src/shared/fasi-aggiornamento.ts` (puro). Lo stato porta `fasi` e `fasiTesto` («Scaricato in 40 s · salvo le chat da 2 min (al massimo 5 min) · poi installo e riparto»), uguale su PC (striscia e Impostazioni), pagina (`descriviAggiornamento`) e app (`AggiornamentiVista.kt`, `SchermoInstallazione.kt`).
- **Ripresa con riepilogo:** prima dell'installer si scrive `aggiornamento-in-corso.json` nella cartella dei dati (fasi + chat salvate/interrotte). La versione nuova lo legge e lo cancella (`leggiAggiornamentoAppenaFatto`: vale solo se la versione è quella attesa e il file ha meno di 6 ore), chiude «installo» all'ora di partenza del processo, apre «riparto» e lo manda con `/gestore-avviato`. Il servizio scrive una riga `da: 'lui'` (traccia) nel `dialogo` degli autopiloti fermati per l'aggiornamento, prima di riprenderli: «Aggiornato dalla 0.84.2 alla 0.84.3 in 7 min (scaricato prima, chat salvate in 5 min, installato in 1 min, ripartito in 30 s). Lavoro di 3 chat salvato sul loro ramo. Riprendo il lavoro da dove eravamo.»
  - La riga va scritta **prima** di `riprendiLavori`: `avviaLavoro` parte con l'oggetto letto allora, e una riga scritta dopo rischia di essere sovrascritta.
- **App Android:** c'è anche il tasto «Aggiorna adesso» che mancava dalla 0.84.1 (`Api.aggiornaAdesso`, rotta `POST /api/aggiornamento/aggiorna-adesso`). `android/` cambiato → serve un APK nuovo alla 0.84.3 (c'era già per c-88).

L'installazione la avvia sempre e solo Nicholas: nessuna strada automatica è stata aggiunta.

## Cosa resta

- L'attesa del lavoro con il Drive (`attendiLavoroDrive`) viene **prima** dei 5 minuti e per un lavoro voluto (fusione, ripristino) può durare fino a 10 minuti. Non è stata toccata.
- Nessuna prova dal vivo nella copia di prova: servirebbe una release vera da scaricare. Le prove sono nei test, col caso vero del 22/10.

Test: `tests/main/aggiornamento-senza-tempi-morti.test.ts` (caso vero), `tests/shared/fasi-aggiornamento.test.ts`, `tests/autopilot-host/riepilogo-aggiornamento.test.ts`, `tests/main/aggiornamenti.test.ts` (file al ritorno), `tests/main/aggiornamento-da-solo.test.ts` (aggiornato: 5 minuti invece di 2 ore).
