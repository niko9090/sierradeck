---
titolo: "Storico degli errori e invio al PC di sviluppo (0.81.0)"
quando: 2026-10-19T16:40:00.000Z
tag: ["errori", "0.81.0", "ponte", "impostazioni"]
---

Chiesto da Nicholas il 19/10. Ramo `ap/ap-f1e631f5/c-3`.

## Il giro

1. **Dove nasce un errore.**
   - **PC e servizio degli autopiloti:** ogni `registro.errore(...)` passa da `conStorico` (`src/main/storico-errori-file.ts`). Ci finisce anche ogni `console.error`, perché `consoleNelRegistro` lo manda già al registro.
   - **Cosa si stava facendo:** è l'ultima riga normale del registro, se è di meno di 2 minuti prima.
2. **Dove si salva.** In `<dati>/errori/errori-app.json` e `errori-servizio.json`, un file per processo: scrivono insieme e uno solo perderebbe le voci dell'altro.
   - **Chi legge:** `leggiStoricoDi` li unisce.
   - **Durata:** il registro dei giorni si toglie dopo 14 giorni, lo storico no. Tiene al massimo 200 voci e toglie quelle viste meno di recente.
3. **Cosa si salva.** `src/shared/storico-errori.ts` toglie i segreti PRIMA di salvare:
   - gettoni con prefisso noto e JWT;
   - `password=`, `token:` e simili, anche in JSON e negli indirizzi;
   - percorsi `Users\<nome>`, email e IP (tranne 127.0.0.1);
   - il nome del PC e dell'utente, passati da chi chiama.

   Gli errori uguali a meno di numeri, ore e id diventano una voce con il conteggio. La chiave è posto + punto del codice + messaggio con le cifre ridotte a `#`.
4. **Pagina e app.** Non hanno uno storico loro: mandano il testo dei propri errori al PC accoppiato (`POST /api/errori/aggiungi`, `dove` pagina o app, massimo 20 per volta). Il PC li mette nel suo storico.
   - **Pagina:** dentro i gestori `error` e `unhandledrejection` di sempre, ogni 10 s.
   - **App:** dai crash presi da `Guasti`, in coda in `errori-da-mandare.json`, mandati all'avvio.
5. **La voce «Errori».** Sta in «Info e aiuto», su PC, pagina e app. Mostra lo storico del PC (`errori:storico` sul PC, `POST /api/errori` dal telefono), con «Copia» e «Manda al PC di sviluppo».
6. **L'invio.** Il PC di sviluppo si sceglie solo sul PC (preferenza `pcSviluppo`, l'id; nessun nome nel codice).
   - **Chi parte:** `mandaErrori` (`src/main/errori-arrivati.ts`) stringe lo storico a 180 KB: il server taglia i corpi oltre 256 KB *prima* della firma, e arriverebbero `undefined`.
   - **Come viaggia:** con `remoto.chiama(pc, '/api/errori/arrivati', …)`, firmato con la chiave di casa. Se il PC scelto è questo, si salva qui.
   - **Dal telefono:** `POST /api/errori/manda` chiede al suo PC di fare lo stesso. Il telefono non usa il ponte per questo.
7. **L'arrivo.** Scrive in `<cartella di SierraDeck>/.sierradeck/errori-arrivati/<mittente>/<ora UTC>.json`.
   - **Mai sovrascrive:** il file si scrive con `wx`, e due invii nello stesso secondo diventano `-2`, `-3`…
   - **La cartella di SierraDeck:** si cerca fra i progetti del registro di questo PC. È quella con `package.json` di nome `sierradeck`, mai una copia `….sierradeck-wt/…`.
   - **Git:** la cartella è in `.gitignore`.
   - **Segreti:** chi riceve li toglie di nuovo, perché chi manda può essere vecchio.

## Trappole

- **Il primo `unhandledrejection` della pagina** è controllato da un test (`client-pagina.test.ts`, il 401). Per questo gli errori si annotano dentro i gestori esistenti, senza aggiungerne altri prima.
- **Il codice della pagina** vive in un template TS: niente backtick né `${` nel JS che si aggiunge.
- **La voce «Errori» è in `VOCI`** con `dove: pc, app, pagina`. Ogni cambio riscrive `android/app/src/main/assets/impostazioni.json` (con `AGGIORNA=1 npx vitest run tests/shared/impostazioni-struttura.test.ts`).

8. **Dopo la correzione.** `arrivoCorretto(radice, file, versione)` sposta l'arrivo con `cancellaSicura` (modo recupero) in `errori-arrivati/.recupero/<mittente>/`. Restituisce la riga per il rapporto: «Errori arrivati da «X» il <data> (N) corretti nella versione Y: …».
   - **I 30 giorni:** `svuotaRecuperoArrivi` toglie quelli spostati da più di 30 giorni. L'ora è nel nome, la mette `cancellaSicura`.
   - **Cosa rifiuta:** file fuori dagli arrivi e file già nel recupero.

## Prova nella copia (20/10, fatta)
Copia con `SIERRADECK_PROVA`, porte 47680/47681, DevTools 9373. Gli script sono nello scratchpad della chat: `prepara.mjs`, `prova.mjs`, `cdp.mjs`, `recupero.ts`.
- **Il trucco per la cartella di SierraDeck:** un `progetti-drive.json` con un progetto che punta a una cartella con `package.json` di nome `sierradeck`. Deve stare FUORI da `….sierradeck-wt`, che è escluso: niente `note/` di un worktree.
- **Esiti:**
  - due errori finti dalla pagina, con token e Bearer, sono diventati una voce sola con «2 volte» e i segreti `‹tolto›`;
  - clic vero su «Manda al PC di sviluppo» con «(questo)» scelto: «Fatto: 2 errori…», file `2026-10-20_07-02-49.json` senza segreti;
  - `arrivoCorretto` lo ha spostato nel recupero; dopo 31 giorni (data finta) `svuotaRecuperoArrivi` lo toglie, oggi no.
- **Non provato dal vero:** l'invio firmato fra due PC (`/api/errori/arrivati` con la chiave di casa). È coperto dai test delle rotte. Servirebbero due copie accoppiate.
- **Trappola:** `Page.captureScreenshot` si blocca se la finestra della copia non è in primo piano, e con il PC al 100%. I clic con `Runtime.evaluate` vanno lo stesso.
- **Primo errore vero preso da solo:** `MaxListenersExceededWarning: 11 before-quit listeners`. In `src/main/index.ts` ci sono 11 `app.on('before-quit')`, già in main, non dello storico. Va bene, ma andrebbe ridotto o alzato il tetto: è da proporre.

## Ancora da fare
- **«Errori arrivati»:** l'autopilota che parte da solo, con il riepilogo a Nicholas prima di toccare il codice. Userà `arrivoCorretto` dopo la release.
