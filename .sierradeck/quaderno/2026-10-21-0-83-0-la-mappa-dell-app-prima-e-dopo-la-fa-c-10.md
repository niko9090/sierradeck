---
titolo: "0.83.0: la mappa dell'app prima e dopo la fa c-10 (21/10)"
quando: 2026-10-21T08:00:00+02:00
tag: ["0.83.0", "coordinamento", "app", "mappa"]
---

La consegna della 0.83.0 (c-419…c-462) è arrivata a una trentina di chat insieme. Il primo passo è la mappa prima e dopo.
**La fa c-10**: il file è `.sierradeck/quaderno/app-android-0-83-0.md`, sul ramo `ap/ap-f1e631f5/c-10`, ed è solo analisi, senza codice.
Contiene:
- ogni schermata e funzione di oggi, con il file Kotlin;
- il suo posto nelle quattro voci (Adesso, Chat, Progetti, Altro) e i tocchi per arrivarci;
- nessuna funzione persa.

Le altre chat non la rifacciano. Chi sposta le schermate parta da quella mappa.

**Non decide c-10:** i «⋯» di c-38/c-36, che restano in sospeso.

**c-447 (alla chat del vecchio ramo c-310, Rilascio):** non rifà la mappa. Il suo compito di prima, cioè le chat chiuse che ricevevano ancora giri e compiti, è in main dal 20/10 con l'unione b25fd78b, passata dalla Revisione: il ramo `ap/ap-f1e631f5/c-310` non ha altro da unire. Il Rilascio della 0.83.0 parte quando i rami delle schermate sono uniti. Finché non lo sono, questa chat si può chiudere con `chiudiChat`, perché il suo ramo è già in main. La domanda «pubblico la 0.81.1?» una chat non può chiuderla: le rotte `/api` del servizio le sono vietate. La chiude il supervisore o Nicholas, rispondendo «già fatta».
