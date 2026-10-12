---
titolo: "Matrice di controllo a tappeto (0.68.0): ogni funzione provata dal vero fra i 3 PC e il telefono"
quando: 2026-10-12T21:40:00+02:00
tag: ["collaudo", "matrice", "controllo-completo", "0.68.0"]
---

Ordine di Nicholas (12/10): «controllo completo e a tappeto su tutte le funzioni,
una nuova versione che porta a risoluzione TUTTI i difetti». Prove fatte dal vero
il 12/10 sera sui 3 PC (PC fisso, portatile, desk-nik-glos) con dispositivo
temporaneo; il telefono = le stesse rotte attraverso il ponte (`/api/ponte`).
Chat e progetti di prova: «SierraDeck-prova-c2», «SierraDeck-prova-ap». Sulle
chat vere di Nicholas: solo lettura.

Strumenti (scratchpad `collaudo/`): `matrice.cjs` (letture sui 3 PC),
`prova-chat.cjs <pc>` (giro vero di una chat), `prova-autopilota.cjs <pc>`,
`pagina-vera.cjs` (la pagina servita compila).

Legenda: ✅ funziona · 🔧 era rotto, corretto nella 0.68.0 (con test) · ⏳ aperto

## Chat
| Prova | PC fisso | Portatile | desk-nik-glos | Esito |
|---|---|---|---|---|
| apri chat in un progetto (ponte = telefono) | ✅ | ✅ | ✅ | |
| domanda «trust this folder» → scelta dal telefono | ✅ | ✅ | ✅ | `opzione` = testo dell'opzione |
| scrivi + risposta letta (storia) | ✅ | ✅ | ✅ | |
| chiudi (prova) | ✅ | ✅ | ✅ | |
| riprendi in sottofondo | ✅ | ✅ | ✅ | |
| stato a schermo (lavora / aspetta) | ✅ | ✅ | ✅ | |
| chat di casa su altro PC data per «non avviata» | 🔧 | 🔧 | 🔧 | vedi D1 |
| «Riprendi» di un altro PC dal telefono | — | 🔧 | 🔧 | D3: 504 dopo 4 s |

## Workspace e progetti
| Prova | PC fisso | Portatile | desk-nik-glos |
|---|---|---|---|
| crea workspace = progetto (cartella nella radice) | ✅ | ✅ | ✅ |
| togli workspace | ✅ | ✅ | ✅ |
| niente workspace di sistema / doppioni / sessioni interne | ✅ | ✅ | ✅ |
| «Su altri PC» c'è, mai sé stesso, fionda visibile | ✅ | ✅ | ✅ (residente) |
| «Apri» da Su altri PC: chat vive là | 🔧 D1 | 🔧 D1 | — |
| pannello Progetti (niente progetti di sistema, spazio Drive) | ✅ | ✅ | ✅ |
| Lavora su questo PC / Togli | ✅ provati dal vero il 12/10 (0.66.3, progetto di prova: 24 file + 4 chat, fermo/ripresa, Annulla tutto) | | |

## Autopiloti, consegne, sottofondo, domande
| Prova | Esito |
|---|---|
| autopilota di prova sul portatile: crea, scheda, visto dal PC fisso fra «altri PC», ferma, archivia | ✅ |
| consegne dopo il riavvio (registro: «il servizio è ripartito con N messaggi… li rimetto in coda», consegne in sottofondo NexoraOS 19:07) | ✅ |
| «Domande» sul PC/telefono | 🔧 D4: 20–30 s per rispondere |
| «Riprendi» un autopilota lascia traccia | ✅ (0.67.2) |

## Collegamento fra PC
| Prova | Esito |
|---|---|
| strade: portatile LAN (~20 ms), desk-nik-glos Tailscale (~60–140 ms) | ✅ |
| chiave di casa: il ponte firma e passa su tutti | ✅ |
| rifiuti voluti del ponte (domande, salute, case di un altro PC) con il motivo | ✅ |

## Drive
| Prova | Esito |
|---|---|
| spazio: 14,9 GB su 16,1 (SierraDeck 6,4 GB: chat 4,5 · progetti 0,5 · sistema 0,4 · orfani 0,86) | ✅ misurato |
| salvataggio / arrivo / presenze | 🔧 D2: «403 Quota exceeded» per ore |
| copie di conflitto a catena | ✅ (0.67.1) |

## Aggiornamenti
| Prova | Esito |
|---|---|
| da soli alla quiete sui 3 PC (0.67.1 → 0.67.4 senza «Installa») | ✅ |
| «Installa là» | ✅ (0.67.1, ~2 min per PC) |
| app Android firmata Ferrari Consulenze (apksigner) | ✅ |
| release come bozza, poi pubblicata (niente «404 latest.yml») | ✅ (0.67.4) |

## Telefono (pagina e app: stesse rotte via ponte)
| Prova | Esito |
|---|---|
| pagina servita dal PC: compila, ha Progetti/Apri/Salute/Aggiornamenti | ✅ |
| negozio, quaderno personale, consumi, consegne, app (versione+APK), account | ✅ |
| file dei progetti | ✅ |
| PIN e ospite | ✅ letture; le azioni PIN cambiano le impostazioni di Nicholas: provate solo nei test |

## Difetti trovati e corretti nella 0.68.0
- **D1 chat «non avviate» quando lo sono** (caso fionda, 2267fc18): (a) «Apri»
  da «Su altri PC» metteva qui riquadri dal vivo verso chat che sul PC di casa
  non hanno un terminale (lì il workspace non è sullo schermo): ora «Apri» le
  fa partire là in sottofondo; (b) `trovaChatRemota` voleva l'id esatto: una
  chat ripresa con un id nuovo vale come aperta se stessa cartella e stesso
  titolo (una sola), e riquadro, workspace e casa passano all'id nuovo
  (`casa:idNuovo`). Test `chat-aperta-con-id-nuovo.test.ts`. Sul caso fionda
  l'id nuovo non c'era: la causa vera era (a).
- **D2 Drive oltre la quota di Google** («Total Query Cost per minute per
  user», fino a 751 errori l'ora dalle 16): la ronda delle presenze legge ogni
  30 s tre file per ognuno dei ~55 progetti del registro, quasi tutti assenti,
  e un «non c'è» non si ricordava. Ora si ricorda 3 minuti per chi legge; chi
  crea ricerca sempre (niente doppioni). Test `drive-ricerche-assenti.test.ts`.
- **D3 «Riprendi» di un altro PC dal telefono**: `/api/sessioni` via ponte
  scadeva a 4 s (504). Rotte lente anche per sessioni, ripresa, sottofondo,
  file (PC e app 2.68.0). Test `rotte-lente-del-ponte.test.ts`.
- **D4 Domande, Salute, Altri computer lenti (20–30 s)**: `postino.pc()`
  rileggeva i battiti dal Drive a ogni richiesta. Ora `pcSubito()`: un minuto
  di memoria, poi risposta subito e rilettura in sottofondo. Test in
  `progetti-posta-altrui.test.ts`.

- **D5 nome dell'utente nelle schede di fine lavoro**: la scheda che un
  autopilota lascia nel quaderno del progetto (che va in git, repository
  pubblico) scriveva la cartella e i messaggi con `C:\Users\<nome>\…`. Ora
  `senzaUtente` li scrive `~\…`; la scheda di oggi è stata ripulita. Test
  `scheda-senza-utente.test.ts`.

## Aperti
- Il registro dei progetti ha molti doppioni per id (Wdeck ×4, Gestore ×3…):
  li unisce «stesso nome = stesso progetto» nella vista, ma moltiplicano i giri
  sul Drive. Da proporre a Nicholas una pulizia del registro.
- Pulizie del Drive (14,9 GB su 16,1): in attesa della conferma di Nicholas.

## Dopo la 0.68.0 (12/10, ~20 UTC)
PC fisso e desk-nik-glos sulla 0.68.0 (installata dal programma alla quiete);
portatile 0.67.4 con la 0.68.0 pronta, in attesa della quiete.
- «Domande» 0,2 s (prima 29 s); elenco PC 0,2 s (prima 21 s); Salute 2,9 s
  (prima 7–21 s) — D4 ✅
- errori Drive 403 dall'avvio della 0.68.0: **0** (prima fino a 751 l'ora) — D2 ✅
- «Riprendi» di un altro PC dal ponte: risponde (portatile 20 s, desk 0,3 s)
  invece di 504 — D3 ✅
- giro chat completo di prova su desk-nik-glos: tutto verde ✅
- letture sui 3 PC (workspace, Su altri PC con fionda, niente sessioni interne,
  autopiloti, consegne): verdi ✅
- D1 «Apri» da Su altri PC: il riconoscimento con id nuovo è coperto dai test;
  l'avvio in sottofondo dal tasto «Apri» si prova solo premendolo sullo schermo
  (non lo comando da qui): da vedere al prossimo «Apri» di Nicholas.
- Pulito: chiusa la chat dell'autopilota di prova rimasta aperta sul
  portatile (aveva una domanda in attesa). Restano le cartelle di prova
  «SierraDeck-prova-c2/-ap» nei progetti dei PC (vuote, innocue).

## Da decidere con Nicholas
- **Installazione da sola alla quiete** (0.67.1): la regola di Nicholas del
  12/10 è «solo io installo le nuove versioni se non specificato da me». Il
  programma oggi installa da solo appena le chat sono ferme. Tenerla, o
  installare solo con «Installa»? Non l'ho cambiata da solo: cambiarla vuol dire
  pubblicare una versione che si installerebbe da sola.
- «HomeAssistant» e «HA» sono lo stesso progetto?
- Pulizie del Drive (14,9 GB su 16,1).

## 0.69.0 (era la 0.68.1; preparata, NON pubblicata finché Nicholas non dice come)
Regola di Nicholas: «HO DETTO CHE INSTALLO IO E BASTA», «UN SOLO AGGIORNAMENTO
QUANDO HAI RISOLTO TUTTO».
- **D6 installazione automatica tolta del tutto** (era della 0.67.1): niente
  installazione alla quiete, niente dal controllo dei 10 minuti, niente alla
  chiusura (`autoInstallOnAppQuit = false`); niente pausa dei turni per un
  aggiornamento pronto. Resta: scarica e «Versione pronta — Installa» su PC,
  pagina, app; si installa solo con il tasto o «Installa là» premuto da lui.
  Test `installa-solo-nicholas.test.ts` (ore di controlli con una versione
  pronta: nessuna installazione; il tasto Installa parte davvero).
- **Nella 0.67.4 / 0.68.0** (sui 3 PC adesso): l'installazione alla quiete parte
  solo se «Scarica gli aggiornamenti da solo» è acceso; spegnerlo basta, ma una
  versione già scaricata si installerebbe alla chiusura del programma. Quindi:
  pubblicando la 0.68.1, i PC alla 0.68.0 con lo scaricamento acceso la
  installerebbero da soli → prima di pubblicare va chiesto a Nicholas.
- **D7 «Togli da questo PC» rifiutato**: il pannello del portatile offriva
  «Togli» per «SierraDeck-prova-collaudo» e la rimozione rispondeva «il
  progetto non ha una cartella»: il pannello legge il registro di qui + quello
  del Drive, la rimozione solo quello di qui. Ora lo stesso registro. Test
  `togli-da-questo-pc-registro.test.ts`.
- `/api/prova/togli-progetto` (solo «SierraDeck-prova-…»): cartella nel
  recupero, voce del PC fuori dal registro. Per togliere i progetti di prova
  rimasti (prova-c2 sui 3 PC, prova-ap e prova-ws sul portatile) serve la
  0.68.1 installata: si fa subito dopo.

### Prove sulla 0.68.0, sui 3 PC (12/10 ~20:15 UTC)
- giro chat di prova completo: PC fisso ✅ portatile ✅ desk-nik-glos ✅
- errori 403 dal Drive dopo l'avvio della 0.68.0: 0 ✅
- Domande 0,2 s · elenco PC 0,2 s · Salute 2,9 s ✅
- Riprendi di un altro PC dal ponte: risponde ✅
- fionda «non avviate»: riconoscimento con id nuovo nei test; «Apri» si prova
  solo dallo schermo (al prossimo «Apri» di Nicholas) — motivato

### Nella 0.69.0, oltre a D6 e D7 (tutto con test, commit e push, niente pubblicato)
- **D8 contatore delle consegne**: `archivio.elenca()` metteva da parte `consegne-numero.json` (47 copie `.illeggibile`), e gli id ripartivano da c-1 a ogni riavvio. ✅ (`contatore-consegne.test.ts`)
- **D9 ordini durante il turno**: un messaggio in coda da più di 2 minuti si scrive anche a una chat al lavoro, senza interromperla. Provato dal vero su una chat di prova. ✅
- **D10 si vede chi lavora** (c-3): «al lavoro / aspetta te / fermo / finito», l'ultima azione, «nessun segno da 10 min», «consegnato alle hh:mm» o «in attesa da N min» con «Manda adesso», «Al lavoro in sottofondo» con «Guarda». Su PC, pagina e app; provato nella copia di prova. ✅
- **D11 consegne in sottofondo**: restavano «in consegna» per sempre; ora c'è l'esito «partita». ✅
- **D12 Drive**:
  - le chat sono compresse (si accende solo quando tutti i PC sono alla 0.69);
  - dist/out/coverage/recuperati restano a casa, e i file oltre 50 MB pure;
  - il recupero scaduto si svuota da solo;
  - lo spazio è visibile per progetto;
  - l'inventario è nella scheda `cosa-si-salva-sul-drive-0-69-0.md`;
  - le doppie (2,13 GB) vanno solo mostrate a Nicholas. ✅
- **D13 lentezza**: vedi la tabella sotto. ✅
- **D14 Progetti a piena pagina** (richiesta di Nicholas): scheda `vista-progetti-0-69-0.md`, foto in `note/foto-0-69/`. ✅
- **D15 pagina «Progetti» ferma su «Leggo…»**: la pagina calcola un'impronta per decidere se ridisegnare, e non guardava il pannello. ✅
- Gli autopiloti degli altri PC, in sola lettura (12/10 sera): QUI App Android coda 1, 74 consegne (2 non partite); DESKTOP Fionda 1 «in volo» (era D11); nessun id ripetuto.

### I giri periodici (inventario 12/10 sera, codice della 0.68.0)
| Giro | Ogni | Cosa legge | Costo stimato (52 progetti nel registro, 2 altri PC) | 0.69.0 |
|---|---|---|---|---|
| ronda dei progetti | 30 s | Drive: presenza, testimone e coda di **ogni** progetto del registro | ~310 richieste/min, quasi tutte ricerche di file che non ci sono: è la causa dei 403 «Total Query Cost» | ogni 5 min se il progetto non ha chat vive qui; testimone solo se la presenza è mia → ~30/min |
| archivio del Drive | a ogni chiamata | — | se ne creava uno nuovo a ogni chiamata, quindi ricordi nome→id e «non c'è» persi: ogni lettura = ricerca + scaricamento | uno per collegamento; «non c'è» vale 20 s |
| offerte WebRTC | 10 s | Drive: una ricerca per PC, anche se spento | 12/min | solo i PC accesi; con il «non c'è» ~6/min |
| postino | 30 s | Drive: cassetta, richiesta dello schermo, battito (scritto ogni 2 min) | ~5/min | lettura senza ricerca ~3/min |
| battiti degli altri | ~1 min | Drive: elenco + scaricamenti; disco: `pc-altrui.json` riscritto sempre | ~5/min, 1 scrittura/min | `pc-altrui.json` solo se cambia |
| salvataggio automatico | 5 min | disco: due giri di cartelle; Drive: manifesto; disco: `sync-manifesto.json` (qualche MB) riscritto sempre | 0,8/min + qualche MB/5 min | manifesto locale solo se cambia; registro senza «SALVA richiesto» |
| ospite | 10 s | disco: indice delle chat + ogni trascrizione | CPU | 30 s; il log «aspetto» solo quando cambia |
| Domande (finestra) | 3 s | servizio autopiloti + battiti | — | 15 s a finestra nascosta |
| pagina: PC, lavoro Drive, coda | 10 s / 2 s / 10 s | Drive | anche a pagina nascosta | ferme a pagina nascosta |
| app: stato | 2 s | PC | anche con l'app dietro | 15 s con l'app dietro |
| rileggi principale | 10 min | powershell `Get-NetIPConfiguration` | un processo ogni 10 min | invariato |

### Numeri, prima e dopo
- **Questo PC, 0.68.0, 12/10 23:00** (PowerShell, 60 s, sola lettura): CPU 0,9% del PC (8 core), RAM 682 MB, 0,5 MB scritti al minuto (6 processi SierraDeck). Il registro di oggi: 1.600 rifiuti 403 dal Drive fra le 16 e le 20 (0.67.4), **zero** dopo l'installazione della 0.68.0 (19:53); 217 righe in 1,5 ore.
- **Portatile e desk-nik-glos «prima»**: i loro battiti della 0.68.0 non portano ancora le risorse, e il ponte non passa la Salute per scelta. I numeri arrivano dalla 0.69.0 (Salute → «Quanto lavora SierraDeck», con CPU, RAM, richieste al Drive al minuto e rifiuti, per ogni PC).
- **Dopo**: si leggono dalla Salute di un PC qualsiasi quando i 3 PC sono sulla 0.69.0. Stima dal codice: da ~330 a ~45 richieste al Drive al minuto per PC.

### Matrice rieseguita sulla 0.68.0 installata (13/10 ~00:10, sola lettura)
- 3 PC sulla 0.68.0, fase «aggiornato». Workspace: 16 / 16 / 16; niente cartelle di sistema, niente doppioni, niente sessioni interne. «Su altri PC» c'è dappertutto (fionda visibile). Chat, autopiloti, consegne e domande si leggono. Progetti: 30 / 33 / 27, nessuno di sistema, con lo spazio. Sessioni, file e modelli rispondono. ✅
- Via ponte, Salute, Domande, case e autopiloti degli altri PC rispondono 403: **per scelta** (si gestiscono dal loro PC). Le tre righe «NO» di questo PC sono errori dello script di prova (chiave sbagliata, cartella vuota, `/api/case` solo per i PC), non del programma.
