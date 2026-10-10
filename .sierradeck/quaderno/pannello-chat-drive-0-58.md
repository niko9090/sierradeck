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
