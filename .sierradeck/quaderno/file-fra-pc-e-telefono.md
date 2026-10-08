---
titolo: "I file fra PC e telefono (0.54.0, app 2.54.0): sezione File, «📱 Manda al telefono», lo strumento manda_al_telefono delle chat"
quando: 2026-10-09T00:30:00+02:00
tag: ["file", "telefono", "ponte", "mcp", "sicurezza", "pin", "allegati", "prove-dal-vero"]
---

# La richiesta (Nicholas, 08/10)

«Permetti anche di inviare dal pc al cellulare i file e che se lo chiedo in
chat direttamente sierradeck me lo dà fare, anche perché tutta la parte file
qui sul cellulare non c'è come nel pc».

# I tre pezzi

## 1. La sezione File (app, e semplice nella pagina)

- **Regole pure:** `src/shared/file-telefono.ts`.
  - `relativoSicuro` rifiuta, senza ripulirli, risalite, assoluti, `:` (i flussi nascosti di NTFS), `CON`/`NUL` e i pezzi che finiscono con punto o spazio.
  - `radiceAmmessa`: mai la radice di un disco o di una condivisione di rete, mai la cartella dell'utente né una che la contiene. Se Claude Code è stato aperto in `C:\Users\…`, quella cartella **non** diventa un «progetto» (lì ci sono `.ssh` e le credenziali).
  - Tipo di anteprima e MIME, uguali in Kotlin (`FileVista`).
- **Disco:** `src/main/file-progetti.ts`.
  - Progetti = cartelle viste da Claude Code + chat aperte + autopiloti, solo quelle che esistono.
  - Ogni accesso fa `realpath` e controlla che il file stia ancora nel progetto: un collegamento o una giunzione che porta fuori dà 403.
  - Nell'elenco i collegamenti non compaiono, e `.git` è nascosta.
- **Rotte:** `POST /api/file/progetti|elenco|leggi`.
  - Si legge a pezzi da 96 KB in base64, come gli allegati: passa dal ponte e dal canale WebRTC.
- **PIN** (`progettoChiuso` in `client-rotte.ts`): un progetto con una chat protetta e chiusa per chi guarda risponde **423**.
  - Vale per le chat aperte e per quelle salvate nei workspace.
  - La risposta porta `chat` (l'id della chat aperta da sbloccare con `/api/pin/sblocca`); l'app e la pagina chiedono il PIN lì.
- **Carica:** riusa gli allegati della 0.50. `/api/allegati/inizia` con `{progetto, cartella}` invece di `chat`.
  - Il file va in `<progetto>/<cartella>/<nome>`, con `nome (2)` se esiste già.
  - Nessuna chat avvisata, niente `.gitignore` scritto.
- **App:** `SezioneFile.kt`, scheda «File» della barra in basso.
  - Si sceglie il PC: quello accoppiato, o un altro acceso attraverso il ponte.
  - Testo in monospazio con scorrimento nei due versi; immagini ridotte a misura di telefono; PDF con `PdfRenderer`.
  - Scarica va in `Download/SierraDeck` (MediaStore da Android 10; prima nella Download dell'app). Condividi passa dal FileProvider della cache.
- **Pagina:** Computer → File, nella stessa forma: Guarda, Scarica (un blob), Carica qui, PIN.

## 2. Dal PC al telefono

- **Coda:** `src/main/al-telefono.ts`.
  - Sta su disco: `<dati>/al-telefono/coda.json` più una **copia** del file per consegna (`<id>.bin`), con l'impronta. Se il file sul PC cambia, arriva quello mandato.
  - Una coda per telefono; la chiave è il visore: `tel:<id>` se accoppiato qui, `pc:tel:<id>@<PC>` se il telefono passa dal ponte di un altro PC.
  - Un telefono del ponte si fa conoscere chiamando `/api/consegne` (manda il suo nome). Da lì in poi compare fra i telefoni a cui quel PC può mandare.
- **Stati:** `conferma` → `attesa` → `viaggio` → `consegnata`; oppure `annullata`, `rifiutata`, `scaduta`.
  - Le consegne mai ritirate scadono dopo 14 giorni, una conferma senza risposta dopo un giorno.
  - Le consegne finite restano nell'elenco una settimana.
- **Limiti:** 100 MB per file, 30 in attesa e 1 GB per telefono. Le cartelle no.
- **Rotte del telefono:** `/api/consegne`, `/pezzo` e `/ricevuta`. Ognuno vede solo le sue: un altro PC o questo schermo ricevono 403.
  - `/ricevuta` vuole l'impronta giusta, altrimenti 422 e si ricomincia.
  - `/api/stato` porta `consegne: n`.
- **App:** `Consegne.kt`.
  - `Ronda.consuma` vede `consegne > 0` (app aperta o guardia in sottofondo) e lancia un lavoro WorkManager subito. C'è anche un periodico ogni 15 minuti, con la rete.
  - Il lavoro guarda il PC accoppiato e gli altri accesi dal ponte.
  - Scarica in `files/consegne-in-arrivo/` (la lunghezza della parte è la ripresa), controlla l'impronta, sposta in `files/ricevuti/`, dice «ricevuto» al PC e mostra la notifica «Hai ricevuto NOME da PC» con Apri, Salva e Condividi.
  - Salva è un `BroadcastReceiver` non esportato.
- **PC:** «📱 Manda al telefono» nel pannello dei file (colonna «Su questo computer») e nella linguetta File dell'autopilota, sul file aperto.
  - La finestra (`ModaleAlTelefono.tsx`) sceglie il telefono, mostra la coda con lo stato in parole e permette di annullare.

## 3. Dalla chat: lo strumento `manda_al_telefono`

- **Server MCP:** `src/main/mcp-telefono.ts`, HTTP su `127.0.0.1:<porta del Client>/api/mcp`.
  - Lo serve lo stesso server del Client, solo da loopback, come `/api/segnale`.
- **Registrazione** con `--mcp-config <json>` allo spawn (`buildClaudeArgs`), **solo per quella sessione**: la configurazione globale di Claude Code non si tocca.
  - `--mcp-config` prende più valori: subito dopo deve esserci un'opzione (`--append-system-prompt`), mai testo libero.
- **Gettone per sessione** nell'intestazione `Authorization: Bearer …`.
  - Su disco solo le impronte (`gettoni-mcp.json`): le chat sopravvivono a un riavvio del programma.
  - Un gettone nuovo per la stessa sessione toglie valore al vecchio.
  - Dal gettone il PC sa la chat e la sua cartella.
- **Regola:**
  - sotto la cartella della chat (dopo `realpath`) parte subito;
  - fuori, anche con `../`, va in `conferma`: una domanda nelle Domande (`id = al-telefono:<id>`, opzioni «Sì, mandalo» / «No, non mandarlo»), con lo strumento che aspetta la risposta fino a 2 minuti;
  - cartelle, file oltre 100 MB e telefono assente sono rifiutati con il motivo;
  - la chat riceve l'esito («In coda…», «Consegnato…», «Rifiutato: …»), e `stato_invio_al_telefono` lo ridice per i suoi invii, non per quelli di altre chat.
- **Le Domande:** `domande` in `index.ts` aggiunge quelle di conferma, e `rispondi` le riconosce dal prefisso.
  - `DomandaPerDomande` ha `da` e `sotto` per una domanda che non è di un autopilota.
- **Telefono:** il predefinito è quello che si è fatto vivo per ultimo.

# Prove dal vero (09/10)

Fatte con `claude.exe` 2.1.295, `CLAUDE_CONFIG_DIR` in `note/prova-tel/cfg` (cartella ignorata da git, tolta alla fine) e un programma di prova con il server, la coda e i gettoni veri.

| Prova | Esito |
|---|---|
| «mandami sul telefono il file relazione.md, con la nota …» | la chat ha usato `manda_al_telefono` da sola; il file è finito in coda, con la nota; la chat ha detto «in coda» con l'id |
| Un file fuori dalla cartella (`../altrove/fuori.txt`) | stato `conferma`, lo strumento ha aspettato; al «sì» è passato in coda e la chat ha ricevuto «In coda» |
| Lo stesso con «no» | «Rifiutato: Nicholas ha risposto no nelle Domande» |
| La cartella `immagini` | «Rifiutato: è una cartella…» con il consiglio dello .zip |
| Configurazione globale dopo le prove | nessun MCP aggiunto, nessun progetto aggiunto |

# Trappole

- **Claude Code 2.1.295** apre il server MCP HTTP in quest'ordine:
  - un `server/discover` (protocollo 2026-07-28): gli si risponde -32601 e lui passa a `initialize`;
  - `initialize`, con `protocolVersion: 2025-11-25`: gli si rimanda la sua;
  - un GET per il flusso SSE: 405.
- **Commenti nella pagina servita.** `client-pagina.ts` è un template literal: un \`backtick\` in un commento della pagina la spezza (TS1005).
- **Le barre rovesciate negli script.** Gli script Python scritti con un heredoc di Bash perdono le barre rovesciate: scriverli con Write.
- **Dove guardano le notifiche.** `BrowserWindow.getAllWindows()` è vietato nel main (`finestre-pannello-separate.test.ts`): per avvisare anche i pannelli staccati si usa `webContents.getAllWebContents()`.

# Non fatto, o da provare con Nicholas

- Prova dal vivo sul telefono vero:
  - sfogliare, guardare un PDF, scaricare, caricare;
  - un file mandato a telefono spento che arriva alla riaccensione;
  - la notifica con Salva, e un altro PC attraverso il ponte.
- Le chat governate dagli autopiloti in sottofondo (senza terminale) non hanno lo strumento: ce l'hanno le chat del mosaico, aperte con `pty:spawn`.
- La pagina non riceve i file dal PC: si ricevono con l'app.
