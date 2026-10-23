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
