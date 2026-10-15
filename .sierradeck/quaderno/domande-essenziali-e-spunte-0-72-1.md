---
titolo: "0.73.0 (nata come 0.72.1): Domande essenziali e messaggi con la spunta — revisione UI/UX e come è fatto"
quando: 2026-10-15T16:30:00+02:00
tag: ["0.73.0", "domande", "autopilota", "UI", "UX", "pc", "pagina", "app"]
---

Nicholas, 15/10 sulla 0.72.0: «vedo ancora un sacco di messaggi "consegnato alle" che occupano tutto lo spazio; le domande non si capiscono, scrive troppe cose ed è una chat a sé stante; deve esserci la domanda e le risposte eventuali».

# Revisione UI/UX (prima del codice)

**Messaggi per la chat** (scheda autopilota sul PC, pagina e app).
- **Prima:** fino a 10 righe «consegnato alle hh:mm · testo», una per ogni messaggio arrivato, più le righe «in consegna» e «in attesa». Un autopilota che parla molto riempie la scheda di righe verdi che non chiedono niente.
- **Problema:** un messaggio consegnato non richiede azioni. Merita un segno, non una riga.
- **Dopo:**
  - i messaggi arrivati sono **piccole spunte ✓ su una riga sola**, con l'ora e il testo nel tooltip (sul telefono, con un tocco);
  - **una riga sola**, e solo se qualcosa è fermo: «in attesa da N min» (con il numero se sono più di uno) e il tasto «Manda adesso»;
  - «in consegna» è un puntino ⋯ fra le spunte, senza riga.

**Domande.**
- **Prima, sul PC:**
  - la colonna mostra una **conversazione** con lo schermo della chat, i messaggi precedenti e «1 messaggio prima ▾»;
  - la linguetta dell'autopilota mostra **tutte e cinque le parti aperte**: domanda, cosa sta facendo, perché, scelte con le conseguenze, se non rispondi.
- **Prima, su pagina e app:** la domanda è il `testoDomanda` intero (le cinque parti in un blocco), dentro la storia dell'autopilota (fino a 30 messaggi). Sembra una chat, non una domanda.
- **Problema:** per rispondere servono tre cose: di chi è la domanda, cosa chiede e cosa posso rispondere. Tutto il resto toglie attenzione.
- **Dopo, una scheda per domanda, uguale sui tre lati:**
  1. in piccolo: la chat o l'autopilota, e il progetto;
  2. in grande: **la domanda in una frase**;
  3. le scelte come **tasti**, con la consigliata segnata ★ e in evidenza;
  4. il campo «Scrivi tu» con il tasto per mandare;
  5. un **«?» chiuso**, che apre cosa sta facendo, perché, cosa succede con ogni scelta, se non rispondi, e lo schermo della chat.
- **Nessuna cronologia** nella scheda: la storia con l'autopilota resta nella sua scheda, dove serve.
- Se l'autopilota ha già risposto da solo, la sua risposta sta in una riga piccola sotto la domanda.

# Come è fatto
- **`src/shared/scheda-domanda.ts`** (pura):
  - `schedaDaParti` e `schedaDaTesto` producono `{chi, domanda, scelte, dettagli, segnaposto}`; le chiamano `conversazioniDomande` e `domandeScheda`;
  - `fraseDomanda` tira fuori la frase con il «?» da uno schermo o da un testo lungo.
- Il PC aggiunge `scheda` a ogni conversazione di `/api/domande` e a ogni `domandeScheda` del dettaglio autopilota. Pagina e app disegnano `scheda` quando c'è; con un PC vecchio disegnano come prima.
- **Messaggi:** `messaggiCompatti` in `src/shared/stato-dal-vivo.ts` (con le copie in JS nella pagina e in Kotlin nell'app) trasforma l'elenco di sempre in spunte più la riga ferma. I dati del PC non cambiano, quindi va anche con un PC vecchio.

# Provato dal vero (15/10, copia di prova in note/prova-0721)
**Dal vivo, con clic veri:**
- Linguetta «Domande» dell'autopilota: la frase, tre tasti con ★ sulla consigliata, «Scrivi tu» e il «?» che apre cosa sta facendo, perché, cosa succede con ogni scelta e se non rispondi.
- Il clic su un tasto ha risposto: la domanda è sparita dal servizio, e nel dialogo ci sono domanda e risposta.
- Scheda dell'autopilota: 8 righe «consegnato alle» diventate 8 spunte su una riga, più una riga «in attesa da 7 min · 2 messaggi».
- Pagina del telefono: le stesse cose. Le foto di prima e dopo sono in `note/prova-0721/foto/`.

**L'app:** qui non c'è un emulatore né un telefono collegato, e installarne uno non è permesso. È coperta dai test unitari (`SchedaDomandaTest`) e dalla build.

**La risposta persa (C):**
- **Causa vera:** le virgolette dritte non protette dentro `perLaChat`, non la ✓ né i backslash.
- **Ora:** `shared/json-tollerante.ts` ripara virgolette, `\` non validi e a capo crudi. Se il resto non si legge, la risposta arriva lo stesso (`restoIlleggibile`) e non si applica niente.
- **Prova:** le due risposte vere del 15/10 si leggono intere, con criteri, comando e messaggio per la chat.
