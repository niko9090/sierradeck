---
titolo: "Mandato 3 per l'autopilota: tutto quello che resta aperto dopo la 0.27.0 (2026-09-16)"
quando: 2026-09-16T15:10:00+02:00
tag: ["autopilota", "mandato", "controllo", "drive", "telefono", "aggiornamenti"]
---

# Come si usa questo mandato

Va eseguito da un **autopilota di SierraDeck sul fisso** (è l'unico PC con
la catena di build: Visual Studio Build Tools per `better-sqlite3`, Android
SDK, certificato di firma). Sul portatile `npm ci` fallisce su
`better-sqlite3` («could not find a version of Visual Studio 2017 or
newer»): lì il repo si legge e basta.

Nicholas lo avvia dalla scheda Autopiloti (SierraDeck ≥ 0.27.0, che apre
sempre una chat nuova sua) con questo obiettivo:

> Esegui per intero il mandato scritto in
> `.sierradeck/quaderno/mandato-controllo-completo-3-2026-09-16.md`.

e poi gli parla dalla scheda («Parla con lui»), non dalla chat. Le regole di
lavoro sono quelle del mandato 1 (`mandato-controllo-completo-2026-09-13.md`,
sezione «Regole di lavoro») con una differenza: **pubblicare è permesso**
(Nicholas, 14/09: «pubblica tutto senza chiedere»), seguendo
`pubblicare-una-release.md`.

# Da dove si parte

- Rapporto 1 (`rapporto-autopilota-2026-09-13.md`) e rapporto 2
  (`rapporto-autopilota-2-2026-09-14.md`): leggili tutti e due prima.
- Stato al 16/09: `main` = `18f87e8`, release `v0.27.0` pubblicata il 15/09
  (installer 0.27.0, app Android 2.30.1). Il portatile girava ancora sulla
  0.26.0 (l'aggiornamento si installa alla chiusura).

# Cosa deve fare (tutto, nell'ordine)

## A. I 18 difetti «trovati e non corretti» del rapporto 2, sezione 4

Correggi tutti quelli che non richiedono una scelta di prodotto. Per i punti
1-5 (updater C# che uccide SierraDeck dopo 5 s; gemelli della stessa chat
sul Drive; lapide per «Togli la cartella dal Drive»; sessioni observer di
claude-mem già sul Drive; MCP nel negozio) **chiedi a Nicholas** con una
domanda dell'autopilota, una alla volta, proponendo la soluzione che
faresti tu e il suo costo; nel frattempo vai avanti con il resto. Se non
risponde entro il turno, applica la proposta indicata come «predefinita»
nel rapporto 2 e segnalo nel rapporto.

## B. Le sei verifiche «non provate» del rapporto 2, sezione 6

Provale davvero, una per una, e scrivi cosa hai visto: (1) NSIS riavvia da
solo l'app dopo un'installazione silenziosa? (2) electron-updater riprende
un download parziale? (3) i terminali di preparazione entrano in
`chatAperte`? (4) ordine TMP/TEMP di `Path.GetTempPath()`; (5) i nipoti
sopravvivono alla chiusura dell'host? (6) una `cwd` con maiuscole diverse
fa mancare `trascrizioneEsiste` allo spawn?

## C. L'arrivo che gira a vuoto (visto nel registro del portatile, 0.26.0)

Ogni 5 minuti: «ARRIVO: 31 chat da portare qui … ARRIVO ok: 0 chat
scritte, 22 tenute (più lunghe qui)». Cioè 20-30 blob scaricati dal Drive a
ogni giro per poi tenere il locale. Verifica se con la 0.27.0
(`altroveQui(p, sizeDrive)`) succede ancora; se sì, la scelta dei candidati
in `sincronia.arrivo()` deve escludere PRIMA di scaricare le chat che qui
sono già più lunghe o «tenute» al giro precedente (memoria nel manifesto
locale o nello stato). Test dedicato.

## D. Prove dal vivo (rapporto 2, sezione 5, punti 3-4-7)

Dialogo con l'autopilota («dove sei?», «fermati», «riprendi») con un
supervisore vero; la chat nuova che nasce senza «rinascita» di una chat
aperta; il telefono con la 2.30.1 (pagina e app): elenco chat, ripresa di
una chat «su X», Drive, posta. Scrivi cosa funziona e cosa no, con i testi
esatti che si vedono.

## E. Controllo completo dopo la 0.27.0

Ripassa le undici aree del rapporto 2 sezione 3 sul codice di oggi, con la
stessa regola: leggi, non fidarti dei commenti, verifica il percorso intero.
In più: `src/main/progetti/posta.ts` e le rotte `/api/pc`, `/api/posta*`
(nuove del 14/09), `ec54fc1` (le chat di un altro PC: «Questa chat lavora su
X», `pianificaRitorno`, `spostaSidecar`) e `d3ea5af` (app Android allineata).
Correggi quello che è senza rischio, descrivi il resto.

## F. Alla fine

1. Typecheck a 0, suite verde (il criterio legge `Tests N passed` dal
   reporter in chiaro `tests/riepilogo-semplice.ts`).
2. Novità in `src/shared/novita.ts` (0.27.1 se solo correzioni, 0.28.0 se
   c'è una funzione nuova; major mai), bump di `package.json`; se `android/`
   è cambiato ricompila l'APK e bumpa `versionCode`/`versionName`, altrimenti
   riallega l'ultimo APK (2.30.1) — regola in `feedback-apk-in-ogni-release`.
3. Pubblica seguendo `pubblicare-una-release.md`; verifica
   `releases/latest`, `latest.yml`, `app-android.json` come lì descritto.
4. Rapporto in `.sierradeck/quaderno/rapporto-autopilota-3-<data>.md` con le
   sei sezioni dei rapporti precedenti, più «Cosa ho chiesto a Nicholas e
   cosa ha risposto». Commit, push.

# Criteri di fine (per la scheda dell'autopilota)

- `npm run -s typecheck` esce con 0.
- `npx vitest run > "$TEMP/vt.txt" 2>&1; grep -qE '^ *Tests .*passed' "$TEMP/vt.txt" && ! grep -qE '^ *Tests .*failed' "$TEMP/vt.txt"`.
- Esiste `.sierradeck/quaderno/rapporto-autopilota-3-*.md` con le sezioni
  «Cosa ho trovato», «Cosa ho cambiato», «Cosa deve fare Nicholas».
- `git status --porcelain` vuoto e `git log origin/main..main` vuoto (tutto
  pushato).
- `gh api repos/niko9090/sierradeck/releases/latest --jq .tag_name` è la
  versione nuova di `package.json`.

# Aggiunte del 18/09 (dopo la 0.29.0)

Nessuno ha ancora preso in carico questo mandato (nessun rapporto 3, nessun
autopilota). Nel frattempo sono uscite 0.27.1, 0.28.0-0.28.3 e 0.29.0. Da
fare in più, sul fisso, prima di tutto il resto:

- **L'APK 2.31.0 non esiste.** Il repo dice `versionName 2.31.0`
  (`versionCode 66`) e le novità 0.29.0 promettono «la sezione
  dell'autopilota come sul PC» anche nell'app, ma la release `v0.29.0` ha
  allegato `SierraDeck-2.30.2.apk` e `app-android.json` dice 2.30.2: la
  0.29.0 è stata pubblicata dal portatile, dove la chiave di firma non c'è
  (`build-sul-portatile.md`). Sul fisso: compilare l'APK 2.31.0, allegarlo a
  `v0.29.0` (`gh release upload v0.29.0 … --clobber`), rigenerare
  `app-android.json` e ricaricarlo, verificare `releases/latest/download/app-android.json`.
- **Verificare la firma dell'installer 0.29.0** (stessa causa): se
  `SierraDeck-Setup-0.29.0.exe` non è firmato, SmartScreen lo blocca sul
  fisso; in quel caso ricostruirlo lì e ricaricarlo con `--clobber`.
- Rileggere `rimbalzo-chat-fra-pc.md`, `documenti-spostata-su-altro-disco.md`
  e `proposta-chat-in-un-posto-solo.md`: la proposta «una chat, una casa» è
  una scelta di prodotto di Nicholas, non del mandato; se decide di farla,
  i punti C ed E cambiano di conseguenza.

# Aggiunta del 18/09, sera: la guardia sulle chat aperte altrove

Nicholas: «doveva essere già così che una chat non può scrivere se c'è già
una chat attiva uguale». Oggi la guardia esiste solo per i progetti sul
Drive (testimone). Da fare, come punto 1 di `stessa-chat-su-due-pc.md`:
all'apertura di una chat, se il battito `pc-<id>` di un altro PC vivo la
elenca fra le sue chat aperte, il riquadro dice «aperta su X da HH:MM» e
non parte, con «Scrivile là» (posta) e «Aprila qui lo stesso»; la stessa
regola dal telefono (409 spiegato). E il punto 2: nel conflitto sul
prefisso `chat` non si perde mai una copia (la perdente diventa una
conversazione a parte «… (da X)»). Test per tutte e due. Precedenza alta:
va prima del punto A.

Nota di stato: il portatile LAPTOP-E60QM2D1 ha il Drive **non connesso** dal
16/09 («Drive configurato: true, connesso: false» a ogni avvio): non riceve
né manda niente dal 15/09 14:33. Va ricollegato da Account → Google Drive.
