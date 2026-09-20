---
titolo: "App Android 2.31.0: perché le notifiche non arrivavano e perché la chat si leggeva male"
quando: 2026-09-20T18:30:00+02:00
tag: ["android", "notifiche", "ansi", "terminale", "app"]
---

Nicholas (20/09): «La app su cellulare non sta funzionando bene tra
notifiche e visualizzazione della chat con caratteri che si vedono male».
Mappa fatta sul codice (nessuno screenshot): le cause stavano entrambe
nell'app, non nella rete né nel PC.

## Notifiche

- **Causa principale**: `Ronda.primoGiro` viveva in memoria. La sveglia
  (`Sentinella`, ogni 2 min) trova quasi sempre il processo **ucciso** da
  Android nel frattempo; al risveglio `primoGiro = true` → `Avvisi.daAnnunciare`
  marcava «aspetta te», «ha finito», «si è fermato» come già visti e **non
  notificava niente** (solo le domande, che ignorano `primoGiro`). Cioè ad
  app chiusa le notifiche non arrivavano quasi mai. Ora `gia` e il flag
  «avviata» stanno in `SharedPreferences("ronda")`; `Ronda.azzera()` per un
  nuovo accoppiamento.
- Ad app **aperta** il polso di 2 s (`App.kt`) non passava dalla guardia:
  l'avviso arrivava alla sveglia dopo, minuti dopo o mai. Ora
  `api.statoConTesto()` dà anche il JSON grezzo e `Ronda.consuma()` lo
  legge (sincronizzato, stesso `gia`).
- Icona piccola: `android.R.drawable.ic_dialog_info` (bitmap colorata) →
  quadrato bianco. Ora `res/drawable/ic_notifica.xml` (vettoriale
  monocromo) + `setColor`.
- `PendingIntent` con `requestCode 0` per tutti gli avvisi → riusato;
  ora `a.id` e gli extra `chat`/`domanda` (la navigazione mirata all'apertura
  NON è ancora fatta: l'app si apre e basta).
- Scheda Computer → Avvisi dice se Android ha le notifiche spente
  (`areNotificationsEnabled`) e se limita l'app in sottofondo
  (`isIgnoringBatteryOptimizations`), con i tasti alle schermate di sistema.
  Il permesso `POST_NOTIFICATIONS` negato una volta non viene più richiesto
  da Android: la strada è quella schermata.
- `GuardiaService.attiva` ora `@Volatile`.
- Lato PC (0.28.4): `aspetta` verso il telefono solo se vero da ≥ 4 s
  (`ASPETTA_STABILE_MS` in `App.tsx`): il giudizio istantaneo (700 ms di
  silenzio) oscillava durante un comando lungo e ogni oscillazione era un
  «X aspetta te» ripetuto. Vale anche per l'attesa di quiete dell'updater
  (4 s in più, accettabile).

## Caratteri

Il parser `Ansi.kt` era: «dopo `ESC[` cerca la prima `m`». Quattro difetti:
1. `ESC[2K`, `ESC[?25l`, `ESC[1A` (cancellazioni, cursore) **mangiavano il
   testo** fino alla prima «m» di una parola normale, o troncavano la riga;
2. un `ESC` non seguito da `[` (OSC `ESC]633;…` della shell, `ESC(B`,
   `ESC=`) lasciava l'indice fermo → **ciclo infinito**, app bloccata (il
   try/catch non lo prende);
3. il 48 (sfondo) era «ignorato» ma i suoi parametri restavano in lista:
   `48;2;r;g;b` faceva leggere r,g,b come SGR → colori a caso, testo grigio;
4. il 7 (video inverso) e gli sfondi erano ignorati → l'opzione scelta di un
   elenco, disegnata in inverso, arrivava quasi invisibile.

Ora `spezzaAnsi` (Kotlin puro, `AnsiTest.kt`) taglia la riga in testo e SGR
scartando per intero CSI non-`m`, OSC (fino a BEL o `ESC \`), DCS/APC, set
di caratteri e ESC singoli, e avanza sempre; `applica` gestisce 0 1 2 3 4 7
22 23 24 27 30-37 38 39 40-47 48 49 90-97 100-107; `StatoStile.span()`
mette lo sfondo e scambia i colori in inverso. Griglia: stessa misura di
Adatta, mai sotto 10 sp (prima `dimensione-2`, min 8: glifi impastati).

**Non fatto (da decidere)**: un font monospazio incluso nell'APK con i
caratteri di cornice e i blocchi (`╭ ▄ █`): quello di sistema ripiega su un
font proporzionale per quei glifi e in Griglia le colonne slittano. Serve
scaricare un font OFL (JetBrains Mono / Cascadia): chiedere prima. Anche i
caratteri larghi (emoji) in Griglia slittano: servirebbe il disegno a celle.

Regola: il telefono **non deve reimplementare un emulatore**; ma quello che
riceve (le righe vestite dell'xterm) contiene solo SGR, quindi il parser
deve almeno saper **scartare** tutto il resto senza mai fermarsi.
