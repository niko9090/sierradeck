---
titolo: "Rapporto della notte: 0.70.0, tutte le schermate riprogettate"
quando: 2026-10-13T02:30:00+02:00
tag: ["0.70.0", "rapporto", "interfaccia"]
---

Nicholas, «migliora tutto il programma riprogettando per bene come hai fatto per i progetti».

**Il metodo, per ogni schermata:**
1. La foto «prima», nella copia di prova.
2. La revisione di un agente UI/UX (il progetto è in `riprogettazione-0-70-0.md`).
3. Il PC, poi la pagina e l'app.
4. I test delle funzioni pure.
5. La foto «dopo».

Le foto sono in `note/foto-0-70/`, sul PC fisso (fuori da git: mostrano le cartelle della macchina): `prima-*.png` / `dopo-*.png` per il PC, `pagina-prima-*.png` / `pagina-dopo-*.png` per il telefono. **Nessuna funzione è stata tolta**: per ogni schermata c'è l'elenco delle azioni di prima e di dove sono adesso.

## (a) Schermata principale
**Cosa cambia**
- **Ogni riquadro dice il suo stato in una parola** sulla testata: aspetta te (ambra), errore (rosso), al lavoro (verde), autopilota (blu), ferma, dorme, su <PC>. Nei riquadri stretti resta il pallino colorato.
- **Le chat con lo stesso nome si distinguono**: «Lavoro-esempio», «Lavoro-esempio #2», «#3». Lo stesso sul PC, nella pagina e nell'app. Il nome salvato non cambia.
- **La testata è più pulita**: restano ⏸ e ×, più il nuovo «⋯», che apre i comandi rari.
- **Il modello delle prossime chat va in «Strumenti ▾»** nella seconda barra, con «Usate da altri PC», i workspace, la nuova finestra e il negozio. Se il modello non è quello predefinito, il tasto lo dice.
- **Niente più striscia «Sto guardando se c'è una versione nuova…»** a ogni controllo automatico (ogni 10 minuti). Resta la spia «cerco…» accanto alla versione. La striscia compare solo se la ricerca l'ha chiesta il telefono.
- **Telefono** (pagina e app): i nomi distinti, e sotto il nome non c'è più «Enter to confirm · Esc to cancel». Si legge l'ultima riga vera della chat.

**Azioni di prima → dove sono adesso**

| Prima | Adesso |
|---|---|
| ⇄ Sposta in un'altra finestra o workspace (testata) | testata → «⋯» → ⇄ |
| 🏠 PC ospite (testata) | testata → «⋯» → 🏠 (anche il tasto destro sul titolo, come prima) |
| 🔐 PIN della chat (testata) | testata → «⋯» → 🔐 |
| ⏸ Iberna, × Chiudi | testata, come prima |
| Rinomina (due clic sul titolo) | come prima |
| Modello delle prossime chat (seconda barra) | seconda barra → «Strumenti ▾» |
| Riprendi, + Nuova chat, workspace, Su altri PC, ⋯ workspace, Al lavoro in sottofondo | seconda barra, come prima |
| «Chat e workspace» (menu principale) | come prima, raggiungibile anche da «Strumenti ▾» |

**Funzioni pure e test**: `src/shared/chat-vista.ts` (statoChat, riassuntoWorkspace, nomiDistinti, rigaUtile, statoAggiornamento, gruppoChat) e `src/shared/stato-vista.ts`, provate in `tests/shared/chat-vista.test.ts`; nell'app `nomeChat` con `NomeChatTest`.

**Aperto**: il riassunto per workspace sulle linguette (pallino e numero dello stato peggiore) ha la funzione pronta (`riassuntoWorkspace`). Sulle linguette oggi c'è solo il pallino «qualcuno ti chiama» di prima: per il numero servono gli stati delle chat degli altri workspace, che la finestra non ha.

## (b) Autopiloti
**Cosa cambia**
- **A tutta finestra**, come Progetti. La tabella: Autopilota (con la cartella) · Chat · Criteri «1/2» · Ultima azione · Da · Stato.
- **Gruppi** con i conti: Aspettano te · Al lavoro · Fermi · Finiti · Tutti, più la ricerca per nome, obiettivo o cartella.
- **Lo stato è una parola** (`src/shared/autopiloti-vista.ts`): guasto (rosso), aspetta te, senza segni (ambra), al lavoro (verde), si prepara, pronto (blu), fermo, finito.
  - **Il guasto vince sul verde**: prima la riga diceva «al lavoro» e «guasto del programma» insieme.
- **Un solo verbo per riga**, secondo lo stato: Ferma, Rispondi (apre le Domande), Riprendi.
- **Il dettaglio a destra**: stato e da quanto, il verbo, «riparte dopo un riavvio», Archivia, «Togli…» in rosso con conferma. Sotto, l'obiettivo, i criteri spuntati, dal vivo, i messaggi verso la chat (con «Manda adesso») e le sue chat.
- **Il modulo «Nuovo autopilota»** si apre nel riquadro di destra: stessi campi, stesse spiegazioni dietro il «?».
- **Un PC che non risponde** è una riga sola, «DESK-ESEMPIO · non risponde», con il perché dietro il «?». Prima era un paragrafo arancione di sei righe. Così sul PC e sulla pagina.
- **Telefono**: la parola colorata, «da N min · criteri 1/2» e l'ultima azione. Le decide il PC (`vista` in `/api/stato`), e la pagina e l'app le disegnano. Con un PC più vecchio l'app usa le sue parole come prima.

**Azioni di prima → dove sono adesso**

| Prima | Adesso |
|---|---|
| + Nuovo autopilota | in alto, come prima; il modulo si apre a destra |
| Aggiorna | Strumenti ▾ → Aggiorna |
| Riparti al login (spunta in alto) | Strumenti ▾ → Riparti al login |
| Ferma / Riprendi / Riprendi le domande (in riga) | il verbo in riga, e lo stesso nel dettaglio |
| Archivia / Archiviato · togli | dettaglio |
| spunta «avvio» per autopilota | dettaglio → «riparte dopo un riavvio» |
| × elimina | dettaglio → «Togli…» con conferma |
| Su altri PC (i loro autopiloti, le azioni) | sotto la tabella, come prima |
| La scheda accanto alla chat (dialogo, diario, istruzioni, file) | invariata |

**Test**: `tests/shared/autopiloti-vista.test.ts` (8) e, nell'app, `VistaAutopilotaTest`.

**Aperto**: la scheda dell'autopilota accanto alla chat (la colonna stretta nel riquadro) non è stata ridisegnata stanotte. Toccarla vuol dire toccare il ridimensionamento del terminale, e va provata con calma.
