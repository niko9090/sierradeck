---
titolo: "Drive scollegato dal 23/09 e altri PC «spenti»: banda fissa, scoperta diretta, chat remota evidente (0.39.3)"
quando: 2026-10-02T15:00:00+02:00
tag: ["drive", "oauth", "multi-pc", "remoto", "tailscale", "telefono", "android", "decisione-nicholas"]
---

# La segnalazione (Nicholas, 02/10)

Con i PC tutti accesi, una chat aperta sull'altro PC dà errori e non si può scrivere. In più non si capisce quando una chat è remota.

# La causa, sui dati veri

- **Il Drive.** Il 23/09 alle 10:51:47 UTC il registro di questo PC (`%APPDATA%/SierraDeck/log/sierradeck-2026-09-23.log`) scrive il messaggio di `invalid_grant`: «Google non riconosce più l'autorizzazione…».
  - `creaFornitoreToken` scarta il token, come previsto: da lì «manca l'autorizzazione», e a ogni avvio «Drive configurato: true, connesso: false».
  - Lo stesso giorno è successo anche sul portatile.
- **È Google, non un nostro difetto di scrittura**: il token è stato rifiutato al rinnovo.
  - L'app OAuth è pubblicata dal 04/09, quindi non è la scadenza dei 7 giorni della modalità «test». A meno che il collegamento non fosse stato fatto prima: i token nati in prova restano a scadenza.
  - Le altre cause possibili sono la revoca dall'account Google e il cambio della password.
  - Da qui non si distingue: va guardato in Google Cloud / nell'account. La banda dice esattamente questo.
- **Il nostro difetto**: dopo lo scarto **non restava scritto niente**. Dal riavvio solo «connesso: false», nessuna banda, per 9 giorni.
- **Gli altri PC «spenti».** I battiti passano solo dal Drive. In `pc-altrui.json` il battito del LAPTOP è fermo al 23/09 alle 03:34.
  - `pc-remoto.ts` lanciava `spento` appena il battito era vecchio, **senza bussare**.
  - Il portatile invece rispondeva subito: su `192.168.1.177` (rete locale) e su `100.117.177.78`, Tailscale.
  - Il battito diceva ancora `100.72.165.79`, un indirizzo Tailscale **cambiato**.

# Cosa è cambiato

- **Il momento dello scollegamento resta scritto**: `drive-scollegato.json` in userData, scritto da `conto-drive.ts`.
  - `revocata` sull'`invalid_grant`; `a-mano` su «Scollega».
  - Si toglie quando si ricollega.
  - Per i PC scollegati prima della 0.39.3 lo si ricava una volta dal registro (`scollegamentoDalRegistro`, la prima riga che lo dice).
- **La banda fissa**: `avvisoDriveScollegato` in `src/shared/scoperta-pc.ts`.
  - PC: in cima, con «Apri Account → Drive → Collega», che apre Impostazioni sulla scheda Account.
  - `/api/stato` → `driveScollegato`: la pagina (in cima ad «Adesso» e alle chat) e l'app (`BandaDriveScollegato`).
  - Non si chiude finché il Drive resta scollegato.
- **La scoperta diretta** (`pc-remoto.ts` + `scoperta-pc.ts`):
  - `bussa` prova **tutti insieme**, per un secondo e mezzo, gli indirizzi di `indirizziDaProvare`:
    1. quello buono;
    2. quelli ricordati in `pc-indirizzi.json`, che hanno risposto in passato;
    3. quelli Tailscale di **adesso** per il nome del PC (`tailscale status --json`, in `src/main/tailscale.ts`, con un minuto di memoria);
    4. quelli del battito.
  - Senza link-local.
  - Fa una GET `/api/pc` con la chiave di casa, una rotta nuova e leggera dietro la chiave. Un 404 con la chiave accettata (versione vecchia) conta come acceso; 401 vuol dire chiave, 403 vuol dire rete.
  - `chiama` bussa prima, se non ha un indirizzo buono. Se l'indirizzo buono cade, ribussa: le GET si ripetono, le scritture no (si dice che non si sa se il testo è arrivato).
- **`decidiApertura`** ha `rispondono` e `statiPc`. `chat:daDove` è asincrono: con un'apertura `attesa` bussa e decide di nuovo. Se il PC risponde diventa `remoto`.
- **Mai «spento»**: `statoPc` dà `acceso`, `non-so` (battito vecchio, nessuna risposta), `irraggiungibile` (battito fresco, nessuna risposta), `chiave`, `rifiutato` o `senza-indirizzi`, ognuno con «cosa fare».
  - `descriviSilenzio('spento')` ora dice «Non so se X è acceso».
  - Il riquadro d'attesa (`Terminal.tsx`) usa il titolo e il «cosa fare» del Core.
- **Errori remoti con il motivo vero**: `motivoDaStatoHttp` e `messaggioErroreRemoto` (chat chiusa là, chiave, rete, cassaforte).
- **Chat remota evidente**:
  - `.riquadro--remoto`: bordo e testata viola (`--remoto: #a77bf3`), più «SU <PC>» nella testata;
  - la riga «Stai scrivendo su …» sopra la casella;
  - «SU <PC>» in Riprendi (`ModaleSessioni`), nel menu dei workspace (`remotePerWorkspace`, IPC `workspace:remote`), nelle Domande (`suPc` sulla conversazione), nei Consumi (una riga «N chat sono su altri PC»), nella pagina e nell'app (`titoloConSegno`).
- `AUTORIZZAZIONE_REVOCATA` non dice più «ogni 7 giorni in modalità test»: l'app è pubblicata.

# Da fare con Nicholas (prova dal vivo)

1. Su ogni PC: Account → Drive → **Collega**, con lo stesso account di prima. Ogni PC tiene il suo account Google: è una decisione di Nicholas del 04/09.
2. Aprire una chat del portatile dal PC fisso: deve aprirsi dal vivo, viola, «SU LAPTOP-E60QM2D1».
3. Se torna `invalid_grant` dopo pochi giorni: controllare in Google Cloud Console che l'app OAuth sia «In production» e non «Testing».

# Test

- `tests/shared/scoperta-pc.test.ts` (dati veri del 02/10):
  - indirizzi, Tailscale per nome, mai «spento»;
  - `decidiApertura` con il bussare;
  - motivi degli errori;
  - registro del 23/09 e banda.
- `tests/main/pc-remoto-scoperta.test.ts`: il client con un fetch finto. Il vecchio Tailscale è muto, il nuovo risponde: si va dal vivo. Poi 401, 404 della chat chiusa, versione senza `/api/pc`.
- Kotlin: `DriveScollegatoTest`.

# Aggiornamento 0.56.3

La «banda fissa che non si chiude» non c'è più: dopo il 401 del 09/10 l'avviso è una riga chiudibile, solo per `revocata`. Vedi `drive-401-rinnovo-e-avviso-0-56-3.md`.
