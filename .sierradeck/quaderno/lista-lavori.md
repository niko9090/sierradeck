---
titolo: "Lista dei lavori: le richieste di Nicholas in ordine di priorità"
quando: 2026-10-21T17:10:00+02:00
tag: ["lista-lavori", "priorità", "release", "nicholas"]
---

Scritta da c-52 il 21/10 su richiesta del supervisore (consegna c-528). Elenca le richieste di Nicholas dal 19/10 in poi. Va aggiornata a ogni release e a ogni nuova richiesta, cambiando lo stato della riga senza toglierla.

Stati: **da fare**, **in corso**, **fatto in X.Y.Z**, **decide Nicholas**.

## Adesso, in ordine

| # | Richiesta | Data | Stato |
|---|---|---|---|
| 1 | **Le chat non devono più bloccarsi, perché così non riesce a lavorare.** Patch 0.82.1 dal tag v0.82.0, con quattro correzioni: (a) criteri rimisurati solo quando cambia il commit, uno alla volta per PC e mai durante un'unione; (b) quando il supervisore va oltre il tempo la chat prosegue, e il supervisore riprova con un tetto; (c) Git nel PATH di ogni chat, trovato dal sistema o dalle preferenze; (d) una chat che aspetta un'altra per più di un giro fa intervenire l'autopilota. Le stesse correzioni vanno poi portate in main | 21/10 | **fatto in 0.82.1** (pubblicata il 21/10 alle 17:05 da c-53, ramo `rilascio/0.82.1` dal tag v0.82.0, non installata). Le stesse correzioni sono in main dal ramo c-53. Cause e numeri in `rapporto-0-82-1.md` |
| 2 | **Ristrutturazione dell'app Android e della pagina del telefono** (0.83.0): quattro voci, casella dell'autopilota sempre visibile, velocità, leggibilità, codice in pezzi piccoli, nessuna funzione tolta | 21/10 | in corso (c-52): codice tutto in main o sul ramo c-52 (versioni 0.83.0 / 2.83.0, novità, correzioni della Revisione di c-46). Mancano la prova di R8, l'emulatore («Hai risposto: …»), le foto, i numeri della velocità nel rapporto e la mappa mandata con le foto |
| 3 | **0.84.0**, divisa in sei punti, elencati sotto | 21/10 | da fare, dopo la 0.83.0 |
| 3.1 | Trovare e correggere le cause dei blocchi rimasti (`blocchi-0-84-0.md`). La prima è l'idle_prompt di una chat i cui strumenti vengono rifiutati dagli hook ECC perché la sessione non trova Git Bash | 21/10 | da fare (la causa Git Bash è affrontata nella 0.82.1, punto (c): resta da verificare dopo l'installazione) |
| 3.2 | L'autopilota ha sempre il controllo: ogni chat gli riferisce a ogni passo | 21/10 | da fare |
| 3.3 | Lo storico delle azioni lo tiene l'autopilota, nel quaderno | 21/10 | da fare |
| 3.4 | Un agente che ha finito si chiude e la sua chat esce dall'elenco, con la conversazione nel recupero di 30 giorni | 21/10 | da fare |
| 3.5 | Plugin ECC con gli agenti specializzati su tutti i PC, con gli hook spenti. Oggi lo spegnimento manca nella maggior parte delle copie delle chat (`hook-ecc-ricontrollo-c-52-21-10.md`) | 21/10 | da fare |
| 3.6 | Domande chiare in modo definitivo: ognuna si capisce da sola e la risposta si vede sempre con la sua domanda | 21/10 | da fare |

## Già fatte (dal 19/10)

| Richiesta | Data | Stato |
|---|---|---|
| Mai chiedergli di chiudere le chat a mano: `chiudiChat` chiude i rami già uniti o mancanti | 19/10 | fatto in 0.80.0 |
| Autopiloti che non si fermano da soli (prima parte) | 20/10 | fatto in 0.80.1 |
| Domande non ripetute e sempre in italiano | 20/10 | fatto in 0.80.1 |
| «Elimina workspace» con recupero di 30 giorni, «Errori arrivati», «Sposta in…» per gli autopiloti | 19-20/10 | fatto in 0.81.0 |
| Le chat chiuse non ricevono più giri né compiti | 20/10 | fatto in 0.81.1 |
| Domande controllate contro lo stato vero: niente «pubblico la 0.81.1?» se è già pubblicata | 20/10 | fatto in 0.82.0 |
| Quante chat lavorano insieme lo decide il PC, colori fissi per le attività, menu dei workspace, «Apri cartella», meno cose in vista | 20-21/10 | fatto in 0.82.0 |
| Chiudere la domanda «pubblico la 0.81.1?», superata | 21/10 | fatto (chiusa da lui il 21/10 alle 13:45). Su questo PC è installata la 0.82.0 |

## Aspettano una sua decisione

| Cosa | Da quando |
|---|---|
| I «⋯» di c-38 (Istruzioni, File e Ha deciso dell'autopilota dietro «⋯») e di c-36 («⋯» per riga nei workspace) | 21/10 (0.82.0) |
| Come spegnere gli hook ECC nelle copie delle chat: A, copiare `settings.local.json`; B, lanciare le chat con la variabile; C, mettere `env` in `.claude/settings.json` | 21/10 |
