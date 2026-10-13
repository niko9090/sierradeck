---
titolo: "Domande chiare e supervisore che verifica: consigliata, una alla volta, memoria delle risposte e delle decisioni, fatti, antiloop (0.71.0)"
quando: 2026-10-13T14:14:00+02:00
tag: ["autopilota", "domande", "supervisore", "memoria", "antiloop", "0.71.0"]
---

# Domande chiare (`src/shared/domanda-strutturata.ts`)

- **La scelta consigliata**: `consigliata: true` su una scelta sola. Si vede in tre modi:
  - nel testo: «(consigliata)», che arriva a pagina, app e Telegram;
  - sul PC: un'etichetta verde (`DomandeAutopilota.tsx`).
- **`validaDomanda` respinge** e fa riscrivere una volta:
  - una domanda oltre 200 caratteri (era 400);
  - più di un «?»;
  - parole vaghe (`PAROLE_VAGHE`: qualcosa, eccetera, come prima, quella cosa…);
  - conseguenze oltre 160 caratteri;
  - nessuna scelta consigliata.

  Le domande scritte dal programma (bloccato, criteri non misurati, «Pubblico adesso?», troppi rifacimenti) hanno già la loro consigliata.
- **Una alla volta**: `/domande` mostra per ogni autopilota la più vecchia, con `inFila`; le altre restano nel registro.
- **Al massimo 6 nuove all'ora** per autopilota (`DOMANDE_ORA_MAX`). Oltre, se la domanda ha una consigliata, la decide lui e lo scrive nel diario.

# Le risposte già date (`src/autopilot-host/memoria.ts`)

- **La stessa domanda** (uguale a meno di spazi e maiuscole) riceve la risposta di prima, senza chiedere.
- **Una simile** (Jaccard ≥ 0,8 su almeno 4 parole) **non** si risponde da sola: la risposta di prima diventa la scelta consigliata, con la data. Era la raccomandazione dell'esperto: riusare una decisione su un bivio diverso è peggio che richiedere. Per questo «cancello X?» e «cancello Y?» non sono gemelle.
- **Dove si scrivono**: nella rotta `/domande/:id/risposta`, cioè da qualunque parte arrivi la risposta (PC, telefono, Telegram).

# Le decisioni di Nicholas

Sono in `memoria.json`, per cartella del progetto:
- ogni risposta, nella forma «domanda → risposta»;
- le frasi del dialogo che decidono (`eUnaDecisione`: «da ora in poi», «mai», «voglio che»…).

Entrano nel quadro del supervisore a ogni giro (`sezioneDecisioni`).

# I fatti verificati (`src/autopilot-host/fatti.ts`)

Prima delle altre sezioni del quadro, in circa 2 KB:
- `git status` e gli ultimi 5 commit della cartella della chat;
- l'esito dei criteri, con l'ora della misura (e «non rimisurato» per i comandi lunghi rimandati);
- le ultime mosse del registro;
- la frase «credi a questi fatti più che alla chat».

# Antiloop (`src/autopilot-host/antiloop.ts`)

- **La firma di un giro**: tipo, istruzioni normalizzate (senza numeri né maiuscole) e impronta del codice. Senza git, l'impronta è l'ultimo messaggio della chat più gli esiti.
- **Quando scatta**: dopo 3 firme uguali di fila l'autopilota si ferma con «antiloop: 3 giri di fila con la stessa istruzione e il codice fermo…».
- **Quando non scatta**:
  - con i criteri rossi: lì ci sono già le strategie a gradini (`strategie.ts`);
  - quando il codice cambia: è un lavoro che avanza.

# Criteri ricontrollati da soli

`ricontrollaCriteri`, ogni 10 minuti, per chi ha finito da meno di un giorno o aspetta una risposta. Usa la cache, quindi costa poco se niente è cambiato. Un criterio tornato rosso va nel diario.

# Test

- `domande-chiare.test.ts`
- `memoria.test.ts`
- `antiloop.test.ts`
- `server.test.ts`, che copre:
  - «domande chiare nel servizio»;
  - «antiloop nel servizio»;
  - «criteri ricontrollati da soli».
