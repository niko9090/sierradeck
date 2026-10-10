---
titolo: "Pannello delle chat e dei progetti del Drive (0.58.0): modello dei dati, assegnazioni sbagliate, cambio del residente"
quando: 2026-10-10T20:30:00+02:00
tag: ["drive", "una-casa", "ospite", "sposta-progetto", "pannello", "residente", "0.58"]
---

Nicholas ha detto sì (10/10), con due sicurezze: una cartella di recupero annullabile, e un riassunto da confermare prima di togliere qualcosa. Il lavoro è in quattro tappe:
1. il pannello sul PC;
2. i PC si allineano alle scelte;
3. l'analisi prima di togliere un progetto, con recupero e conferma;
4. la pagina e l'app.

Questa scheda è la tappa 1.

# Da dove vengono i dati (niente logica nuova dove c'è già)

| Cosa | Fonte |
|---|---|
| Casa (residente) di ogni chat | `case-chat.json` / oggetto Drive `case-chat` (`CaseChat`, `src/shared/una-casa.ts`). Fonti: `regola`, `nascita`, `nicholas`, `sposta`. |
| Copie delle chat | La copia locale di questo PC: `chatLocaliDaIndice` (indice + `.jsonl` esistente, mtime del file). Le copie degli altri PC: il manifesto del Drive (`chat/<slug>/<uuid>.jsonl`, con `pc` = chi l'ha caricata, e `mtime`). Una chat caricata da due PC compare sotto due slug. |
| Chat aperte adesso | Battiti degli altri PC (`BattitoPc.chat[].sessione`) e `chatAperte` di qui. |
| PC conosciuti | Battiti (`postino.altrui()`, `battito` ISO) più questo PC. |
| Progetti | `progetti-drive.json` (`ProgettoDrive.percorsi` per PC). La chat va al suo progetto con le funzioni del registro (`staDentro`). |

Il pannello è calcolato da **`costruisciPannello`** (`src/shared/pannello-drive.ts`, pura), alimentata da `pannelloDrive:dati` in `index.ts`. La pagina e l'app (tappa 4) riceveranno lo stesso risultato da una rotta.

# Una riga

- **Chat**:
  - sessione, titolo, cartella, progetto;
  - **residente** (PC, nome, fonte e motivo della casa);
  - **copie** (PC, dove — «qui» o «sul Drive caricata da» — e quando);
  - **ultimo uso** (la copia più recente);
  - **stato**: `residente` (ha una casa e il residente ha la sua copia), `solo-cloud` (nessuna copia del residente: c'è solo sul Drive) o `conflitto` (vedi sotto);
  - **problemi**, ognuno con titolo, spiegazione e cosa fare.
- **Progetto**:
  - id, nome;
  - residente: la casa della maggior parte delle sue chat;
  - PC che hanno la cartella (`percorsi`);
  - numero di chat, ultimo uso, stato e problemi.

# Le assegnazioni sbagliate (regole in `problemiChat` / `problemiProgetto`)

- **Senza casa**: la chat non ha una voce in `case-chat`. Oggi vuol dire che appartiene a **ogni** PC che la ha (`casaAltrove(undefined)` non ferma niente): può girare e caricarsi su due PC.
- **Due case**: la chat è aperta adesso su un PC diverso dal residente, oppure dopo la decisione della casa l'hanno caricata sul Drive due PC diversi.
- **Casa su un PC sconosciuto**: il residente non è fra i PC con un battito. Succede se un PC ha perso `pc.json` e ha un id nuovo: la casa vecchia resta orfana.
- **Casa su un PC assente da più di 30 giorni**: il battito del residente è più vecchio di 30 giorni.
- **Copia più recente fuori dal residente**: una copia (qui, o caricata da un altro PC) è più nuova di quella del residente. Il lavoro più avanti non sta dove dovrebbe.
- **Progetto senza casa**: nessuna delle sue chat ha una casa. **Progetto diviso**: le sue chat vivono su PC diversi.

Lo stato è `conflitto` con «due case» o «copia più recente». Il filtro «Sbagliati» mostra le righe con almeno un problema.

# Cambio del residente, passo per passo

**Una chat** (riuso `ospite.scegli`, la stessa strada di «Ospitata da» e «Porta qui»):
1. Se la chat viveva qui, prima si salva sul Drive (`sincronia.salva`).
2. `unaCasa.memorizza` scrive la casa nuova come scelta di Nicholas (`da: 'nicholas'`, peso 2) in `case-chat.json` e sul Drive.
3. La casa nuova parte subito verso gli altri PC (`/api/case`, solo PC con la chiave di casa). Chi non la riceve la trova sul Drive al giro dopo, entro 2 minuti.
4. Sul vecchio residente (`ospite.giro` → `pianoTrasloco`):
   - se la chat è aperta e ferma, il riquadro diventa dal vivo;
   - se sta lavorando, si aspetta la fine del turno;
   - poi la copia di là va nella **cartella di recupero** (`recupero-riordino/<id>`), con il suo registro in `riordini/`. **Si annulla** da «Dove vive ogni chat» o da Riordina.
5. Sul nuovo residente il salvataggio porta giù la copia del Drive (`scendeQui`).

**Un progetto**:
- Dal PC residente, «Sposta progetto» (`ModaleSposta`) fa i controlli, il trasferimento, la verifica, il cambio di casa e l'archivio delle copie. Il pannello apre quella finestra, non ne rifà i passi.
- Da un altro PC si cambia la casa delle sue chat (come sopra, tutte insieme). La cartella del codice non si copia: se sul nuovo residente non c'è, il pannello lo dice prima di confermare.

**Cosa NON succede**: niente si cancella; la cartella del progetto non si tocca; le chat aperte non si chiudono a metà turno.

# Rischi trovati nella mappatura (da chiudere nelle tappe 2 e 3)

- «Sposta progetto»: il ricevente scrive la sua casa `sposta` prima della verifica, quindi una verifica fallita lascia comunque la casa nuova.
- Nessuno confronta le case con i PC conosciuti. Il pannello adesso li mostra come problemi.
- `recupero-riordino` e `riordini/` non hanno scadenza. La regola dei 30 giorni annullabili arriva nella tappa 3.
- Un trasloco che fallisce (file bloccato) viene ritentato ogni 10 s, con un registro nuovo ogni volta.
- Le copie degli altri PC si conoscono solo da chi ha caricato sul Drive. Nella tappa 2 il battito porterà l'elenco delle sessioni locali.

# Tappa 2: i PC si allineano alle scelte

- **Copie locali nel battito.**
  - `BattitoPc.locali` (facoltativo) porta `{ chat: [{sessione, cwd, mtime}], progetti: [{id, percorso}] }`, con al massimo 2000 chat, le più recenti.
  - L'ora dell'ultimo messaggio è arrotondata a 10 minuti, così una chat che lavora non riscrive il battito a ogni giro. Il calcolo si rifà al massimo una volta al minuto (`localiBattito` in `index.ts`).
  - Il pannello le mostra come copie «sul suo disco» e le usa nelle regole.
  - Un PC senza il campo finisce in `pcDaAggiornare`: «non dice ancora… va aggiornato».
  - Il campo si legge con prudenza (`localiDi`): un battito rovinato non rompe niente.
- **Stato voluto dei progetti in `case-chat`**, con chiave `progetto:<id>` (`src/shared/allineamento.ts`).
  - Si unisce come le case delle chat: vince la scelta più recente di Nicholas.
  - Un PC vecchio lo porta avanti senza saperlo, e `pianoTrasloco` lo ignora: guarda solo le sessioni che ha.
  - Il pannello lo scrive con `casa.scegli`, mettendo la chiave del progetto insieme alle sue chat: la stessa strada, con il salvataggio, la spinta agli altri PC e il Drive.
- **Piano di allineamento** (`pianoAllineamento`, a ogni giro di `giroCasa` → `allineaQui`):
  - questo PC è il residente e il progetto qui non c'è → «porta qui». Parte da solo (`sincronia.portaQui(id)`, una volta per progetto) **solo se la cartella non esiste affatto**; altrimenti aspetta;
  - questo PC non è il residente e il progetto qui c'è → «solo cloud». **Solo mostrato**: niente si toglie, quello è la tappa 3;
  - una cartella registrata male (radice di un disco, profilo dell'utente o una sua cartella madre) non entra mai in un piano (`cartellaDiProgettoValida`);
  - nel registro `[allinea] …` quando il piano cambia; nel pannello la sezione «Piano di allineamento di questo PC».
- **Sicurezza**: le case e lo stato voluto viaggiano solo fra PC della stessa chiave di casa (`/api/case` e Drive cifrato). Il piano nomina solo le cartelle registrate dei progetti.
- **Test**: `tests/shared/allineamento.test.ts` e `tests/main/pannello-drive-dati.test.ts` (battiti vecchi e rovinati).

# Tappa 3: la rimozione sicura (niente si perde, mai)

**Regole** in `src/shared/rimozione-sicura.ts`, **disco e rete** in `src/main/rimozione-sicura.ts`.

1. **Avvio.** Il PC che deve rendere il progetto solo cloud (pannello, piano → «Confronta con … e togli…») fa l'elenco dei suoi file del progetto (`elencaFile`):
   - per ogni file percorso, dimensione, data e sha256;
   - esclusi i collegamenti, `node_modules` e i recuperati;
   - oltre 50 000 file si ferma, perché non si potrebbe garantire niente.

   Poi elenca le sue chat della cartella e manda tutto al **residente** (`/api/rimozione/analisi`, tramite `remoto.chiama`): richiesta firmata, sulle strade che ci sono.
2. **Il residente classifica** (`classifica`):
   - `uguale`: stessa impronta, anche se il file è a un altro percorso;
   - `doppione`: più vecchio del suo;
   - `utile`: manca, è più recente, oppure è una chat più lunga.

   Se il residente non si raggiunge, o non ha la cartella, si ferma tutto: niente analisi, niente rimozione, e il pannello dice perché.
3. **Recupero.** Le voci utili vanno a pezzi da 96 KB, con ripresa (`/api/rimozione/stato` dice quanto è già arrivato), in `<progetto del residente>/.sierradeck/recuperati/<PC>-<data>/`.
   - `destinazioneRecupero` rifiuta qualunque percorso fuori da lì.
   - L'impronta viene controllata alla fine.
   - Se il file esiste già si scrive `nome (2)`: **mai sopra un file**.
   - Le chat vanno in `…/chat/<sessione>.jsonl`. Se il residente non ha affatto quella chat, entra anche fra le sue chat di Claude Code (un file nuovo, niente sovrascritto).
4. **Riassunto** (`riassunto`), nel pannello e nelle Domande (`rimozione:<id>`). Dice:
   - quante voci sono uguali e quanti i doppioni;
   - cosa è stato recuperato e dove;
   - cosa non si è potuto recuperare e perché.

   Tasti «Conferma e togli da questo PC» / «Annulla». La conferma è **automatica solo con zero voci utili e zero errori**.
5. **Rimozione = spostamento.**
   - Prima di spostare: nessuna chat aperta sulla cartella (`inUso`). Altrimenti si aspetta e lo si dice.
   - Poi un `rename`: se Windows rifiuta (EBUSY/EPERM, un programma la usa) la fase è «in uso», con il motivo.
   - Dove va: in `<dati>/recupero-progetti/<id>` se sta sullo stesso disco dei dati, altrimenti in `<cartella madre>/.sierradeck-recupero/<id>`, sempre sullo stesso disco, quindi niente copie a metà.
   - Elenco in `recupero-progetti/elenco.json`, con data, motivo e scadenza a 30 giorni.
   - «Ripristina» rimette la cartella al suo posto, ma non sopra un'altra cartella.
   - Alla scadenza c'è una domanda: «Mettila nel Cestino» (`shell.trashItem`, che si può ancora riprendere) oppure «Tienila» (altri 30 giorni). **Nessun rm, nessuna rimozione definitiva automatica.**
6. **Sicurezza.** `/api/rimozione/*` risponde solo a un altro PC con la firma della chiave di casa (visore `pc:`): niente telefoni, niente ponte, niente schermo locale. Risponde sempre 200 con `ok`, così un rifiuto non sembra un «non raggiungibile».

Test in `tests/main/rimozione-sicura.test.ts`, su cartelle temporanee:
- classificazione;
- giro intero con recupero e ripristino;
- mai sopra i file;
- conferma automatica;
- residente irraggiungibile;
- cartella in uso;
- scadenza;
- accesso alle rotte.

# Tappa 4: elenco dei progetti, pagina, app, prove

- **Azioni di un progetto** (`azioniProgetto` in `src/shared/pannello-drive.ts`):
  - Apri, Porta qui, Rendi residente qui, Rendi solo cloud qui;
  - i testi li scrive il PC, quindi PC, pagina e app mostrano le stesse parole;
  - un'unica strada per eseguirle, `azioneDriveGlobale` in `index.ts`: IPC `casa:azione` sul PC, `/api/drive/azione` dal telefono.
- **Telefono.**
  - `/api/drive/pannello` e `/api/drive/azione`, anche attraverso il ponte (`ROTTE_PONTE`, `Ponte.ROTTE`, `strada-pc`); un altro PC diretto riceve 403.
  - Pagina: «Chat e progetti», conferme in due tocchi.
  - App: `PannelloDrive.kt` nella sezione Drive, con `AlertDialog` e il testo del PC; `FunzionePc.PANNELLO_DRIVE` 0.58.0.
  - Test: `tests/shared/pannello-drive-app.test.ts` scrive la risposta vera in `android/app/src/test/resources/pannello-drive/pannello-0.58.json`, che `PannelloDriveTest.kt` rilegge. Lo stesso test disegna la pagina.

## Prove (10/10)

- **Due PC veri in rete** (`tests/main/rimozione-due-pc.test.ts`):
  - due server Client veri su 127.0.0.1, firma con la chiave di casa, il client remoto vero con la sua strada («rete di casa»), cartelle temporanee;
  - confronto → il file utile solo sul non residente arriva in `.sierradeck/recuperati/<PC>-<data>/` del residente → conferma → la cartella va in recupero → «Ripristina» la rimette;
  - con la chiave di un'altra cassaforte: niente confronto, niente rimozione.
- **Copia di prova `SIERRADECK_PROVA`** (porte 47650/47651, Claude Code con configurazione vuota, il programma vero non toccato). **Solo il lato locale**: una copia sola non ha un secondo PC né il Drive, quindi niente battiti e niente piano.
  - Il pannello mostra il progetto finto con il residente voluto e le tre azioni con i testi.
  - «Rendi solo cloud qui» con il residente irraggiungibile risponde «non si raggiunge … non tolgo niente», e la cartella è rimasta intatta.
  - «Rendi residente qui» scrive `progetto:<id>` in `case-chat.json` e le azioni diventano solo «Apri».
  - «Apri» apre una chat nella cartella del progetto.
  - Due testi corretti dopo la prova: «Quel PC» al posto di «Questo PC», e il messaggio del cambio di residente che parla del progetto e non di «la chat».
  - Copia e cartelle finte cancellate; nessun claude.exe orfano.
- **Da fare dal vero con Nicholas**: il giro intero fra due PC veri, con il Drive (piano di allineamento e «Rendi solo cloud qui» con il residente acceso).
