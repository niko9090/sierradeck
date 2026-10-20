---
titolo: "Notifiche solo utili (0.81.0): solo domande, lavori finiti, errori che bloccano; ogni notifica nel registro con la causa"
quando: 2026-10-20T11:50:00+02:00
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

### Difetto visto nella prova (non corretto qui, da guardare)
**Le consegne in sottofondo non partono.**
- Nella copia, le 2 chat avviate in sottofondo hanno avuto il testo nel campo, ma l'Invio non lo faceva partire. Il registro dice «Invio non lo fa partire … resta in coda, fermo, finché non si preme Riprova».
- Sono rimaste ferme 14 minuti, senza nessun avviso a Nicholas. Sono partite subito quando lo schermo è passato su «Prova AP».
- Può dipendere dalla Claude Code nuova della copia, con gli avvisi del primo avvio («1 more notice hidden»). Va verificato sul PC vero leggendo le righe `[sottofondo]`.
- Se capita anche lì, è un «errore che blocca» e dovrebbe dirlo a Nicholas.

### Trappola
**Il ramo sparisce dopo l'unione.** A metà prova la cartella di lavoro `ap-f1e631f5-c-17` è stata staccata da git (`.git` sparito, ramo tolto) dopo l'unione in main. Il lavoro era già in main. Per scrivere il rapporto ho ricreato il ramo da main nella cartella `ap-f1e631f5-c-17-quaderno`. In quella vecchia restano `out/`, `note/` (la copia) e la giunzione `node_modules`: si tolgono a mano (prima `cmd /c rmdir node_modules`).

## Resta
- La prova dell'app su un telefono vero, dopo che Nicholas installa. Le righe `[avviso] app del telefono` con la causa dicono se arrivano solo le tre categorie.
- Il difetto delle consegne in sottofondo che non partono (vedi sopra).
- Decisione di Nicholas: tenere «aspetta te» dopo 3 min e «computer di nuovo raggiungibile», o spegnerli.
