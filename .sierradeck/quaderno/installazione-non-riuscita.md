---
titolo: "Installazione non riuscita: SierraDeck se ne accorge al riavvio (0.39.2)"
quando: 2026-10-02T13:00:00+02:00
tag: ["aggiornamenti", "installer", "smart-app-control", "firma", "telefono", "android"]
---

# Il difetto

Portatile di Nicholas, 02/10, orari UTC:
- alle 09:32 «INSTALLA 0.39.0», SierraDeck Update si fa vivo e SierraDeck si chiude;
- alle 09:47 il programma riparte, ancora con la **0.38.2**;
- SierraDeck ripropone «Installa» come se niente fosse.

Il caso completo, con la 0.38.2 che sullo stesso PC era passata, è in `2026-10-02-firma-del-codice.md`.

# Come funziona adesso

- **Il segno.** Un attimo prima di lanciare SierraDeck Update, `segnaTentativo` scrive `tentativo-installazione.json` nella cartella dei dati, accanto a `versione-installata.json`: `{versione, da, quando}`.
  - Lo scrive anche l'installazione alla chiusura (`will-quit` con `autoInstallOnAppQuit` acceso e un installer pronto) e la strada di riserva (`quitAndInstall`).
  - Si toglie se l'updater non si fa vivo, perché in quel caso SierraDeck resta acceso e lo dice già.
- **All'avvio**, `creaAggiornamenti` legge il segno e chiama `esitoTentativo` (in `src/shared/tentativo-installazione.ts`):
  - nessun segno → niente;
  - versione cambiata → **riuscito**, il segno si toglie;
  - ancora sulla versione `da` → **fallito**.
- **Il perché solo se c'è la prova.** `diagnosiDiario` legge il diario di SierraDeck Update (`%TEMP%\sierradeck-update.log`), e solo se è più recente del tentativo. Il diario annota:
  - `installer fallito, codice N`;
  - `installer non partito: <messaggio>`: è «bloccato da Windows» solo se il messaggio lo dice;
  - `tempo scaduto`;
  - il lancio senza una fine (`interrotto`).
  - Senza diario, il motivo è detto come **probabile**: una protezione di Windows o Smart App Control su un installer non firmato.
- **Nel registro**:
  - `INSTALLAZIONE NON RIUSCITA: …`, con il motivo;
  - le ultime 12 righe del diario, o «assente».
- **Lo stato** (`StatoAggiornamento.tentativoFallito`) lo porta in ogni fase finché la versione non cambia, così «Installa» non si ripropone in silenzio. Lo mostrano:
  - la **striscia del PC**: un avviso ambra con titolo, motivo e strade, i tasti «Scarica a mano» (la pagina della release), «Riprova» (che apre «Installa») e ×, che lo nasconde fino al prossimo avvio;
  - **dentro la finestra di «Installa»**, in testa all'avviso;
  - la **pagina** (`fallitoHtml`, link solo verso github.com);
  - l'**app 2.43.2** (`testoTentativoFallito`, `conTentativoFallito`).

# Trappole

- Il diario di SierraDeck Update si cancella **a ogni nuovo lancio** dell'updater (`avviaUpdater`): va letto all'avvio, prima di un nuovo tentativo. Gli orari dentro sono locali e senza data, per questo si guarda la data del file.
- L'installer di electron-builder lanciato con `/S` non mostra nessun errore. Senza il segno, un fallimento non lascia traccia nel log di SierraDeck.

# Test

- `tests/shared/tentativo-installazione.test.ts`:
  - nessuno, fallito, riuscito, versione diversa;
  - diario: codice, non partito (con e senza blocco nel messaggio), interrotto, tempo scaduto, uscito bene;
  - l'avviso e i collegamenti nel main.
- `tests/main/tentativo-pagina.test.ts`: la pagina, con l'HTML e i link non github tolti.
- Kotlin: `TentativoFallitoTest`.
