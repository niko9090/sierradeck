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

# Limiti noti

- Gli sblocchi dagli altri PC sono condivisi fra tutti gli altri PC e il ponte
  (visore `pc`): il server riceve solo «un PC con la chiave di casa».
- La **cassetta della posta** («Azioni» verso un altro PC) e i messaggi via
  Drive consegnano ancora il testo a una chat protetta: sono lavoro differito,
  come le istruzioni degli autopiloti.
- Chat appena aperta senza uuid di sessione: protetta solo se il suo workspace lo è.
- Prova dal vivo da fare con Nicholas (PC + telefono + altro PC).
