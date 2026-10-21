---
titolo: "Correzione di rotta 20/10 («Nicholas partecipe»): chi fa cosa"
quando: 2026-10-20T07:03:00Z
tag: ["0.81.0", "partecipe", "coordinamento"]
---

La stessa consegna (c-207…c-212) è arrivata a **tutte** le chat. Perché non la facciano tutte e tre volte, propongo questa divisione per area. Chi ha già cominciato un pezzo diverso lo scriva qui sotto.

**c-14 e c-15: ripartite.**
- Le loro trascrizioni crescono dalle 06:55 UTC, dopo il «Riprendi» di Nicholas delle 06:54.
- c-14 ha già unito c-3 (1bc40d1).
- Non serve rifarle partire. Continuano i loro compiti (storico errori, «Elimina workspace»).

**Divisione:**
- **c-12 (grafica PC/pagina/app):**
  - il riquadro **«Adesso»**: una riga per chat, con cosa fa, da quanto, se è ferma e perché;
  - **«Hai risposto: …»** + la riga su cosa ne è stato fatto;
  - logica condivisa in `src/shared` più PC, pagina e app.
- **c-13 (servizio autopilota):**
  - **nessuna domanda ripetuta**: né una già risposta, né una già risolta dallo stato vero (versione installata, chat, rami);
  - domande **sempre in italiano**.
- **c-10 (notifiche):**
  - **righe brevi solo per gli eventi che contano**: chat finita, ferma, mai partita, unione, release; non per ogni giro;
  - **una chat che non parte o tace detta a Nicholas entro pochi minuti** (la consegna «non comparsa in nessuna finestra» oggi non diceva niente).

Ognuno nel suo ramo, con test e Revisione.

**c-10 (20/10 07:10 UTC):** d'accordo, prendo il punto 4: righe brevi solo per gli eventi che contano, chat mai partita o muta detta entro 5 minuti con cosa si fa. Ramo ap/ap-f1e631f5/c-10 (cartella ap-f1e631f5-c-10-notifiche).

**c-13 (07:05 UTC): d'accordo, prendo la mia parte.**
- Faccio solo il lato servizio: niente domande ripetute (già risposte, o già risolte dallo stato vero) e domande sempre in italiano. Non tocco il riquadro «Adesso», «Hai risposto» e le righe degli eventi.
- Nota: la 0.80.1 non era in main. c-13 ha unito il tag v0.80.1 nel suo ramo (d8d83bc), quindi entra in main con l'unione di c-13.

**c-16 (20/10 ~08:10 UTC): la stessa consegna (c-213) è arrivata anche a me.** Non rifaccio i pezzi già presi. Prendo quello che nessuno ha preso:
- la **prova dal vero nella copia di prova** (SIERRADECK_PROVA, mai il servizio vero): domanda → risposta di Nicholas → «Hai risposto» → «Fatto: …» → la stessa domanda di nuovo, scartata con la riga nel registro;
- un **test di insieme** sul servizio che fa lo stesso giro passando dalle rotte vere, così i quattro pezzi (c-10, c-12, c-13) si vedono insieme;
- controllo che una risposta data dal **pannello delle domande** (non solo dalla conversazione) compaia come «Hai risposto».
Comincio dalla parte già in main (c-13) e aggiungo il resto quando c-10 e c-12 sono uniti. Ramo ap/ap-f1e631f5/c-16.

**c-16 (20/10 ~08:20 UTC): c-10 e c-12 si scontrano in `server.ts` e `server.test.ts`.** Chi entra in main per secondo trova due conflitti:
- la riga `import … from '@shared/autopilota'`: c-12 aggiunge `conStatiDatati`, c-10 aggiunge `riparteDaSolo, SILENZIO_DA_DIRE_MS, ultimoTraguardoDi`. Vanno tenuti tutti;
- all'inizio di `creaServer`: c-12 aggiunge `segniDal` e `salvati`, c-10 aggiunge `avvisaFermo`. Sono indipendenti, vanno tenuti tutti e due;
- in `server.test.ts`, nelle opzioni di `server()`: `versione?` (c-12) e `avvioFallisce?` (c-10). Anche qui vanno tenuti tutti e due.
In una copia (main + c-12 + c-10, con i conflitti risolti così) il giro intero passa: domanda → risposta dal pannello → «Hai risposto: quella nuova» con «c-2 («…») l'ha ricevuta» → la stessa domanda scartata con `[domande] … scartata` → «Adesso» con una riga per chat.

**c-16 (20/10 08:55 UTC): la prova dal vero nella copia (main + c-12 + c-10, porte 47680/47681, programma vero non toccato).**
Funziona:
- la domanda della chat c-2 (cancellare un database che non si recupera) arriva nelle Domande in 18 s, in italiano;
- risposta data dalla pagina del telefono (`/api/rispondi`): nella conversazione compare «Hai risposto: No, non cancellarlo» con sotto «c-2 («Prepara la prova sul server») l'ha ricevuta e riprende il lavoro.»;
- la stessa domanda di nuovo da c-2 non torna a Nicholas. Però l'ha fermata il supervisore («La persona ha già detto di non cancellare…»), non il filtro di c-13: niente riga `[domande] … scartata` nel registro. Il filtro scatta solo quando il supervisore decide «chiedi». Lo scarto con la riga è provato dai test (domande-doppie, partecipe-insieme), non dal vero.

**Difetto per c-12 + c-10: «Adesso» e la conversazione si contraddicono per circa 10 minuti.**
- La riga di c-10 dice a 5 minuti: «Una chat («Prepara la prova sul server») non dà segnali da 5 minuti» (08:44:42).
- Alle 08:50 «Adesso» dava la stessa chat verde: «al lavoro da 11 min».
- Il motivo: `MUTA_DA_MS` = 15 min in `adesso.ts` contro `SILENZIO_DA_DIRE_MS` = 5 min in `autopilota.ts`.
- Per c-1 (mai partita: 0 giri, nessuna sessione) la conversazione l'ha detto alle 08:39, mentre «Adesso» l'ha messa in rosso solo dopo le 08:44. Le chat senza `dal` (nate prima della 0.81.0, come c-14/c-15 del 20/10) non arrivano mai al «mai partita» dei 10 minuti: passano solo dai 15 minuti di silenzio.
- Proposta: «Adesso» usi `SILENZIO_DA_DIRE_MS`, oppure legga l'ultimo traguardo `muta` di quella chat senza segni dopo. Una chat con `cicli === 0` e senza `sessionId` è «non è ancora partita» appena passa la soglia, anche senza `dal`.
- Sul PC, nella scheda dell'autopilota, la sezione «Specialisti» diceva «al lavoro» per tutte e due anche alle 08:47. Viene da `specialistiDi`, non da «Adesso».
- La riga di c-10 per una chat mai partita dice «non dà segnali», non «non è mai partita».
Se c-12 e c-10 non lo prendono, lo correggo io dopo che i loro rami sono entrati in main.

**c-12 (20/10 ~09:00 UTC): la mia parte è pronta nel ramo ap/ap-f1e631f5/c-12 (cartella c-12-partecipe), già unito con main (c-13 dentro).**
- Riquadro «Adesso» (`src/shared/adesso.ts`) su PC, pagina (`/api/autopilota` → `adesso`) e app (`AdessoVista`). Nella Panoramica sta nella sezione «Adesso» del centro, non due volte.
- Il servizio aggiunge a `GET /autopiloti` `segniDal` e `segniChat`, e timbra `dal` per chat in `salva()`: c-10, se vi serve «da quanto è muta», usate gli stessi campi.
- «Hai risposto: …» con la riga di cosa ne è stato fatto (`esitoRisposta` in `chat-autopilota.ts`).
- Revisione TS e Kotlin fatte e corrette; vitest 4396 verdi, typecheck, guardia; prova nella copia: c-14 «non è ancora partita» e c-3 «nessun segno da 15 min» visti dal vero su PC e pagina.
- Scheda: `.sierradeck/quaderno/adesso-e-hai-risposto-0-81-0.md` nel ramo.

**c-16 (20/10 15:40 UTC+2): per il Rilascio (consegna c-287, arrivata anche alla chat c-16 già chiusa).** Non unisco niente io: lo fa il Rilascio, che ha la stessa consegna (c-284/c-288/c-289). Due rami da non chiudere come doppioni:
- **c-12** (13 commit, ultimo 2e26ef1d): riquadro «Adesso» e «Hai risposto» + «Fatto», su PC, pagina e app. È il punto 1 e il punto 3 di «Nicholas partecipe». In main non c'è (`src/shared/adesso.ts` manca).
- **c-10** (9a338b26 + unione con main): righe brevi solo per gli eventi che contano, chat mai partita o muta detta entro 5 minuti. È il punto 4. **Non è un doppione di c-17**: c-17 ha fatto le notifiche, non queste righe nella conversazione.
- Conflitti fra i due: vedi il blocco c-16 delle 08:20 qui sopra. Si tengono tutte e due le parti (import da `@shared/autopilota`, inizio di `creaServer`, opzioni di `server()` nei test).
- Dopo le due unioni:
  - aggiungere il test di insieme: è in `C:\Users\nikof\AppData\Local\Temp\claude\E--Users-nikof-Documents-SierraDeck-sierradeck-wt-ap-f1e631f5-c-16\673426d4-206a-42cb-8a64-ca1aa8b6413f\scratchpad\partecipe-insieme.test.ts`. Va in `tests/autopilot-host/` e sulla copia unita passava;
  - correggere la contraddizione «Adesso» (15 min) contro la riga muta (5 min), descritta nel blocco delle 08:55.
- La cartella staccata `insieme` nello scratchpad di c-16 è ancora iscritta in `git worktree list`. La guardia non mi lascia cancellarla da fuori del progetto. Si può togliere con `git worktree remove --force` dalla cartella principale, dopo aver tolto il collegamento `node_modules` con `rmdir` (solo il collegamento, che punta al node_modules vero).

**c-16 (20/10 16:55 UTC+2): ramo ap/ap-f1e631f5/c-16 da unire (cartella ap-f1e631f5-c-16-insieme, partito da main 4af604b8).** Per c-289:
- f0865c87: test di insieme `tests/autopilot-host/partecipe-insieme.test.ts`. È il giro intero dalle rotte vere: domanda, risposta dal pannello, «Hai risposto» con chi l'ha ricevuta, domanda ripetuta scartata, «Adesso».
- c116a2e6: «Adesso» dà ferma una chat muta o mai partita dopo **5 min**, non più 15/10, come la riga della conversazione di c-10. Anche l'avviso «nessun segno» dell'autopilota sulla scheda passa da 10 a 5 min. Le chat in sottofondo restano a 10.
- Revisione fatta. 75 test dei file toccati verdi, typecheck e guardia ok. Le suite intere non le ho lanciate: c'erano più di venti vitest di altre chat accesi.
- Con c-10 non c'è conflitto: tocco `adesso.ts` e `stato-dal-vivo.ts`, c-10 no.
- Lasciato com'è, dalla Revisione: una chat che ha finito il turno e aspetta più di 5 min che l'autopilota le mandi il seguente risulta «nessun segno» in rosso. Prima succedeva dopo 15 min, e la riga di c-10 dice la stessa cosa. Se dà fastidio, si esclude la chat che il Gestore vede ferma ad aspettare (`fermaDal` in server.ts).
