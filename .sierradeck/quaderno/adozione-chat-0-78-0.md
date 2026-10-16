---
titolo: "Chat già avviate adottate dall'autopilota del workspace (0.78.0): come funziona e trappole"
quando: 2026-10-16T18:35:00+02:00
tag: ["0.78.0", "adozione", "autopilota", "migrazione", "trappole"]
---

Nicholas, 16/10: «le chat già avviate non le hai convertite e quindi di fatto non è cambiato nulla».

## Come è fatta
- **Dati:** `Autopilota.adottate` (sessionId, titolo, ruolo, soloMia) e `perAdottate` (i messaggi in coda). Non sono `chats`: il giro dell'autopilota non le guida, non le chiude, non le riavvia.
- **Regole pure:** `src/shared/adozione.ts`. Contiene `ruoloDaContenuto`, che usa parole intere e nel dubbio non dà ruolo (non `ruoloDaTesto`, troppo largo), `conChatAdottate`, `daScrivereAdesso` (solo chat viva e `aspetta`) e il prompt.
- **Servizio:** le rotte `/autopiloti/:id/adotta`, `adotta/togli`, `solo-mia` e `adottate/scritti`.
- **Dialogo:** il dialogo può rispondere con `perLeChat: [{chat:"A1", testo}]`.
- **Main:** `src/main/adozione-chat.ts`.
  - **Migrazione** (`migrazione-adozione.json`): copia, poi adozione per gli autopiloti veri, con i dormienti doppi archiviati in `dormientiArchiviati`.
  - **Giro ogni 4 s:**
    - adotta le chat nuove, solo se l'adozione è «fatta»;
    - scrive con `scriviNelRiquadro`, la stessa strada del telefono, solo se la chat è ferma.
  - **«Solo mia»** vale anche dalle preferenze (`chatSoloMie`).
- **Riavvio:** dopo un cambio al servizio, nella copia di prova, bisogna mandare `POST /spegni` a 47651. Con la stessa versione il Gestore non lo riavvia da solo.

## Trappole viste dal vero
- **Fotografia di inizio turno:** `conservaCambiUtente` e la fusione del dialogo devono riportare `adottate` e `perAdottate` dal disco, come `dialogo` e `daConsegnare`. Senza, un giro cancellava le adottate e il messaggio appena messo in coda.
- **Coda nel prompt:** il supervisore va informato di cosa è davvero in coda, altrimenti crede in coda un messaggio perso e rifiuta di rimandarlo.
- **«Torna come prima»** deve togliere *tutte* le adottate, anche quelle prese dal giro dopo la migrazione.
- **Prove con CDP:** il `<select>` nel riquadro è «⇄ Sposta questa chat», non il selettore dei workspace (quello è `.ws-menu__tasto`). Cambiarlo dal codice sposta davvero la chat e ne chiude il terminale.
- **Clic col mouse via CDP:** misurare il bersaglio subito prima del clic. Se si misurano tutti facendo `scrollIntoView` uno dopo l'altro, le coordinate dei primi diventano vecchie.
- **Pagina del telefono:** ogni stato nuovo che cambia la vista va messo in `impronta()`, altrimenti il tocco non ridisegna.
