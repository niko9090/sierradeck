---
titolo: "Il PIN delle chat (0.49.0, app 2.49.0): come funziona, dove si controlla, cosa non protegge"
quando: 2026-10-02T22:00:00+02:00
tag: ["pin", "sicurezza", "chat", "telefono", "pc-remoto"]
---

# Richiesta di Nicholas (02/10)

«aggiungi anche la possibilità di mettere un pin alle chat prima di poterle
aprire (facoltativo ovviamente ed attivabile dalle impostazioni)».

# Come è fatto

- **Regole pure**: `src/shared/pin-chat.ts` (formato del PIN, chi è protetto,
  sblocchi con scadenza per inattività, attese 30 s × 2ⁿ dopo 3 errori fino a
  1 h, `oscuraChat` per le anteprime, 423 come rifiuto).
- **Impronta**: `src/main/pin-impronta.ts` (scrypt N=16384, sale 16 byte,
  `timingSafeEqual`). Sul disco `pin-chat.json` nella cartella dati: solo
  l'impronta, le chat protette (per **uuid della sessione**) e i workspace.
- **Guardiano**: `src/main/pin-guardiano.ts`, uno per PC. Sblocchi in memoria
  per **visore** (`locale` = questo schermo, `tel:<id>` = un telefono,
  `pc` = gli altri PC e il ponte, `drive` = lo schermo scritto sul Drive, che
  non si sblocca mai). Un solo contatore di tentativi per tutte le strade.
  Azzeramento con `sincronia.verificaPassphrase` (nuova: non sblocca niente).
- **Rotte** (`client-rotte.ts`): `/api/storia`, `/api/dentro`, `/api/scrivi`,
  `/api/scegli`, `/api/chat/chiudi`, `/api/chat/nome` → 423 se chiusa per chi
  chiede; `/api/stato` e `/api/domande` vedono le chat chiuse senza `ultimaRiga`,
  `coda`, scelte (marcate `pin: 'chiusa'`); istruzioni degli autopiloti senza
  testo. `/api/pin/sblocca {chat, pin}` → 200 / 403 / 429 (con `fraMs`).
  Passa anche da WebRTC (`ROTTE_VIA_CANALE`) e dal ponte (`ROTTE_PONTE`).
- **Inattività** = nessun gesto: sul PC tasti/clic nel riquadro (`pin:tocca`),
  da remoto scrivi/scegli. Guardare soltanto non tiene aperta la chat.
- **Schermo del PC**: `ChatConPin.tsx` (copertura + `inert` sul terminale, che
  resta acceso), tasto 🔐 in testata (clic o tasto destro), tasto destro sui
  workspace in `Console.tsx`, `SezionePin.tsx` nelle Impostazioni. Riquadro di
  un altro PC: 423 → motivo `pin` → lucchetto, verifica là (`remoto:pin`).
- **Telefono**: pagina (`pinDentro`, `sbloccaPin`), app (`PinChat.kt`,
  `CoperturaPinApp`, `Chat.pin`).

# Cosa NON protegge (scritto anche nel pannello)

- I file `.jsonl` delle conversazioni sul disco e tutto ciò che l'account di
  Windows legge: il PIN è una serratura sulla vista, non cifra niente.
- Con 4 cifre l'impronta da sola si forza in fretta da chi ha il file: il freno
  vero sono le attese crescenti, che valgono solo passando dal programma.

# 0.49.1: chiusi i due limiti della 0.49.0

- **Sblocco per chi guarda, anche fra PC.** Chi chiede viaggia nel **numero a
  caso della firma di casa** (`<a caso>~<base64url(visore)>`, `casa-firma.ts`
  `nonceConVisore` / `visoreDaFirma`): è già sotto HMAC, quindi non si cambia
  per strada, e i PC 0.47–0.49 accettano la firma come prima. Visore = `<id PC>`,
  o `tel:<dispositivo>@<id PC>` dal ponte. Sul server diventa il dispositivo
  `pc:<visore>`; sul WebRTC va nel messaggio sigillato (`visore`, o il PC del
  canale). Un PC vecchio arriva come `pc` (anonimo): il PIN giusto **non** lascia
  uno sblocco (`visoreAnonimo`), quindi da lui la chat resta chiusa.
  Usare `daAltroPc()` per riconoscere un altro PC, mai `=== 'pc'`.
- **Ogni input umano passa dal PIN.** Le voci della cassetta hanno `origine`
  (`umano` predefinito, `autopilota`) e `daVisore`; l'etichetta è autenticata
  dalla cifratura AES-GCM della cassaforte. Alla consegna il postino chiede
  `chiusaPer(chat, voce)` con il visore `pc:<daVisore>`: se chiusa →
  `fallita` con `ESITO_PROTETTA` («Chat protetta: inserisci il PIN…»).
  Dalle Domande: 423 → campo PIN lì (`/api/pin/sblocca`, anche per le chat di
  un altro PC con `pinAltroPc`) e rimanda.

# Limiti noti

- Chat appena aperta senza uuid di sessione: protetta solo se il suo workspace lo è.
- Dall'app e dalla pagina del telefono la scheda Domande mostra «Chat protetta:
  inserisci il PIN» e il PIN si mette aprendo la chat (non c'è un campo nelle Domande).
- Prova dal vivo da fare con Nicholas (PC + telefono + altro PC).
