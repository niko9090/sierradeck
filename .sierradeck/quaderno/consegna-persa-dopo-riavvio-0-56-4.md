---
titolo: "Consegna persa dopo l'aggiornamento: chat che riprende, testo «già mandato» per finta, coda svuotata (0.56.4)"
quando: 2026-10-09T15:40:00+02:00
tag: ["autopilota", "consegne", "riavvio", "aggiornamento", "coda", "inVolo", "renderer"]
---

# Cosa è successo (registro, 09/10 12:17:39–12:18:22, dopo l'installazione della 0.56.3)

1. La consegna c-2 per la chat dell'autopilota «App Android» trova il riquadro appena rinato. Claude Code sta riprendendo una conversazione lunga.
2. Dopo **8 s** senza «pronta» scrive lo stesso: «tetto di 8 s scaduto». Il testo finisce nel terminale mentre Claude Code carica, e **si perde**.
3. Seguono 4 invii, più 4 nel «secondo modo», tutti con «non partita (la chat è ancora in ascolto)», poi la resa.
4. Intanto il servizio aveva già tolto i messaggi da `daConsegnare` quando aveva deciso la consegna. La chat resta ferma ad aspettare Nicholas.

# Le cause

- **Tetto troppo corto per una chat che riprende.** 8 s vanno bene per un terminale già vivo, non per uno appena nato su una conversazione lunga.
- **Il testo perso non veniva mai riscritto.** `testoPerso` diceva «non perso» se sullo schermo c'era **una qualunque** riga `❯` che cominciava come il testo. Dopo il riavvio la conversazione ripresa mostrava lo **stesso identico** messaggio di una consegna precedente («Leggi ed esegui le istruzioni in …c-5.md», 83 caratteri, che si ripete uguale). Per lo stesso motivo, a campo vuoto `consegnaPartita` poteva dire «partita».
- **Resa dopo 20 s.** Otto invii in due modi, poi basta.
- **La coda dell'autopilota si svuotava alla decisione, non alla partenza.** Una consegna non arrivata buttava via i messaggi.

# Correzione

**Finestra** (`src/renderer/consegne-autopilota.ts`, `ultime-righe.ts`, `App.tsx`):
- `Ponte.natoDa`, ricavato da `AttivitaTerminale.primoDato`: un terminale con meno di `TERMINALE_GIOVANE_MS` (60 s) usa `TETTO_RIPRESA_MS` = 45 s invece di 8;
- `Ponte.mandati` = `contaMandati`: quante righe `❯` uguali ci sono **prima** di scrivere. `consegnaPartita` e `testoPerso` ricevono `prima`, e conta solo una riga **in più**;
- dopo i due modi si insiste con `INSISTENZA_MS` (5, 10, 20, 40, 60 s): ogni giro guarda il campo, riscrive se è vuoto, preme invio;
- alla fine: passo «consegna X: **non consegnata**» nel registro, più `segnala` con un testo chiaro nel diario dell'autopilota. Mai «premi Invio» a Nicholas (decisione 0.38.1).

**Servizio** (`server.ts`, `dialogo.ts`, `nel-mosaico.ts`, `index.ts`):
- `nel-mosaico.avvia` torna l'id della consegna. Il wrapper `avviaLavoro(a, msg, chat, presi)` mette i messaggi presi in **`Autopilota.inVolo`**, sul disco, con l'id della consegna;
- `/consegne/esito`:
  - `partita` toglie la voce da `inVolo`;
  - `non-consegnata` (da `esitoDaPasso`) la rimette in coda con `rimettiInCoda`: in testa, senza doppioni, unendo le chat;
  - i `non-partita` intermedi non toccano niente;
- consegna **persa** (mai ritirata, `consegne.persa`): `server.riportaInCoda`;
- servizio ripartito (`riprendiLavori({servizioAppenaPartito})`): tutto `inVolo` torna in coda, perché le consegne vivono in memoria;
- `suStop` tiene `inVolo` da quello che c'è su disco (`ancora.inVolo`); `riportaInCoda` rimanda di 5 s se c'è una fermata o un dialogo in corso;
- i messaggi tornati in coda ripartono da soli con la consegna alle chat ferme della 0.56.3.

**Test:**
- `tests/renderer/consegna-dopo-riavvio.test.ts`;
- `tests/autopilot-host/coda-in-volo.test.ts`;
- `tests/renderer/invio-dopo-incolla.test.ts`, aggiornato con gli invii dell'insistenza.
