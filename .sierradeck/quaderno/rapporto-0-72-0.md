---
titolo: "Rapporto 0.72.0 per Nicholas: la cancellazione di AppData\\Local, le protezioni, l'autopilota che scrive nelle chat"
quando: 2026-10-15T12:30:00+02:00
tag: ["rapporto", "0.72.0", "per Nicholas", "sicurezza", "incidente 14/10"]
---

# In breve
La 0.72.0 (app 2.72.0) mette in sicurezza il programma e corregge i tre difetti che mi hai segnalato. **Non l'ho installata.** La pubblicazione richiede che tu rifaccia il login di GitHub su questo PC: vedi in fondo.

# 1. La causa della cancellazione del 14/10
**Non è stata trovata con certezza.** Le prove complete sono in `cancellazione-appdata-local-14-10.md`.
- Quella mattina Windows non registrava né i processi lanciati né gli script PowerShell. Il giornale dei cambi del disco era già traboccato, e la cancellazione ha distrutto anche la copia shadow.
- **Escluso con le prove:** nessuna chat di Claude Code ha lavorato fra le 04:00 e le 10:47 (ora di casa), nessun accesso SSH, nessun installatore, nessun aggiornamento di Windows.
- **Il sospetto più vicino negli orari, non provato:** il «ricontrollo da solo» dei criteri del tuo autopilota. Ogni 10 minuti, senza nessuno davanti, lanciava test, gradle e download, ed era attivo per tutta la finestra. Però nessuno dei suoi comandi cancella qualcosa.
- **L'ho rieseguito in una cartella isolata:** stessi comandi, stesso codice di quel giorno, casa, AppData e Temp finti, file sentinella dentro e fuori. Non è sparito niente, né nelle cartelle finte né in quelle vere.
- Per chiudere il dubbio servono i permessi di amministratore: SRUM, Prefetch e BAM dicono quale programma ha scritto e cancellato 12 GB fra le 09:00 e le 10:00.
- Da adesso, se succede ancora, il registro dei processi acceso il 14/10 dirà chi è stato.

# 2. Le protezioni (`sicurezza-cancellazioni-0-72-0.md`)
- **Niente più comandi senza nessuno davanti:** i criteri si misurano solo mentre l'autopilota lavora, o quando premi «Ricontrolla i criteri».
- **Una guardia unica per ogni cancellazione di cartelle**, del programma, del servizio e degli script (anche quella che svuota la cartella dell'installatore).
  - Rifiuta la radice dei dischi, la cartella utente, AppData, Temp intera, Documenti, Desktop, Program Files, Windows, e le cartelle che le contengono, anche attraverso un collegamento.
  - Un test fallisce se nel codice ne compare una che non ci passa.
- **I comandi dei criteri passano dagli stessi divieti delle chat governate:** niente cancellazioni fuori dalla cartella del progetto né verso percorsi con variabili. Ogni criterio ha la sua cartella temporanea.
- **I test girano con casa, AppData e Temp finti**, e falliscono se toccano le cartelle vere.
- **Il servizio degli autopiloti scrive nel registro** tutto quello che fa: ogni comando lanciato, dove, e come è finito. Prima le sue righe andavano perse, ed è anche per questo che del 14/10 non c'era traccia.

# 3. I difetti corretti (`consegne-un-messaggio-e-chat-visibile-0-72-0.md`)
- **«L'autopilota non riesce a scrivere nelle chat».** Dai registri, sul PC le consegne partono. I casi falliti erano le chat **in sottofondo**:
  - il testo restava nel campo per il suggerimento in grigio di Claude Code (corretto nella 0.71.1, che non hai ancora installato);
  - la chat lavorava senza riquadro, quindi sembrava che non ricevesse niente.
- **«Messaggi accumulati in alto».** Durante un turno lungo partiva un messaggio ogni 2 minuti, e a volte lo stesso veniva riscritto. Adesso al massimo **uno** per turno; gli altri partono alla fine del turno, uniti in uno solo, e «Manda adesso» lo dice.
- **«Lavoro in sottofondo invisibile».** La chat di un autopilota sta sempre in un riquadro del suo workspace, e il PC ci va quando l'autopilota le scrive. Mai mentre stai scrivendo: aspetta 45 secondi di quiete e intanto lo dice in una banda con «Guarda». Il sottofondo c'è solo se lo chiedi tu, con «Lavora in sottofondo» sul PC, sulla pagina e nell'app.

**Prova dal vero** su una copia di prova staccata, con un autopilota di prova:
- la finestra è andata da sola nel workspace della chat, e la chat si vedeva lavorare;
- dei tre messaggi mandati durante un turno lungo ne è entrato uno solo, e gli altri due sono arrivati insieme a fine turno;
- mentre «scrivevo» la finestra è rimasta ferma con la banda, ed è andata nel workspace 45 secondi dopo l'ultimo tasto.

# Punti aperti
1. **Login di GitHub su questo PC non valido** (il token di `gh` risulta revocato, e `git push` non ha credenziali). Per pubblicare la 0.72.0 e mandare i commit su GitHub serve che tu scriva qui `! gh auth login -h github.com` e poi `! gh auth setup-git`.
2. La cartella `note/prova-072` (la copia di prova) non l'ho potuta togliere: il controllo di sicurezza di Claude Code ha bloccato la cancellazione. Dentro non ci sono più credenziali; puoi cancellarla tu.
3. I due criteri del 14/10 con `gh` (download dell'APK con `mktemp`) non li ho potuti rieseguire per lo stesso problema di login.
4. Restano da prima: il tuo trasloco di «SierraDeck» fermo per il portatile spento, l'OAuth di Google «In produzione», e i progetti di prova da togliere.
