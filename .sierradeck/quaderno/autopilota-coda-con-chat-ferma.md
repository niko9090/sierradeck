---
titolo: "Autopilota «al lavoro» con la coda piena e la chat ferma: perché, e come si sblocca da solo (0.56.3)"
quando: 2026-10-09T14:05:00+02:00
tag: ["autopilota", "hook", "stop", "consegne", "riquadro", "governata", "battiti"]
---

# Cosa si vedeva (09/10)

- Dopo la 0.56.2 l'autopilota «App Android» è rimasto in `lavoro`, con `daConsegnare` pieno, `chats` vuoto e i cicli fermi a 48.
- Nicholas vedeva la chat «ferma, aspetta te» mentre le istruzioni erano lì.
- Dal dialogo, «riprendi» rispondeva «era già in moto (lavoro)».

# La causa vera

**`assegnaAutopilota` non la chiamava nessuno.**

1. La chat era stata aperta a mano: il riquadro si chiama «SierraDeck». Poi è stata affidata all'autopilota.
2. Le consegne trovavano il riquadro (`riquadroDi`) e ci scrivevano, ma non lo segnavano come governato (`pane.autopilota`).
3. Al riavvio `pty:spawn` compone gli hook dell'autopilota (`componiImpostazioni`, `/hook/stop?ap=…`) **solo da quel segno**.
   - Verificato sulla riga di comando di `claude.exe`: c'erano solo gli hook `/api/segnale` del Gestore, nessun `/hook/stop`.
   - Quindi il segnale di fine turno al servizio non arrivava mai.
4. Il Gestore manda i battiti delle chat governate (`/battiti`) ricavandoli dallo stesso segno: per il servizio quella chat non esisteva.

A questo si aggiunge un difetto di disegno: i messaggi in coda entrano **solo** come risposta all'hook `Stop`. Un messaggio messo in coda quando la chat si è già fermata non vede mai un altro `Stop`.

# Correzione

- **Segno sul riquadro** (`src/renderer/consegne-autopilota.ts`):
  - `Ponte.governa(paneId, {id, chat})`: la consegna segna il riquadro trovato (non i remoti, non le consegne senza autopilota) e lo scrive nel registro;
  - dal riavvio dopo il segno il terminale nasce con l'hook. Un terminale già vivo non si riavvia: rompere un turno è peggio.
- **Chat ferme**:
  - il Gestore (`index.ts`) manda in `/battiti` anche `ferme`: le chat governate vive con `aspetta` e senza `chiedeSegnale` (mai dentro una domanda);
  - il servizio segna `fermaDal` per chat, e lo cancella quando la rivede lavorare o le manda un turno;
  - dopo `FERMA_DA_MS` = 30 s (`chatFerme` in `guardiano.ts`), `consegnaAlleChatFerme` porta i messaggi in coda con `ripartiDaDove`. Lo fanno sia il battito sia il giro di guardia;
  - non tocca chi ha una fermata in lavorazione o un dialogo in corso: il dialogo riscrive la coda con la sua copia, e c'è `daDialogo`.
- **Dialogo:**
  - a fine risposta si consegna subito, senza aspettare il prossimo battito;
  - «riprendi» in `lavoro` con la chat ferma forza il giro (`giriDaForzare`, senza soglia); con la chat che lavora dice «la chat sta lavorando».
- **Test:**
  - `tests/autopilot-host/chat-ferma-coda.test.ts`: puro, soglia, guardia, battito di lavoro, dialogo, riprendi;
  - `tests/renderer/consegne-autopilota.test.ts`: segno sul riquadro.

# Limite rimasto

Una chat già viva senza hook riceve la coda dal battito, ma **i criteri e il supervisore** girano solo con l'hook `Stop`. Fino al prossimo avvio del suo terminale i cicli non salgono. Per averlo subito: chiudere e riaprire il riquadro, a turno finito.
