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

**Deciso da Nicholas il 2026-09-04 (0.12.55):** la maestra si conserva
avvolta da `safeStorage` (DPAPI, legata all'account Windows) in
`maestra-portachiavi.json`, accanto alla cassaforte. All'apertura della
sincronia si riapre da sola (`maestraRicordata`), ogni sblocco/creazione/
cambio passphrase la ricorda (`adotta`), «Blocca» la toglie anche dal disco
(è una scelta, vale per la sessione dopo). Un file che il portachiavi non
riapre (altro account, altro PC) si butta. Costo accettato: chi entra nel
profilo Windows apre la cassaforte senza passphrase; su un PC nuovo la
passphrase resta necessaria. In più un primo `salvaSeServe` un minuto dopo
l'avvio, oltre al giro ogni 15 minuti. Il `Portachiavi` è iniettato da
`index.ts`, il modulo non dipende da Electron.

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

## 4. «Non mi ricordo quale account Google ho usato» (2026-09-04 sera, 0.12.61)

Con più account (uno per computer) e il token morto, niente in locale diceva
l'indirizzo. Trovato **provando gli account dai dati**: consenso → `about.get`
(l'indirizzo) → `files?spaces=appDataFolder` → se ci sono `sierradeck.chiavi`
/`sierradeck.manifesto` è quello giusto. Script `trova-account-drive.mjs`
(scratchpad della sessione; lo stesso flusso PKCE dell'app, browser via
`rundll32 url.dll,FileProtocolHandler` perché `cmd /c start` tronca l'URL
alla prima `&`). L'account del Drive di Nicholas è **djniko90@gmail.com**
(466 file). Dalla 0.12.61 l'indirizzo si legge al collegamento
(`chiediEmail`, scope `drive.appdata` basta per `about.get`), sta in
`google-drive-token.json` come `email`, sopravvive al rinnovo e si vede nel
pannello Account sotto «collegato ✓».

## 5. Più PC, più account Google (0.12.62–0.12.63)

**Il caso, e la scelta di Nicholas:** ogni PC ha il suo account Google e la
sua cassaforte, e **così deve restare** (chiesto esplicitamente: non vuole
cambiare account; e non decidere per lui). Il problema era solo
*riconoscere*, su ogni PC, quale account quel PC usava, con i token scaduti
dalla modalità test.

**Riconoscere il Drive dai dati** (`esaminaDrive`: about.get + elenco
appdata, `prompt=select_account consent` per far comparire sempre la scelta):
il pannello mostra indirizzo, quanti file di SierraDeck, ultimo salvataggio,
e il **verdetto**: i nomi dei file nel manifesto locale del PC
(`nomiConosciuti`) confrontati con quelli lassù → «✓ è il Drive che questo PC
usava (464 su 464)» / «✗ nessuno» / «in parte». «Prova un altro account»
scollega e riapre la scelta. Niente si azzera provando: `cambiatoDrive()`
(mette da parte `sync-manifesto.json`) solo su «Va bene questo» con un Drive
vuoto, o adottando un'altra cassaforte.

**Facoltativo, non il piano:** `cassaforteDiversa` + «Usa la cassaforte del
Drive» (`adottaCassaforteDelDrive`) esistono per chi *vuole* spostare un PC
su un altro Drive; il pannello prima suggerisce «Cambia Drive».

Procedura sugli altri PC: aggiorna → Connetti → scegli un account → leggi il
verdetto → se ✗ «Prova un altro account» → se ✓ «Va bene questo» → Sblocca
con la passphrase di quel PC (o dal portachiavi, se già ricordata).

## 6. Trappola: i nomi dei file non distinguono due Drive (0.13.1)

I nomi nel manifesto sono `f_<sha256(percorso)>`: **derivano dai percorsi**,
non dai contenuti. Se il portatile ha le stesse chat del PC principale (le ha
ripristinate una volta), i nomi combaciano in TUTTI i Drive in cui sono
state salvate: il verdetto «✓ è il Drive che questo PC usava» era vero sul
PC principale (un solo Drive con quei file) e falso sul portatile, mentre il
riquadro «la cassaforte di questo PC non è quella del Drive» diceva il
contrario. **La prova che conta è la cassaforte** (`stessaCassaforte` da
`stato().cassaforteDiversa`, in `drive:connetti`): uguale → ✓, diversa → ✗.
I nomi restano un indizio solo per un PC senza cassaforte sua.

## 7. «Tutti gli account risultano cassaforte diversa» (0.13.2)

Il confronto in `stato()` guardava `sale` + `maestraDaPassphrase`: sono
proprio i due campi che `cambiaPassphrase` rifà. Se sul PC principale la
passphrase è stata cambiata dopo che il portatile aveva preso la sua copia
della cassaforte, il portatile vedeva «diversa» anche sul Drive giusto (e su
tutti gli altri, giustamente). **L'identità di una cassaforte è la
chiave-maestra**, e l'unico involucro stabile è quello di recupero:
`stessaCassaforte(a, b)` = `maestraDaRecupero` + `saleRecupero` uguali.
Se uguali ma la passphrase è cambiata, la copia locale si allinea da sola.
In più `provaPassphraseSulDrive(pw)`: apre la cassaforte del Drive con la
passphrase di qui e confronta le maestre → stessa (allinea + sblocca) /
altra cassaforte con la stessa passphrase / non apre. È la prova che non
sbaglia, e sta nel riquadro «cassaforte diversa» del pannello.

