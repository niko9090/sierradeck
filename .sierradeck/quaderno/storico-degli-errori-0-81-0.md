---
titolo: "Storico degli errori e invio al PC di sviluppo (0.81.0)"
quando: 2026-10-20T07:30:00.000Z
tag: ["errori", "0.81.0", "ponte", "impostazioni"]
---

Chiesto da Nicholas il 19/10. Punti 1–3 sul ramo `ap/ap-f1e631f5/c-3`. Il 20/10 c-14 lo ha unito al suo ramo `ap/ap-f1e631f5/c-14` e ha aggiunto «Errori arrivati» (punti 4–7).

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

## «Errori arrivati»: il lavoro che parte da solo

Il codice sta in `src/main/errori-arrivati-lavoro.ts`. Il giro gira nel main ogni 2 minuti e subito dopo ogni arrivo.

1. **Quiete.** Un arrivo aspetta 5 minuti senza altri arrivi (`QUIETE_MS`). Quelli vicini finiscono in un solo lavoro, e quindi in una sola release.
2. **Quando non parte.** Se la settimana del piano è oltre l'80% (`limitiAggiornati(...).settimana.percento`), o se un autopilota in `intervista/pronto/lavoro/attesa` lavora su SierraDeck: nella cartella, sotto di lei o in `….sierradeck-wt`.
   - **Cosa scrive:** «Errori arrivati: li correggo appena finisce X», una volta, nel registro e nella voce «Errori» di PC, pagina e app (campo `arrivi`).
   - **Poi:** riparte da solo al giro dopo.
   - **Fermi e archiviati non contano:** un autopilota sospeso per giorni bloccherebbe tutto.
   - **Limiti non letti:** si parte lo stesso, e lo dice il registro.
3. **L'avvio.** Un autopilota «Errori arrivati» con criteri (quindi niente intervista: parte subito) nel workspace del progetto (`workspaceDellAutopilota('', radice)`), aggiunto se manca, senza cambiare lo schermo.
   - **L'obiettivo:** elenca i file e i passi: riepilogo, correzione con test e Revisione, una release (bozza, poi `--draft=false`, mai installata), «errore X corretto nella versione Y» in `.sierradeck/quaderno/errori-arrivati.md`.
4. **Il riepilogo.** La chat lo scrive in `errori-arrivati/riepilogo-<ea-id>.md`. Il giro lo trova e chiama `POST /autopiloti/:id/annuncio` sul servizio.
   - **Nella conversazione:** il testo entra nel dialogo come battuta «lui», con `traccia: true`, così il supervisore non la elabora.
   - **La notifica:** l'autopilota prende `annuncio: {id, titolo, quando}`. Il PC manda una notifica Electron. Pagina (`avvisati['n-'+id]`) e app (`n:<id>` in `Avvisi.kt`) ne mandano una per id.
5. **Lavoro finito.** I suoi file e il riepilogo vanno con `cancellaSicura` (modo recupero) in `errori-arrivati/.recupero/<mittente>/<file>.<ISO>`.
   - **I 30 giorni:** si contano dall'ora nel nome (`rename` tiene la data dell'arrivo). Poi `svuotaRecuperoScaduto` li toglie.
   - **Fallito o sparito:** i file restano e il lavoro non riparte da solo.
6. **Lo stato.** In `errori-arrivati/.lavori.json`: chi è stato preso da quale lavoro. La cartella è fuori da git e non sporca la cartella principale, dove si uniscono i rami.

**Trappola:** il criterio «riepilogo scritto» non può provare l'ordine (riepilogo PRIMA del codice). Lo dice l'obiettivo, e il giro lo manda appena c'è.

## Ancora da fare

- **Prova nella copia di prova** (SIERRADECK_PROVA): un errore finto, l'invio, l'arrivo, l'avvio, il riepilogo, il recupero. Senza pubblicare release vere.
