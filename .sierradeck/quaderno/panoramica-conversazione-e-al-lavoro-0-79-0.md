---
titolo: "Panoramica 0.79.0: conversazione grande, riassunto «Al lavoro», righe corte dei traguardi"
quando: 2026-10-18T02:10:00+02:00
tag: ["panoramica", "0.79.0", "autopilota", "pagina", "app", "come funziona"]
---

Richiesta di Nicholas (consegna c-49, dentro la 0.79.0): nella Panoramica la conversazione con l'autopilota grande e sempre in vista, con il campo pronto; accanto un riassunto che si aggiorna da solo, una riga per chat al lavoro; quando uno specialista finisce, una riga corta nella conversazione, senza righe tecniche. Su PC, pagina e app, **dai dati del servizio e dai segnali, mai dalle parole delle chat**.

## Da dove vengono i dati
- **Le righe corte dei traguardi.** Il servizio scrive, accanto alla riga tecnica del diario, un campo strutturato `traguardo` nella `Decisione` (`src/shared/autopilota.ts`): `{ chat, esito, di? }`.
  - Esiti: `in-revisione` (specialista finito, passa alla Revisione), `finito` (chiusa senza revisione), `approvato` (Revisione OK + unito), `da-rifare`, `chiede-te` (troppi giri, decide Nicholas).
  - Scritto in `annota(…, traguardo)` di `src/autopilot-host/server.ts` nei cinque punti giusti (cerca `esito: '`).
  - Il testo lo compone `rigaTraguardo` (`src/shared/chat-autopilota.ts`) dal registro: ruolo e compito (`compitoBreve`: prima frase, ≤ 60 caratteri). Es.: «Revisione: ha approvato «Il motore della gestione delle chat» di Sviluppo, unito.».
  - `conversazione()` le mette come `da: 'nota', tono: 'traguardo'`; `separaConversazione` le tiene nella conversazione, le altre note restano in «Cosa è successo». La pagina e l'app ricevono la conversazione già composta dal PC: basta che anche loro tengano `tono === 'traguardo'` (fatto).
  - Le decisioni scritte prima della 0.79.0 non hanno il campo: per i vecchi passi niente riga corta (voluto: niente testo indovinato dalle righe tecniche).
- **Il riassunto «Al lavoro».** `riassuntoAlLavoro(a, schede, ora)` in `src/shared/panoramica.ts`.
  - Solo le schede `lavora` o `chiede` (lo stato viene dai segnali, come «Adesso»); prima chi aspetta te.
  - Chi è e cosa fa: dalla chat governata con la stessa sessione (ruolo, compito; la Revisione «rilegge il lavoro di Sviluppo: «…»»). La chat unica dell'autopilota: «lavora all'obiettivo». Le altre: «chat del workspace: «titolo»».
  - Da quanto: `dal` della scheda. Sul PC è lo `statoDal` dei segnali; per la pagina e l'app la rotta `/api/panoramica` tiene una mappa `statoDal` in `rotteClient` e manda `alLavoro` già composto.
  - `titoloAlLavoro` / `sottoAlLavoro`: gli stessi testi su PC, pagina (confronto nei test) e app (`RegolePanoramica`, casi in `android/app/src/test/resources/panoramica/al-lavoro-0.79.json`, `AGGIORNA=1` riscrive).
- **«adesso» in ogni riga** (c-50, unito sopra c-49): cosa fa la chat *in questo momento*, dall'ultimo strumento nei segnali, in `src/shared/attivita-chat.ts`.
  - `attivitaDaSegnali` legge l'ultimo `PreToolUse`/`PostToolUse` del turno: Bash dal **comando** (mai dalla descrizione scritta dalla chat), Edit/Write con il solo nome del file, Read/Grep, Agent, browser… Esempi: «fa girare i test», «modifica il codice (App.tsx)», «aspetta il tuo permesso: salva il lavoro».
  - Niente «adesso» se i segnali dicono fine turno, chat chiusa o silenzio da 10 minuti (Stop perso), né per le chat di un altro PC (i segnali sono di questo PC).
  - Perché si veda «fa girare i test» *mentre* girano, `PreToolUse` è acceso anche per `Bash|PowerShell|Task|Agent` (prima solo `AskUserQuestion`); il segnale porta anche `comando`.
  - PC: `useSegnaliDi` in `WorkspacePanoramica.tsx` rilegge via IPC `segnali:di` ogni 5 s e a ogni segnale (con 500 ms di quiete). Pagina e app: `/api/panoramica` lo mette già in `alLavoro[].adesso` (dipendenza `segnali` di `rotteClient`).
  - `sottoAlLavoro`: «adesso · da quanto»; se aspetta te e c'è l'attività, l'attività («aspetta il tuo permesso: …») sostituisce «aspetta te».

## Dove si vede
- **PC** (`WorkspacePanoramica.tsx`): colonna della conversazione al 44% (38% con le domande), scorre solo il flusso e il campo resta in fondo (`.chatap--pronta`); il campo prende il fuoco all'apertura se nessun altro campo lo ha (`campoPronto`). «Al lavoro» è in cima al centro, fisso mentre si scorre (`.pan2-riassunto`, sticky).
- **Pagina**: la Panoramica è in due parti, `panoramicaHtml(p, 'testa')` (situazione + «Al lavoro») sopra la conversazione e `'resto'` (Adesso, Piano, Chat, Finite) sotto. Il campo usa `.ancorata` (fisso sopra la fascia in basso, come la risposta nelle chat).
- **App**: `AlLavoro(...)` sta fuori dallo scorrimento, sopra la conversazione (al più 3 righe, poi «e altre N»); il campo era già fuori dallo scorrimento.

## Trappole
- **Due chat hanno fatto la stessa dashboard in parallelo** (c-49 su `c-4`, c-50 su `c-5`, 18/10 notte). c-5 ha unito `c-4` nel suo ramo e ha tenuto la struttura di c-4 (traguardo strutturato invece delle espressioni regolari sul diario), portandoci solo «adesso». Se due consegne si somigliano, guardare `git log` degli altri rami `ap/...` prima di cominciare.
- Prima della domanda di fiducia sulla cartella (solo nelle copie di prova) Claude Code non manda segnali: lo stato viene dallo schermo (riserva), e «adesso» manca.
- Con un PC più vecchio `alLavoro` manca: pagina e app non mostrano la sezione (nessun errore).
- La pagina e l'app mostravano le ore della conversazione in UTC (`slice(11, 16)` / `drop(11).take(5)`): 09:10 dove il PC diceva 11:10. Ora `oraDi` (pagina) e `oraLocale` (app) usano l'ora del dispositivo.
- Sulla scheda di «Adesso» il tasto 🗂 copriva «da 3 min»: la testa ha 118 px a destra per «solo mia» e 🗂.
