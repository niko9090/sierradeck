---
titolo: "Aggiornamento dell'app Android: tre fonti e la striscia chiudibile (0.17.0, app 2.26.0)"
quando: 2026-09-08T13:30:00+02:00
tag: ["android", "aggiornamenti", "github", "release", "procedura"]
---

# Il difetto (Nicholas, 2026-09-08)

«La ricerca di aggiornamento dà errore qui su apk. Poi l'aggiornamento
quando disponibile vorrei che uscisse la notifica chiudibile a schermo oltre
che la ricerca manuale nelle impostazioni.»

# Perché falliva (causa più probabile)

L'app chiedeva **solo** all'API di GitHub (`api.github.com/.../releases`):
60 richieste l'ora per indirizzo IP, e su rete mobile l'IP è condiviso con
migliaia di persone (CGNAT) → «GitHub ha risposto 403». Lo stesso controllo
all'avvio falliva in silenzio, quindi la finestra «C'è SierraDeck X» non
compariva mai.

# Com'è adesso

- `Aggiornamenti.cerca(mia, api)` (suspend): tre fonti in ordine, con le
  ragioni raccolte se falliscono tutte:
  1. il computer collegato: `GET /api/app` (senza chiave; il PC lo sa dal
     suo `apkDisponibile`, con memoria di 6 h);
  2. il file `https://github.com/niko9090/sierradeck/releases/latest/download/app-android.json`
     (`{ versione, apk }`): un allegato via CDN, senza limiti; segue il 302;
  3. l'API di GitHub (com'era).
  L'APK è accettato solo se sta sotto `releases/download/` del nostro repo,
  da qualunque fonte arrivi.
- **Striscia in alto** (`BandaAggiornamentoApp` in `AggiornamentoApp.kt`,
  montata in `App.kt` sotto `BandaUrgenze`): «C'è SierraDeck X per il
  telefono», tasto «Aggiorna» (apre `DialogoAggiornamentoApp` con
  scaricamento e installazione) e croce. Chiusa → `Collegamento.aggiornamentoIgnorato`
  = quella versione, non torna finché non ne esce una più nuova. Ricerca
  all'apertura e ogni 6 h. La finestra all'avvio in `MainActivity` è stata
  tolta.
- «Cerca ora» nella scheda Computer usa la stessa ricerca e in caso di
  errore mostra le ragioni di tutte e tre le fonti.
- Lato PC `apk-disponibile.ts`: prima il file `app-android.json` (con
  `scarica()` che segue i rimandi), poi l'API.

# PROCEDURA DI RELEASE (aggiornata)

In ogni release, oltre all'APK, va allegato `app-android.json`:

    node scripts/app-android-json.mjs <scratch>/app-android.json
    gh release create vX.Y.Z --title "vX.Y.Z" --notes-file note.md SierraDeck-<app>.apk <scratch>/app-android.json

Lo script legge `versionName` da `android/app/build.gradle.kts` e il tag da
`package.json`: bumpare PRIMA di generarlo. Senza il file, il telefono
ripiega sul computer e poi sull'API (funziona lo stesso, ma con il limite).
