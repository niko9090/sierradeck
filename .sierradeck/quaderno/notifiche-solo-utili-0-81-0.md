---
titolo: "Notifiche solo utili (0.81.0): solo domande, lavori finiti, errori che bloccano; ogni notifica nel registro con la causa"
quando: 2026-10-20T14:50:00+02:00
tag: ["notifiche", "autopilota", "telegram", "0.81.0", "PC", "pagina", "app"]
---

Seguito della scheda di c-7 «Notifiche 0.81.0: cosa è fatto e cosa resta». Ramo c-10, commit `a5772a1` e le correzioni della Revisione.

## La regola
`riparteDaSolo(a)` in `src/shared/autopilota.ts`: un autopilota **sospeso** che ripartirà senza Nicholas.
- La pausa per i limiti del piano (`pausaLimitiFinoA`) o per un aggiornamento (`fermatoPerAggiornamento`) **non avvisa**.
- Avvisano ancora:
  - la preparazione guastata;
  - le chat mute;
  - la preparazione che non conclude;
  - un «fallito», anche con una pausa rimasta addosso;
  - le domande, «pronto», «finito», lo stallo.

## Dove si applica
- **Servizio** (`server.ts`, `avvisaFermo`): i 7 punti che mandavano `avvisa('sospeso')` passano di qui. Una pausa scrive solo `[notifica] nessun avviso per … riparte da solo`.
  - Se la ripartenza dopo il freno fallisce, è un fermo vero e avvisa.
  - I tre fermi della preparazione avvisano con lo stato salvato (sospeso, con il motivo), non con quello di prima.
- **`/api/stato`** (`client-rotte.ts`) aggiunge `riparteDaSolo: true` a quei fermi. Pagina (`avvisaSeServe`) e app (`Avvisi.kt`) li saltano **senza segnarli come visti**: se poi il fermo resta vero con la stessa chiave, si annuncia. Un PC vecchio non manda il campo, e tutto resta come prima.
- **«Ripreso dopo un riavvio»** non è più un avviso (`server.ts`, tolto da `telegram.ts`): resta una riga nel registro.
- **Telegram** (`creaAvvisatore`):
  - il primo avviso parte subito;
  - quelli entro `AVVISI_VICINI_MS` (20 s) dall'ultimo invio partono insieme alla fine della finestra, come «N avvisi da SierraDeck»;
  - se il gruppo supera i 4000 caratteri parte un messaggio per avviso, perché troncare romperebbe l'HTML e Telegram rifiuterebbe tutto;
  - ogni avviso ha la sua riga `[notifica] Telegram: …`.
- **PC:** anche la notifica di Windows «aspetta per aggiornarsi» scrive `[avviso] PC: …` nel registro.

## Test
- Vitest: `tests/shared/notifiche-solo-utili.test.ts`, `tests/autopilot-host/telegram.test.ts`, `tests/autopilot-host/server.test.ts` (freno oltre il 95%: nessun avviso), `tests/autopilot-host/ripresa-al-ritorno.test.ts` (nessun «ripreso»), `tests/renderer/avvisi-chiusi.test.ts` (pagina).
- App: `AvvisiTest.kt`.

## Fatto il 20/10 (dopo la 0.80.1)
- **Ripartenza dopo il freno fallita.** La prima correzione non avvisava mai: la ripartenza salva «al lavoro» prima di avviare la chat, quindi `eFermo` era sempre falso. Ora avvisa comunque, con il motivo «non è ripartito dopo la pausa per i limiti». Test in `server.test.ts`, verificato rosso con il codice vecchio.
- **Allo spegnimento** (`POST /spegni`, aggiornamento) gli avvisi Telegram in attesa partono subito con `avvisatore.svuotaOra()`, aspettati al massimo 3 s. Il timer, se scatta dopo, non li rimanda.
- **Unione con la 0.80.1** (c-12): una chat che tace va da parte e non sospende più. Il conflitto in `controllaChatFerme` è risolto tenendo la 0.80.1.
- **Trappola:** un heredoc Bash `<<'EOF'` riduce `\\n` a `\n` dentro gli script di sostituzione. Gli script con backslash si scrivono con Write.

## c-17, 20/10: la causa nel registro e le tre sole categorie
Commit `14ce35e0` e `33a2a3ce` (correzioni della Revisione), uniti in main con `5187eed7`.

**Regola.** Una notifica parte solo per: una domanda o una scelta che aspetta Nicholas (anche «aspetta il via» e la chat ferma da 3 min), un lavoro finito, un errore che blocca. Ogni notifica mostrata ha una riga nel registro del PC **con la causa**.

- **Pagina** (`avvisaSeServe`): ogni avviso porta `causa`. Nel registro va **ogni** avviso, anche quelli fusi in un gruppo, con `(in un gruppo di N)`. La notifica «versione pronta» è tolta: la banda nella pagina resta.
- **Rotta** `POST /api/avviso-mostrato`: riga `[avviso] pagina|app del telefono: <tipo> «titolo», causa: …`. Un telefono vecchio senza causa scrive «causa: non detta (versione vecchia)».
- **App**: `Avviso.causa` (default vuoto, i chiamanti vecchi non cambiano), mandata da `Ronda.riferisci`. Ora finiscono nel registro anche «È uscita l'app» (`ControlloApp`) e «File ricevuti» (`Consegne`, senza il nome del file).
  - **«Versione pronta» spenta di partenza** (`acceso = false`). L'interruttore resta: nessuna funzione tolta. Chi l'aveva acceso a mano la tiene.
  - «Computer scollegato» resta acceso: il PC irraggiungibile blocca tutto.
- **Servizio**: «in difficoltà, provo un'altra strada» (`stallo` mentre lavora) **non avvisa più**, perché continua da solo. Resta la riga `[notifica] nessun avviso per … cambia strada da solo`. Se poi si ferma, avvisa il fermo. Le righe `[notifica] Telegram` dicono la causa (`causaAvviso`).
- **PC**: le due righe `[avviso] PC` (domande in vista da sole, «aspetta per aggiornarsi») dicono la causa.
- **Privacy** (Revisione): nella causa va solo l'inizio della domanda (60 caratteri), mai il testo intero. Il testo intero sta nelle Domande.

**Test:**
- `tests/main/client-pagina-spunte-e-schede.test.ts`: gruppo con le cause, fermo e finito con la causa, fermo che riparte da solo muto, versione che non notifica;
- `tests/main/client-rotte.test.ts`: riga del registro;
- `tests/autopilot-host/telegram.test.ts`: `causaAvviso`, riga Telegram;
- `tests/autopilot-host/server.test.ts`: lo stallo non avvisa;
- `NotificheTest.kt`: causa, versione spenta di partenza.

**Revisione:** agente revisore sul commit, APPROVE, 0 critici e 0 alti. I due punti medi sono corretti in `33a2a3ce`. Restano come scelta di Nicholas: «aspetta te» dopo 3 min e «computer di nuovo raggiungibile».

### La prova nella copia (20/10, 08:50–09:48, 50 minuti di stati registrati)
`SIERRADECK_PROVA` in `note/prova-081-notifiche`, porte 47690/47691, DevTools 9393 per la finestra e 9394 per Edge headless (la pagina, con `Notification` finta che conta). Il servizio vero (47630/47640) non è stato toccato: alla fine era ancora in ascolto. Copia fermata (20 processi), credenziali svuotate. Gli script `prova.mjs` e `rigioca.mjs` erano nello scratchpad della sessione.
- **Scena:**
  - autopilota «Prova notifiche» nel workspace «Prova AP», in un progetto git;
  - 2 compiti (somma.js, media.js), poi la Revisione;
  - lo schermo su «Predefinito».
- **Numeri:**
  - 448 stati letti ogni 5 s, 77 righe `[consegna]`;
  - **2 notifiche della pagina in 50 minuti**, tutte e due utili:
    - la chat «Sviluppo» ferma su una scelta vera («package.json è ESM, come procedo?»);
    - la domanda dell'autopilota «Unisco io il ramo c-1 senza aspettare la Revisione?»;
  - **2 righe `[avviso]` nel registro**, ognuna con la causa;
  - 0 notifiche per consegne, giri o cambi di stato;
  - telegram spento nella copia (nessun file di configurazione): coperto dai test.
- **Rigiocati gli stessi 448 stati:**
  - main 0.80.1 (prima): 2 notifiche, 2 righe senza causa;
  - c-17 (dopo): 2 notifiche, 2 righe con la causa.

  Il rumore l'aveva già tolto c-11 (0.79.0 → 0.80.0: da 6 a 2 nella sua prova). Qui cambia la riga del registro, e spariscono la versione pronta e lo stallo, che in questa scena non sono capitati.
- **App:** non provata dal vero, perché serve il telefono. Copre `NotificheTest.kt`, e `gradle testDebugUnitTest assembleDebug` è verde.
- **Due interventi miei, come avrebbe fatto Nicholas:**
  - il «Vai.» dal telefono;
  - la scelta «ESM» con `/api/scegli`, che vuole l'etichetta **senza** il numero: `"ESM (Recommended)"`; «1» dà «la scelta è cambiata».

### Difetto visto nella prova (corretto poi da c-241: vedi «Collaudo da main di c-241»)
**Le consegne in sottofondo non partono.**
- Nella copia, le 2 chat avviate in sottofondo hanno avuto il testo nel campo, ma l'Invio non lo faceva partire. Il registro dice «Invio non lo fa partire … resta in coda, fermo, finché non si preme Riprova».
- Sono rimaste ferme 14 minuti, senza nessun avviso a Nicholas. Sono partite subito quando lo schermo è passato su «Prova AP».
- Può dipendere dalla Claude Code nuova della copia, con gli avvisi del primo avvio («1 more notice hidden»). Va verificato sul PC vero leggendo le righe `[sottofondo]`.
- Se capita anche lì, è un «errore che blocca» e dovrebbe dirlo a Nicholas.

### Trappola
**Il ramo sparisce dopo l'unione.** A metà prova la cartella di lavoro `ap-f1e631f5-c-17` è stata staccata da git (`.git` sparito, ramo tolto) dopo l'unione in main. Il lavoro era già in main. Per scrivere il rapporto ho ricreato il ramo da main nella cartella `ap-f1e631f5-c-17-quaderno`. In quella vecchia restano `out/`, `note/` (la copia) e la giunzione `node_modules`: si tolgono a mano (prima `cmd /c rmdir node_modules`).

## Collaudo da main di c-241 (20/10 pomeriggio): i numeri con Telegram e il PC contati
Ramo `ap/ap-f1e631f5/c-241`, partito da main `b17cca1b` (contiene c-17 e c-14). Copia di prova `SIERRADECK_PROVA` in `note/prova-241*`, porte 47700/47701. DevTools 9403 (finestra), 9404 (Edge, la pagina), inspector del main 9405. Il servizio vero (47630/47640) è rimasto in ascolto per tutto il tempo.

**Come si è contato:**
- **Pagina:** `Notification` finta che registra ogni notifica.
  - Lo script «a ogni pagina nuova» di CDP muore con la sessione: la finta va messa con `Runtime.evaluate` nella pagina già aperta.
- **PC:** spia nel main via `--inspect`. `require('electron')` passa dall'API della console (`includeCommandLineAPI`), e da lì si avvolgono `Notification.prototype.show` e `BrowserWindow.prototype.flashFrame`.
- **Telegram:** `telegram_config.json` con un token finto. Ogni tentativo lascia la sua riga «[notifica] Telegram» o «non recapitato», e non arriva niente a nessuno.
- **App:** nessun telefono collegato (`adb devices` vuoto). La coprono `AvvisiTest.kt` e `gradle testDebugUnitTest assembleDebug`, che è verde.

### Prima, main senza correzioni (12:21–12:59, 38 min)
- Le 3 consegne in sottofondo non sono mai partite:
  - 2 sono rimaste ferme su «Invio non lo fa partire»;
  - 1 è finita «lenta» dopo 180 s.
- L'autopilota è restato al lavoro senza fare niente, con **0 notifiche e 0 righe** nel registro. Il guardiano del silenzio avvisa solo dopo 60 min.
- È il difetto che c-17 aveva visto e non corretto (sopra).

### Con le correzioni (13:03–14:20, 77 min, poi 14:28–14:32)
- **Lavoro:**
  - 246 righe `[consegna]`, 71 testi consegnati, 97 giri (64 revisione, 15 prosegui, 14 finito, 3 chiediUtente, 1 correggiCriterio);
  - 696 stati letti ogni 5 s;
  - 3 domande vere, a cui ho risposto come Nicholas;
  - un secondo autopilota da un compito, arrivato a «finito» in 3,5 min.
- **Notifiche:**

| Lato | Notifiche | Righe nel registro | Note |
|---|---|---|---|
| Pagina | 6 domande o scelte + 1 «ha finito» | 7 `[avviso] pagina`, con la causa | 1 scelta ripetuta, poi corretta (vedi sotto) |
| PC (Windows) | 6 lampeggi del pannello Domande, 0 notifiche di Windows | 3 `[avviso] PC` | doppio lampeggio per domanda, poi corretto |
| Telegram | 3 domande + 1 finito | 4 righe | ogni domanda parte subito; la pagina ne mostra una per volta |
| App | — | — | `AvvisiTest.kt` |

- **0 notifiche per consegne, giri o cambi di stato.** Una sola riga `[notifica] nessun avviso … cambia strada da solo`.
- **Rispetto ai 6→2 di c-11** (26 min, pagina): qui 7 notifiche in 81 minuti, tutte delle tre categorie. Dopo le correzioni sarebbero state 6 (la scelta ripetuta non parte più) e i lampeggi del PC 3.

### Corretto qui (3 commit, Revisione APPROVE, test rossi con il codice vecchio)
1. **Consegne in sottofondo che non partivano** (`56cd778e`, `src/main/sottofondo.ts`).
   - **Causa, misurata con un pty a parte:** Claude Code 2.1.304, appena disegnato il campo, tiene da parte quello che si scrive per 6-10 s (di più con il PC carico) e lo mostra dopo.
   - Il sottofondo, senza eco, dopo 8 s premeva Invio alla cieca. L'Invio arrivava attaccato al testo e diventava un a capo. Il testo sembrava perso e veniva riscritto: due copie nel campo, e nessun Invio lo faceva più partire.
   - Lo stesso doppione si vede nel primo messaggio di questa chat c-241 sul PC vero.
   - **Ora:** con il campo ancora vuoto si aspetta fino a 60 s che il testo compaia; oltre, è perso e si riscrive.
   - Rispondere alle domande del terminale (`ESC[>0q`, `ESC[?u`, `OSC 7501`) **non** cambia niente: provato e scartato.
2. **Scelta riannunciata** (`56cd778e`).
   - Le chat in sottofondo non dicevano `sceltaAperta`, che i riquadri dicono.
   - `statoChat` dopo ~20 s spegneva «chiede», e al segnale dopo la stessa scelta tornava come notifica nuova (11:08 e 11:12).
3. **Causa per l'annuncio di «Errori arrivati»** su pagina, app e PC (`56cd778e`). Prima nel registro finiva «non detta (versione vecchia)».
4. **Doppio lampeggio del pannello Domande** (`7da5f59d`).
   - Il pannello aperto da solo lampeggia aprendosi. Al primo caricamento vede le domande passare da 0 a 1 e chiedeva un altro lampeggio, senza riga.
   - **Ora:** entro 10 s non lampeggia di nuovo (`richiamoLampeggia`), e il richiamo che lampeggia scrive la sua riga.
5. **Commit nel repository sbagliato** (`60923ac0`, `salvaLavoro`). Vedi la trappola sotto.

### Trappola: il servizio della copia ha fatto commit nel mio ramo
- La cartella di lavoro di una chat chiusa (`progetto-prova.sierradeck-wt/ap-…-c-3`) era rimasta senza `.git`, con dentro solo `.sierradeck/`. Stava dentro la mia cartella di lavoro, che era su un ramo `ap/…`.
- Al «pronto per la revisione», git è risalito fino al mio repository e ha fatto commit due volte delle mie modifiche in corso. La guardia della 0.71.0 guardava solo che il ramo cominciasse con `ap/`.
- **Ora** la radice git deve essere la cartella stessa.
- **Finché la copia gira con il codice vecchio:** `git init -b fermo` nelle cartelle senza `.git`, e niente modifiche non salvate nella cartella che contiene la copia.

### Difetti visti e NON corretti qui
- **Autopilota che non riesce a dirsi finito.**
  - La Revisione c-7 aspettava il ramo di c-3, che non esisteva più. Dalle 13:41 il supervisore ha detto «finito» 14 volte, e il giro ripartiva in revisione.
  - L'autopilota ha chiesto a Nicholas di **chiudere a mano** la chat. Va contro la regola «mai chiedere a Nicholas di chiudere chat».
  - Neanche la risposta «chiudile tu» lo ha sbloccato. Da correggere in `chiudiChat`/attesa della Revisione.
- **Testi identici consegnati in fila alla stessa chat di Revisione** (c-8, c-11, c-13, c-14… fino a c-58).
  - Con lo stesso testo, `contaMandati` non vede la riga in più e il testo risulta «perso» dopo l'Invio: 16 volte, e 1 fermo dopo 3 scritture.
  - Non è una notifica, ma consuma.
- **Il PC non ha una notifica di Windows per «lavoro finito»** né per una domanda: solo il pannello che lampeggia. Da decidere con Nicholas se aggiungerla.

## Resta
- La prova dell'app su un telefono vero, dopo che Nicholas installa. Le righe `[avviso] app del telefono` con la causa dicono se arrivano solo le tre categorie.
- Decisione di Nicholas: tenere «aspetta te» dopo 3 min e «computer di nuovo raggiungibile», o spegnerli.
- Decisione di Nicholas: una notifica di Windows sul PC per «finito» e per le domande, o basta il pannello che lampeggia.
- L'autopilota che non si chiude con una Revisione su un ramo che non c'è più (sopra).
