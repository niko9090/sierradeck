---
titolo: "Drive: l'autorizzazione che scade ogni 7 giorni, e l'automatico che non parte al riavvio"
quando: 2026-09-04T14:10:00+02:00
tag: ["drive", "oauth", "sincronia", "cassaforte", "passphrase"]
---

# Due cose diverse che si vedono come «i salvataggi sono in errore»

## 1. `invalid_grant`: Google ha buttato via il refresh token

**Il fatto.** `google-drive-token.json` del 27/08; dal 04/09 ogni salvataggio:
`SALVA fallito: Google OAuth: rinnovo fallito (400) invalid_grant`. Il
pannello Account diceva ancora «collegato ✓» (guarda solo se c'è un refresh
token nel file). `sync-stato.json`: ultimo salvataggio riuscito 27/08.

**La causa (quasi certa).** L'app OAuth in **Google Cloud Console** è in
modalità **«Testing»**: in quella modalità Google fa scadere i refresh token
dopo **7 giorni** (27/08 + 7 = 03/09, torna). Nessuna correzione nel codice lo
evita: va **pubblicata** l'app (OAuth consent screen → «Publish app»; con lo
scope `drive.appdata` non serve la verifica di Google). Finché resta in test,
il collegamento va rifatto ogni settimana.

**La correzione (0.12.53).** `creaFornitoreToken` ha una dep `scarta`: su
`invalid_grant` butta via il token (`conto-drive.ts`), così `stato().connesso`
torna falso e il pannello mostra «non collegato» + tasto per ricollegare, con
il messaggio `AUTORIZZAZIONE_REVOCATA` che spiega i 7 giorni. Un 503 di Google
**non** scollega (è un pomeriggio storto, non una revoca).

## 2. Perché l'automatico non parte all'apertura

Non è un difetto, è il modello E2E: la **chiave maestra vive solo in memoria**
(`maestra` in `sincronia.ts`), sbloccata con la passphrase. Dopo ogni riavvio
`maestra === undefined` e `salvaSeServe` (timer da 15 min, **nessun giro
all'avvio**) esce in silenzio: `if (maestra === undefined || !driveConnesso()) return`.
Quindi dopo un aggiornamento l'automatico è fermo finché qualcuno non
inserisce la passphrase nel pannello Account, e non lo dice a nessuno.

**Scelta di prodotto aperta (decide Nicholas):** conservare la maestra
avvolta con `safeStorage` (DPAPI, legata all'account Windows) per far
ripartire l'automatico senza passphrase. Costo: chi ha accesso al profilo
Windows può aprire la cassaforte senza passphrase; la passphrase resta
necessaria su un PC nuovo. Alternativa minima: al primo avvio con Drive
collegato e cassaforte bloccata, un avviso «l'automatico è fermo: sblocca».

## 3. «La barra avanza ma i MB restano a 0» (0.12.54)

`ripristinaIncrementale` e `salvaIncrementale` contano i **file** (uno alla
volta: scarica, decifra / cifra, carica) ed emettevano le fasi `scarico` /
`comprimo` con `fatto`/`totale` = numero di file. Il pannello trattava
`carico`/`scarico`/`cifro`/`decifro` come byte e divideva per 1 048 576:
«Scarico dal Drive — 0,0 MB / 0,0 MB (7%)». Il blocco unico di prima
(`motore.ts`/`lavoro.ts`) conta davvero i byte, quindi la regola del pannello
era giusta per lui.

Correzione: `Progresso` porta `unita?: 'byte' | 'file'`; l'incrementale emette
`carico`/`scarico` con `unita: 'file'`; il testo lo fa `descriviProgresso` in
`renderer/progresso-sync.ts` (puro, provato): «Scarico dal Drive — 3 / 40 file».
**Regola:** chi emette un conteggio dice in cosa conta; chi lo mostra non
indovina dalla fase.

