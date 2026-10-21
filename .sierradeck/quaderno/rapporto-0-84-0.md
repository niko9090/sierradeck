---
titolo: "Rapporto 0.84.0: blocchi, coordinazione, storico, agente finito, domande chiare. Pubblicata"
quando: 2026-10-21T20:25:00+02:00
tag: ["rapporto", "0.84.0", "rilascio", "autopilota", "domande"]
---

**Stato (21/10, 20:20): v0.84.0 PUBBLICATA da c-62, non installata.** Installa solo Nicholas.

- Tag `v0.84.0` sul commit `5c9f1761`: è main a `ea37ad7d` (con dentro c-56, c-57, c-58, c-59, c-60 e c-61) più il solo `chore(versione)`.
- Release «SierraDeck 0.84.0», non bozza, non pre-release, Latest. Ha 5 allegati, tutti «uploaded»:
  - `SierraDeck-Setup-0.84.0.exe` (115364274 byte), `.blockmap` e `latest.yml`, da `npm run pubblica` sulla bozza creata prima: una sola release, niente doppioni;
  - `SierraDeck-2.84.0.apk` e `app-android.json`, da `npm run allega-apk`. La firma è verificata: «CN=Nicholas Ferrari, O=Ferrari Consulenze, C=IT».
- **APK nuovo** (2.84.0, versionCode 140) perché `android/` è cambiato dalla v0.83.0: 6 file di c-61 per la domanda intera accanto alla risposta e c-58 per il tasto «Storico».
- Verificato con curl, con un parametro contro la cache:
  - `releases/latest/download/latest.yml` dice `version: 0.84.0`, con una size uguale a quella dell'exe su GitHub;
  - `app-android.json` dice 2.84.0 e punta all'APK della v0.84.0;
  - `releases/latest` dà `v0.84.0`.
- Novità: 6 righe in `src/shared/novita.ts`. Sono le stesse note della release e della notifica sul telefono.

## Controlli prima del tag (ramo c-62 = main `ea37ad7d`)

| Controllo | Esito |
|---|---|
| `npm run typecheck` | 0 errori |
| `tests/main` | 1870 passati, 2 saltati |
| servizio, renderer, condivisi e pty | 2961 passati |
| novità e note (dopo le righe nuove) | 9 passati |
| Android `gradle testDebugUnitTest assembleDebug` | BUILD SUCCESSFUL, 435 test Kotlin, 0 falliti |
| `npm run build` | ok |
| Guardia delle cancellazioni | ok |
| File Kotlin oltre 800 righe | nessuno |

## Cosa c'è dentro, punto per punto (lista dei lavori 3.1-3.6)

| # | Punto | Chi | Scheda |
|---|---|---|---|
| 3.1 | Blocchi: tre cause vere dai registri dei tre PC accesi, tutte corrette. Sono il guardiano che saltava tutta la flotta, il git sincrono che fermava il servizio e i doppioni del servizio a raffica. Prova di 32 minuti con 4 chat: 0 fermate non volute | c-56 | `blocchi-0-84-0.md` |
| 3.2 | Segnali delle chat (parto, fatto, bloccata, aspetto), quadro unico per il supervisore, nessun compito doppio | c-57 | `controllo-e-coordinazione-0-84-0.md` |
| 3.3 | Storico di ogni lavoro nel quaderno, tasto «Storico» su pagina e app | c-58 | `come-funziona-lo-storico-0-84-0.md` |
| 3.4 | Agente finito: chiusura da sola e conversazione nel recupero di 30 giorni | c-59 | `agente-finito-0-84-0.md` |
| 3.5 | Plugin ECC 2.2.3 su DESKTOP e LAPTOP con gli hook spenti; NB-PROBOOK è spento dal 20/10 | c-60 | `plugin-ecc-sui-pc-0-84-0.md` |
| 3.6 | Domande chiare, domande superate chiuse da sole, domanda intera accanto alla risposta | c-61 | `domande-chiare-0-84-0.md` |

## Cosa NON è nella 0.84.0 (onesto)

- **c-556, «le copie delle chat ricevono lo spegnimento degli hook ECC della cartella principale»** (`815acffd`, 21/10 alle 20:06). Era ancora sul suo ramo, non unito, quando ho messo il tag. Resta per la prossima patch, la 0.84.1, dopo la Revisione. Fino ad allora, su questo PC gli hook ECC restano accesi nelle copie delle chat: è la riga «Come spegnere gli hook» della lista.
- **Mostrare il segnale delle chat su pagina e app**: lo dice la riga 3.2 come «da fare». Il segnale c'è e il supervisore lo usa; manca solo in vista.
- **NB-PROBOOK**: niente plugin finché resta spento. La procedura è nella scheda del plugin.

## Rami delle chat di questo lavoro

| Ramo | Esito | Unione in main |
|---|---|---|
| c-56 | unito (blocchi) | `ea37ad7d` e prima |
| c-57 | unito (segnali e coordinazione) | `b33eacc9` |
| c-58 | unito (storico) | `20cee1a9` |
| c-59 | unito (agente finito) | `975d97a1` |
| c-60 | unito (plugin ECC, solo scheda) | `43a62f46` |
| c-61 | unito dopo la Revisione (7 punti corretti) | `c62d9056` |
| c-62 | questo: solo `chore(versione)` e rapporto, lo unisce il programma a fine turno | — |
| c-556 | **in corso**, non unito: va nella 0.84.1 | — |
| `rilascio/0.82.1` | chiuso senza unirlo: le stesse correzioni sono già in main (c-53); il ramo resta come fonte del tag v0.82.1 | — |

I rami di c-56…c-61 sono già tolti dal programma dopo l'unione. Le chat finite si chiudono da sole con l'agente finito della 0.84.0 solo dopo l'installazione. Fino ad allora le chiude il supervisore con `chiudiChat` (ramo già unito). Da una chat la chiusura è bloccata dal divieto dell'autopilota, giustamente.

## Da togliere a mano (fuori da git)

- La junction `node_modules` di questa copia è già tolta con `rmdir`. Mai `rm -rf` attraverso una junction: cancellerebbe la `node_modules` della cartella principale.
- La cartella `dist/` di questa copia, con l'installer 0.84.0 (circa 115 MB).
