---
titolo: "Aggiornare senza uccidere il lavoro in corso"
quando: 2026-08-30T21:00:00Z
tag: ["aggiornamenti", "autopilota", "chat", "cicli-di-vita", "telefono"]
---

# Un aggiornamento non è una chiusura per fine lavori

Requisito esplicito di Nicholas. Prima della **0.12.42**, premere «Installa»
chiudeva il PTY host e con lui ogni `claude.exe` dovunque fosse arrivato: a
metà di una risposta, di una compilazione, di una pubblicazione.

Il danno vero non era il testo perduto — le trascrizioni sono su disco e si
riprendono — ma **l'azione lasciata a metà nel mondo**, che nessun riavvio
rimette a posto.

## Il punto d'appoggio è la fine del turno, non la fine del mandato

Distinzione che è costata un giro di ragionamento sbagliato: «il mandato è
finito» e «non c'è niente in volo» sono lontanissime. Un mandato dura ore, un
turno minuti. Aspettare il mandato vorrebbe dire non aggiornare mai proprio le
macchine che lavorano di più. Si aspetta il **turno**, che arriva di continuo.

## La sequenza, e perché è in quest'ordine

1. `POST /pausa-aggiornamento` al servizio: marca ogni autopilota `lavoro` con
   `fermatoPerAggiornamento`. **Prima** di avvisare le chat: avvisando per
   prime, una chat chiuderebbe il turno e l'autopilota le darebbe subito il
   compito dopo — si ricomincerebbe ad aspettare da capo, all'infinito.
2. Si scrive `AVVISO_PAUSA` dentro ogni chat che sta lavorando, **una volta
   sola**: «finisci quello che hai in mano, salva, annota dove sei arrivato,
   poi fermati». Annotare è la parte che il programma non può fare al posto
   suo.
3. Si aspetta la quiete **guardando** (`inVolo`: terminale acceso e non in
   attesa di te), non contando il tempo. Fase `attendo` con `chatOccupate`.
4. Si annota su disco chi era a metà (`pausa-aggiornamento.json`), poi si
   installa.
5. Al ritorno: gli autopiloti li riprende il servizio; alle chat non governate
   si scrive `AVVISO_RIPRESA` quando il loro riquadro si riannuncia.

Se la quiete non arriva entro `ATTESA_QUIETE_MS` (10 min) **non si installa** e
si disfa la pausa. Lasciare gli autopiloti fermi ad aspettare un riavvio che non
arriva è il peggiore dei due errori.

## Le trappole, tutte pagate almeno una volta in questo progetto

- **`fermatoPerAggiornamento` non è `sospeso`.** `daRiprendere` salta i sospesi
  di proposito, perché dietro c'è la decisione di qualcuno. Se la pausa li
  marcasse così, si sveglierebbero fermi per sempre. Per lo stesso motivo il
  guardiano del silenzio deve **saltarli**: tacciono perché gliel'abbiamo
  chiesto noi.
- **Scavalca `riprendiAlRiavvio: false`.** Quell'interruttore serve a non far
  resuscitare un autopilota dopo un riavvio del PC, non a lasciare per strada
  un lavoro che abbiamo interrotto noi.
- **Il segno si toglie quando si riparte, non prima**: altrimenti la fine del
  primo turno ripreso lo rimette a dormire.
- **L'elenco di chi era a metà va su disco.** In memoria muore con il processo,
  ed è proprio il processo che sta per morire. Ha una scadenza (6h): trovarlo
  tre giorni dopo e scrivere «riprendi» in chat che hanno fatto altro sarebbe
  peggio che tacere.
- **`viva` ≠ `aspetta`.** Un riquadro ibernato non aspetta te *e* non sta
  lavorando: senza distinguerli, ogni installazione resterebbe appesa a un
  terminale che non finirà mai niente perché non è mai cominciato.

## I due lati del telefono

Entrambi vanno aggiornati insieme, sempre — vedi [[app-android-nativa]].

- Pagina servita (`client-pagina.ts`): testo della fase `attendo` e tasto
  disabilitato «Aspetto le chat…».
- App Android: `Aggiornamento.chatOccupate` in `Modelli.kt`, la fase in
  `Computer.kt`, e — importante — in `App.kt` la schermata d'installazione va
  **disdetta** se lo stato torna `attendo` o `pronto` con errore. Il telefono
  segna l'installazione al tocco per non giocarsela a testa o croce contro un
  computer che sta chiudendo; adesso che l'installazione può non partire,
  resterebbe uno schermo che dice «sto installando» per dieci minuti.

## Cosa resta fuori portata

Un processo lasciato acceso in background da una chat (`npm run dev`) muore
comunque: per Claude quel turno è chiuso, e noi guardiamo i turni.

## 2026-09-04 — è partito lo stesso sopra una shell che operava (0.12.53)

**Il fatto.** «Ho lanciato l'aggiornamento e anche se una chat aveva la shell
aperta che operava si è chiuso tutto e ha aggiornato.»

**La causa.** `chatAspetta` (`renderer/ultime-righe.ts`), che è il giudizio
usato da `inVolo`: se il flusso aveva mai visto il prompt (`prontoVisto`,
sempre vero dopo il primo turno) comandava **solo il flusso**: 700 ms di
silenzio = «aspetta te». Un comando lungo che non scrive niente per un
secondo — una compilazione, un `npm run`, una copia — rendeva la chat «ferma»
e l'installazione partiva. Lo schermo (`esc to interrupt`) veniva guardato
solo quando il flusso non aveva mai parlato.

**La correzione.** Lo schermo ha il **veto**: se `aspettaDalloSchermo` dice
«sta lavorando», la chat non aspetta, qualunque cosa dica il flusso. Il flusso
resta a comandare i millisecondi (non scrivere in mezzo a un ridisegno) solo
quando lo schermo non è al lavoro. Vale anche per l'autopilota, che usa lo
stesso giudizio per decidere quando può parlare a una chat.

**Resta vero:** una shell nuda senza Claude (nessun `❯`, nessun «esc to
interrupt») non ha segni: `aspettaDalloSchermo` → `undefined`, e con
`prontoVisto` falso conta come al lavoro (blocca l'installazione 10 min).


# Le due strade dell'installazione, e come si legge nel registro (0.25.1)

Nicholas (2026-09-13): «l'aggiornamento si è installato ma non ha fatto
vedere la grafica di installazione come al solito, ho dovuto chiudere e
riaprire». Diagnosi dai tempi (registro + cartelle):

- 17:54 scaricata la 0.25.0 da sola (`%LOCALAPPDATA%\sierradeck-updater\pending`)
  → fase «pronto», striscia con «Installa e riavvia».
- 18:43:42 salvataggio di chiusura, 18:43:48 riparte la **0.24.1**, 18:44:54
  parte la 0.25.0. Cioè: chiusura → `autoInstallOnAppQuit` di
  electron-updater lancia l'installer NSIS **silenzioso** (nessuna finestra
  nostra) → riaperta subito, per un attimo torna la vecchia, l'installer la
  chiude e fa partire la nuova.
- Nessun errore. La «grafica» (SierraDeck Update, `%APPDATA%\sierradeck\updater`)
  compare **solo** premendo «Installa e riavvia» (o dal telefono): la 0.24.1
  delle 17:29 era passata di lì (`updater/aggiornamento.txt`).

Trappola scoperta: fino alla 0.25.0 l'updater scriveva solo su `console.*`,
che in produzione nessuno legge → il registro non diceva nulla. Dalla 0.25.1
`creaAggiornamenti(..., registro)` scrive ogni fase (`[aggiornamenti] fase:
…`, `INSTALLA x chiesto dal PC/telefono`, quiete, «SierraDeck Update e vivo»,
ripiego «senza finestra») e `autoUpdater.logger` porta nel file anche le
righe di electron-updater («Checking for update», «Found version», «Auto
install update on quit»). Per capire da che strada è passato un aggiornamento:
`grep aggiornamenti|electron-updater` nel log del giorno.

Idea non fatta: far passare anche l'installazione alla chiusura da SierraDeck
Update (finestra sempre). Cambia la semantica di `before-quit`: da decidere
con Nicholas.

## Aggiornamento 2026-09-14 (0.27.0, controllo completo)

- **Se SierraDeck Update non si fa vivo**, la pausa si disfa: `disfaPausa`
  (ultimo parametro di `creaAggiornamenti`) toglie la pausa agli autopiloti,
  cancella `pausa-aggiornamento.json` e rimette `autoInstallOnAppQuit`; lo
  stato torna `pronto` con un `errore` che spiega. Prima gli autopiloti
  restavano in pausa fino a un riavvio e al prossimo avvio le chat leggevano
  «tornato su con la versione nuova» senza che fosse successo.
- La fase `attendo` ha la sua striscia sul PC (`App.tsx`), e `pronto` mostra
  `errore` («Non ho installato: …»). Il telefono (pagina) legge
  `stato.aggiornamento` dal polso e conosce `installo`/`aggiornato`/`fermo`.
- `sistema:riavvia` e il riavvio dal telefono, con un aggiornamento `pronto`,
  **installano** invece di `relaunch`+`quit`: con `autoInstallOnAppQuit`
  acceso partivano insieme l'installer silenzioso e la versione vecchia, e
  NSIS la uccideva un secondo dopo (il «torna la vecchia e si chiude» del 13/09).
- Il diario dell'updater si cerca in `TEMP`, `TMP` e `tmpdir()`
  (`diariUpdater`): l'updater .NET legge `TMP` prima di `TEMP`.
- `aggiornamento.txt` e `workspaces.prima-dell-aggiornamento.json` si scrivono
  con temporaneo + rinomina; la versione scaricata si ricorda a parte
  (`versioneScaricata`) così un errore di rete non lascia «La versione  è
  pronta»; durante l'attesa non si cerca.
- Resta aperto (B3 del rapporto 2): l'updater C# uccide SierraDeck dopo 5 s
  (`GIRI_GENTILI` 25×200 ms) mentre la chiusura può durare fino a 47 s
  (layout + salvataggio Drive con tetto 45 s). Servono `VERSIONE_UPDATER`
  14 con 60 s, e il salvataggio Drive **prima** di avviare l'updater.

## 2026-09-16 — «Installa e riavvia» non fa niente: aspettava il Drive in silenzio (0.28.1, in lavorazione)

Nicholas: «se premo installa e riavvia spesso non succede nulla anche se
tutte le chat sono ferme». Registro delle 17:26: `INSTALLA 0.28.0 chiesto dal
PC: aspetto la quiete` e nello stesso millisecondo `[sistema] aspetto che
finisca il lavoro con il Drive prima di chiudere`; poi cinque `installazione
gia avviata: ignoro`. Alle 17:26:17 era partito un «Arrivo dal Drive» di
**639 chat**. Le chat non c'entravano.

Cause (tutte in `index.ts` `attendiLavoroDrive` + `aggiornamenti.ts`
`installa`): (1) l'attesa del Drive durava fino a 10 minuti **senza nessuna
fase annunciata** (la striscia `attendo` esisteva solo per le chat); (2) il
suo esito veniva buttato via (`attendiLavoroDrive().then(() => attendiQuiete…)`);
(3) `installazioneAvviata` è vero da subito, e ogni pressione dopo viene
ignorata in silenzio; (4) `pausaAutopiloti(true)` senza tetto: un servizio
muto lasciava il tasto morto per tutta la sessione.

Correzione (file `src/main/attesa-drive.ts`, puro, con test): un lavoro
**automatico** (arrivo, salvataggio) si **annulla** per uscire e si aspetta
al massimo 90 s (si rifà da solo al giro dopo); uno voluto (fusione,
ripristino) si aspetta fino a 10 min ma **dicendolo**: fase `attendo` con il
nuovo campo `attesa` («il lavoro con il Drive «Arrivo dal Drive» (312 di 639
file): l'ho annullato…») sul PC, nella pagina e nell'app (`Modelli.kt`
`attesa`). L'esito dell'attesa ora conta (`EsitoQuiete` con `perche`), la
seconda pressione rimanda lo stato invece di tacere, un'eccezione
nell'attesa rimette il tasto vivo e disfa la pausa, e la pausa autopiloti ha
15 s di tetto. Da fare: build, versione 0.28.1, APK (android/ toccato),
pubblicare.
