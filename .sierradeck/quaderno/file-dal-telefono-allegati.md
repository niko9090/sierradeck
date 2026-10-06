---
titolo: "I file dal telefono a una chat o a un autopilota (0.50.0, app 2.50.0): come viaggiano, dove finiscono, cosa si rifiuta"
quando: 2026-10-06T13:10:00+02:00
tag: ["allegati", "telefono", "ponte", "sicurezza", "pin"]
---

# Richiesta di Nicholas (06/10)

Condividere file DAL TELEFONO a una chat o a un autopilota, **dentro il
progetto di quella chat** (non in una cartella generica del PC). Da non
confondere con la vecchia «cartella di scambio» (`scambio-file.ts`), che è
una cartella sola nei dati del programma.

# Come è fatto

- **Regole pure**: `src/shared/allegati.ts` (nome ripulito, tipi vietati,
  100 MB, percorso con nome unico, pezzi e ripresa, destinazione, 20 file al
  minuto per mittente, righe di avviso). Copia in Kotlin: `Allegati.kt` (un
  test controlla che limiti e tipi vietati siano gli stessi).
- **Disco**: `src/main/allegati.ts`. Un invio vive in
  `<dati>/allegati-in-arrivo/<id>.json` + `<id>.part`: la **grandezza del
  .part è la verità** su quanto è arrivato (regge cadute di rete e riavvii;
  gli invii a metà si buttano dopo 24 h). Solo a file intero (e impronta
  SHA-256 giusta, se mandata) va in
  `<cwd>/.sierradeck/allegati/AAAA-MM-GG/<nome>` — `nome (2).ext` se c'è già.
  Il `.gitignore` con `*` si scrive solo se manca: se il progetto lo cambia,
  resta suo. Il file prende `Zone.Identifier` (ZoneId=3): Windows avvisa prima
  di eseguirlo. SierraDeck non lo apre mai.
- **Rotte** (`client-rotte.ts`): `POST /api/allegati/inizia|pezzo|stato|fine|annulla`.
  L'id dell'invio lo sceglie chi manda: rimandare `inizia` con lo stesso id
  riprende (non conta per il limite). Un pezzo già ricevuto si conferma senza
  riscriverlo; uno fuori posto → 409 con `ricevuti`. Pezzi da **96 KB**
  (128 KB in base64): stanno sotto il tetto di 256 KB del corpo JSON anche
  impacchettati dal ponte, e in un messaggio WebRTC cifrato.
- **Dopo**: chat → `scriviAChat` con «Nicholas ti ha mandato il file NOME
  (percorso relativo). Nota: …. Guardalo.» (nota su una riga sola: un a capo
  nel terminale manderebbe il messaggio a metà); autopilota →
  `dialogaAutopilota` con il percorso intero.
- **Altri PC**: il telefono usa il ponte (`ROTTE_PONTE`) e il PC accoppiato
  gira ogni pezzo con le strade e le firme di casa (`ROTTE_VIA_CANALE` per
  WebRTC). La cassetta sul Drive **no** (`nonViaDrive`: «mandare un file»).
- **Telefono**: intent-filter `SEND`/`SEND_MULTIPLE` `*/*` →
  `Apertura.condivisi` → `SchermoMandaA` (MandaA.kt); «📎» nella chat e
  «📎 Allega» nell'autopilota con `GetMultipleContents`. Solo `content://` di
  **altre** app (`Condivisione.ammessa`): un `file://` o un content di
  SierraDeck potrebbe indicare le chiavi private dell'app. Recenti in
  `sierradeck-allegati` (chiave = pc|tipo|sessione, non l'id del riquadro).
- **Pagina**: «📎» accanto a Invia e «📎 Allega» nell'autopilota; la nota è
  quello che c'è nella casella. Input file nascosto, attaccato al body al
  primo uso (la pagina si ridisegna e un input dentro perderebbe la scelta).

# Sicurezza (con i test di rifiuto in `tests/main/allegati.test.ts`)

- Il muro è quello di sempre: dispositivo accoppiato o PC con la firma di casa
  (anche dal ponte). Chiave sbagliata o di un'altra cassaforte → 401.
- Nome con un percorso (`../`, `\`, `C:`) → 400, **rifiutato**, non ripulito.
- Oltre 100 MB → 413; programmi eseguibili con un doppio clic (`.exe`,
  `.bat`, `.lnk`…) → 415 (si mettono in uno .zip); 21° file in un minuto → 429.
- Un invio lo continua solo chi l'ha cominciato (403).
- PIN: `inizia` e `fine` controllano la chat per **chi manda** (423 «Chat
  protetta: inserisci il PIN»); dal ponte chi manda è il telefono, non il PC
  accoppiato. L'app chiede il PIN lì e rimanda.

# Limiti noti

- L'invio vive finché l'app è aperta: se Android la chiude, «Riprova» (stesso
  id) riparte da dove era solo nella stessa schermata; da capo altrimenti.
- La pagina servita non vede le chat degli altri PC (non ha il ponte): da lì
  solo le chat e gli autopiloti del PC a cui è collegata.
- Le chat appena aperte senza cartella non ricevono file (409).
- Prova dal vivo da fare con Nicholas (telefono → PC accoppiato → altro PC).
