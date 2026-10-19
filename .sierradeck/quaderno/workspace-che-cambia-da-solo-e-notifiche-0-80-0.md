---
titolo: "0.80.0: il workspace non cambia più da solo, notifiche solo utili, tutto nel registro"
quando: 2026-10-19T15:30:00+02:00
tag: ["0.80.0", "workspace", "notifiche", "registro", "autopilota", "c-11"]
---

# Workspace che cambia da solo e notifiche (0.80.0, ramo c-11)

Segnalate da Nicholas il 19/10: «il workspace sullo schermo cambia da solo» e «mille notifiche quando un autopilota lavora».

## Le cause (dalla mappa del codice)
- **Workspace.** La consegna di un autopilota portava la finestra nel workspace **dichiarato** dall'autopilota (`App.tsx`, `comePortare` dava «cambia»). Contava solo la tastiera: dopo 45 s senza tasti cambiava anche se Nicholas stava leggendo. In più `tornaNelSuoWorkspace` (`consegne-autopilota.ts`) tornava lì fino a 3 volte per consegna, e ogni cambio trascinava le altre finestre (`workspace:cambiato`). Niente di questo finiva nel registro.
- **Notifiche.**
  - Pagina: le domande si riannunciavano a ogni ricarica, e «aspetta che tu scelga» si riaccendeva a ogni oscillazione di `chiede`.
  - App: per `k:` la stessa oscillazione, e ogni avviso suonava.
  - Nessuna faccia scriveva le notifiche da qualche parte.

## Cosa è cambiato
- **Registro dei cambi di workspace.** `creaAzioniWorkspace` scrive `[workspace] lo schermo passa da «A» a «B»: <causa>` per ogni strada: Nicholas (linguetta, pannello, Guarda), autopilota, telefono, pagina o altro PC, altra finestra. Il processo principale scrive anche quando il cambio arriva da `/api/workspace` o da un workspace creato o eliminato da remoto.
- **Un autopilota non cambia mai lo schermo.** `comePortare` restituisce `qui` oppure `sottofondo`. La consegna va in sottofondo e `consegnaInSottofondo` mette la chat in un riquadro del **suo** workspace salvato; aprendolo, il riquadro la prende senza riavviarla. Intanto la chat si vede in «Al lavoro in sottofondo», con Guarda. Lo schermo cambia solo con «Guarda».
  - Ripiego: se il sottofondo non è ancora pronto (all'avvio), si porta la finestra, con la causa scritta nel registro.
- **Conflitto di decisioni, risolto così.** Il 15/10 Nicholas aveva deciso: «la chat governata sempre in un riquadro del suo workspace; il sottofondo solo se lo chiedo io». Il 19/10 il criterio è: «nessuna azione di un autopilota cambia il workspace». Vale il più recente. Del 15/10 resta il riquadro nel suo workspace, con Guarda. **Da confermare con Nicholas** se gli va bene così.
- **Notifiche della pagina** (`src/shared/avvisi-raggruppati.ts`, incorporato con `toString()`):
  - avvisi vicini (stesso giro, o meno di 20 s) = uno solo, con l'etichetta `sierradeck-gruppo`;
  - la scelta che va e viene in meno di un minuto si annuncia una volta;
  - le domande già aperte non si annunciano all'apertura della pagina.
- **Notifiche dell'app** (`Avvisi.kt`, `Ronda.kt`): `kq:<id>:<ms>` tiene la scelta per un minuto di quiete; gli avvisi a meno di 20 s dal precedente entrano nella pila senza suonare (`setSilent`).
- **Ogni notifica nel registro del PC.**
  - La pagina e l'app mandano `POST /api/avviso-mostrato`, che diventa `[avviso] pagina|app del telefono: <tipo> «titolo»`.
  - Il PC scrive `[avviso] PC: domande … in vista da sole`.
  - Un PC vecchio senza la rotta risponde 404 e l'app non se ne cura.
- La scelta (`k:`) **resta annunciata anche per le chat governate**: l'autopilota non concede permessi al posto di Nicholas (decisione già presente nell'app). Nella pagina l'avevo esclusa per errore e l'ho rimessa.

## Test
`workspace-azioni.test.ts`, `consegna-visibile.test.ts`, `consegna-in-sottofondo.test.ts`, `avvisi-raggruppati.test.ts`, `client-pagina-spunte-e-schede.test.ts`, `avvisi-chiusi.test.ts`, `AvvisiViciniTest.kt`.

## La prova con un autopilota vero (copia di prova, 19/10, 26 minuti)
Copia `SIERRADECK_PROVA` sulle porte 47660/47661. Il servizio vero (47640/47630) non è stato toccato.
- **Scena:**
  - schermo su «Predefinito»;
  - autopilota «Prova notifiche» nel workspace «Prova AP», con due compiti (somma.js, media.js), che ha chiesto l'ok per unire;
  - pagina del telefono in Edge headless con `Notification` finta che conta;
  - `/api/stato` registrato ogni 3 s.
- **Workspace:**
  - 15 consegne per «Prova AP», tutte in sottofondo;
  - **0 cambi dello schermo** (`[workspace] lo schermo passa`: 0).
  - Con la 0.79.0 la finestra andava in «Prova AP» alla prima consegna dopo 45 s senza tasti, e a ogni consegna se tornavi indietro.
- **Notifiche della pagina.** Gli stessi 459 stati sono stati rigiocati nella logica di prima e di dopo:

  | | 0.79.0 | 0.80.0 | 0.80.0 + `governata` (528ea3c) |
  |---|---|---|---|
  | pagina sempre aperta | 6 | 4 | **2** (le due domande vere) |
  | pagina riaperta ogni 5 min | 8 | 5 | **1** |

  Dal vero, la pagina ha mostrato 4 avvisi:
  - 3 «Sviluppo · … aspetta te», che erano chat dell'autopilota (corretto poi);
  - 1 domanda.

  Tutti e quattro sono nel registro del PC (`[avviso] pagina`).
- **PC:** 2 righe `[avviso] PC: domande … in vista da sole`, una per domanda vera.
- **App:** non provata nella copia (serve un telefono). Usa lo stesso `governata` che arriva dal PC, quindi la correzione vale anche lì.
- **Difetti trovati e corretti** (vedi `correzioni-velocita-e-codice-0-80-0.md`):
  - chat in sottofondo senza `governata`;
  - riga di stato come «ultima riga»;
  - Revisione mai aperta con il freno.

**Come rifarla:**
1. Gli script `prepara.mjs` (cartella, porte, credenziali senza refreshToken, progetto git) e `pilota.mjs` (workspace, autopilota, Edge headless, stati) stavano nello scratchpad della sessione. La ricetta è anche in `prova-con-chat-vere-in-una-copia.md`.
2. Alle chiamate CDP serve un tempo massimo: senza, una sola chiamata appesa ferma il pilota.
3. Alla fine:
   - fermare gli alberi `electron.exe` della cartella del ramo;
   - svuotare `.credentials.json` e cancellare la cartella.

## Resta da fare
- Altre strade automatiche che toccano la finestra senza cambiare workspace (ripristino del layout, rispecchiamento ogni 2 minuti) scrivono già nel registro quando cambiano lo schermo. Nella prova non ne è comparsa nessuna.
