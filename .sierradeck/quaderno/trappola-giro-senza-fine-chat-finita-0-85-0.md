---
titolo: "Trappola: una chat finita riceve all'infinito «i criteri passano tutti, ma il supervisore non ha detto se il lavoro è concluso»"
quando: 2026-10-23T17:30:00+02:00
tag: ["autopilota", "stop-hook", "trappola", "0.85.0", "c-127"]
---

**Visto il 23/10 su c-127** (0.85.0, richieste che diventano obiettivi). Il ramo era già unito in main (`caeffbbe`), la chat aveva chiuso con `SEGNALE: fatto` e i criteri passavano. L'hook di fine turno le ha risposto sei volte di fila: «I criteri passano tutti, ma il supervisore non ha detto se il lavoro è concluso: rifaccio il giro». Le ha riproposto ogni volta l'**obiettivo dell'intero autopilota**, non il suo compito.

**Perché gira a vuoto:** l'obiettivo intero comprende ancora la Revisione e la release 0.85.0, che non toccano a quella chat. La chat non può pubblicare («niente push e niente pubblicazione»). A ogni giro risponde la stessa cosa, e il supervisore non chiude né lei né l'obiettivo.

**Cosa dovrebbe fare il programma** (da correggere):
- una chat il cui ramo è unito e che ha mandato `SEGNALE: fatto` è un agente finito: si chiude (`agenteFinito`) invece di rifare il giro;
- il lavoro che resta (qui la release) va a una chat nuova o a quella del rilascio;
- dopo 2 risposte uguali di fila, il giro non si rifà con le stesse parole.

**Se ti capita in una chat:** non inventarti lavoro fuori dal tuo compito per «chiudere» l'obiettivo. Ricontrolla in main che il tuo pezzo ci sia e che i test passino, rispondi in poche righe e chiudi con `SEGNALE: fatto` o `SEGNALE: aspetto <chi>`.

**Secondo caso, 23/10 su c-134.** La chat aveva ricevuto un compito doppio di quello di c-132 (l'indicatore) ed era aperta nella cartella principale, su `main`. Non aveva quindi niente da unire. Ha chiuso con `SEGNALE: fatto` e l'hook ha rifatto lo stesso giro. Il programma dovrebbe riconoscere anche questo caso: una chat senza ramo, che ha scritto `fatto` e ha dichiarato il doppione, va chiusa.

**Terzo caso, 23/10 su c-136** (consegne c-978 e c-981: ancora l'indicatore, già unito con `a11c1fa7`). Anche questa chat era in cartella principale su `main`, senza ramo, e in parallelo c'era c-980 con lo stesso compito. Le due chat hanno scritto la stessa riga della lista dei lavori: il commit di c-980 si è preso anche la modifica dell'altra chat, perché lavorano sulla stessa cartella. Dopo `SEGNALE: fatto` l'hook ha rifatto il giro almeno 3 volte. Lo stesso compito è stato consegnato a 4 chat (c-132, c-134, c-980, c-136): il supervisore dovrebbe vedere in main che il compito è già fatto **prima** di consegnarlo di nuovo.

**Quarto caso, 23/10 su c-135** (consegne c-977 e c-980, sempre l'indicatore). Anche questa chat stava sulla cartella principale. Dopo `SEGNALE: fatto` l'hook ha rifatto il giro 2 volte. Nel frattempo la release v0.85.0 è uscita (non bozza) con 3 file soli: `latest.yml`, `.exe` e `.blockmap`. **Mancano `app-android.json` e l'APK 2.85.0**: tocca alla chat di rilascio, con `npm run allega-apk`.

**Quinto caso, 23/10 su c-133** (la chat della release 0.85.0, con ramo suo). Release completa con 5 file, ramo unito in `main`, `SEGNALE: fatto` mandato più volte: l'hook ha rifatto il giro almeno 3 volte con le stesse parole. Quindi il difetto c'è anche per una chat **con ramo, unita e finita**, che è il caso più semplice. Nota sul quarto caso: i 2 file che mancavano li stava allegando proprio c-133 (`allega-apk` era ancora in corso). Prima di scrivere «manca» su una release appena uscita, guardare se la chat di rilascio sta ancora lavorando.

**Sesto caso, 23/10 sera, su una Revisione di c-106** (consegne c-1001, c-1007 e c-1011). Arrivano ancora consegne per rivedere `ap/ap-f1e631f5/c-106`, ma quel ramo **non esiste più**: è stato chiuso come doppione, e i 4 difetti del Punto sono in main con `fa4683d5`. La copia `ap-f1e631f5-c-106` non è più un repository git. Nella stessa consegna è arrivata anche la richiesta 0.84.4 (ambiente della copia e risposte «presa»/«non presa»), che però è già uscita: `v0.84.4` e `v0.85.0` hanno il tag, rapporto-0-84-4.md righe 20-21. Il supervisore dovrebbe controllare che il ramo esista (`git branch --list <ramo>`) prima di consegnare una revisione, e in main che la richiesta non sia già fatta. **Se ti capita:** non rifare il lavoro, scrivi REVISIONE: OK con la nota «niente da unire», poi `SEGNALE: fatto`.

**Settimo caso, 23/10 alle 18:30, su una Revisione di c-82** (consegne c-810, c-987 e c-1026, tutte con lo stesso testo). Il ramo `ap/ap-f1e631f5/c-82` non esiste più dal 22/10 alle 12:39: è stato unito con c-79 (`cfada715`, che è in main) e cancellato. La sua copia non è un repository git. Tutto quello che chiedeva è in main: in `collaudo-domande-risposte-0-84-1.test.ts` non c'è più nessun `it.fails`, e insieme a `risposta-verificata.test.ts` dà 27 test verdi. L'hook della Revisione blocca anche `git status` e i comandi che cominciano con `cd … &&`; per leggere usa `git -C <repo>`. Lo schema è uguale al sesto caso: il supervisore consegna revisioni di rami spariti senza prima controllare `git branch --list`.
