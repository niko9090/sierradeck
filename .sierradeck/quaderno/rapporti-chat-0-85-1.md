---
titolo: "Le chat riferiscono a ogni passo: la riga RAPPORTO e il quadro per chat (0.85.1)"
quando: 2026-10-23T22:00:00+02:00
tag: ["autopilota", "rapporti", "segnali", "indicatore", "0.85.1"]
---

**Perché.** Nicholas, 23/10 sera: «le chat devono SEMPRE interfacciarsi con te, tu dovresti sempre sapere cosa succede e perché». Fino alla 0.85.0 l'autopilota sapeva di una chat solo il segnale di fine turno (`SEGNALE:`): dentro un turno di un'ora non sapeva niente, e alle domande «a che punto siamo» rispondeva con le ultime mosse del diario.

**Come funziona.**
- Ogni chat governata (non la Revisione) riceve nel primo messaggio `REGOLA_RAPPORTO` (`src/shared/rapporti-chat.ts`), prima della regola del segnale: una riga `RAPPORTO: partita | piano | passo fatto | provo | bloccata perché | mi serve | finita — testo` nel suo testo, a ogni passo.
- Le impostazioni della chat (`componiImpostazioni`) hanno un hook `PostToolUse` su tutti gli strumenti → `POST /hook/rapporto`. Il servizio **risponde subito** (la chat non aspetta) e poi legge la fine della trascrizione (`codaTrascrizione` in `index.ts`: ultimi 256 KB, solo `.jsonl` sotto `~/.claude/projects`), al più una volta ogni `RILETTURA_RAPPORTO_MS` (5 s) per chat. Si guardano solo i messaggi dell'**assistente**: le istruzioni contengono gli esempi della regola e non sono rapporti.
- Un rapporto nuovo va su `ChatGovernata.rapporto` (nel file dell'autopilota), una riga nel diario («rapporto da c-3: …») e conta come segno di vita (`ultimoSegno`): una chat richiamata che risponde con un RAPPORTO ha risposto.
- A fine turno (Stop) vale la riga `RAPPORTO:` del messaggio; senza, il rapporto si deduce dal segnale (`dichiarato: false`).
- Chat muta: il giro «mai fermo» la richiama con un messaggio che comincia con **«Dimmi il punto»** e chiede un RAPPORTO; se non risponde in 10 minuti il compito passa a una chat nuova sullo stesso ramo (meccanismo della 0.84.1, invariato).
- **Il quadro per chat** (`quadroDellaChat`, `righeQuadroChat`): compito, ultimo passo, ultimo segnale vero e da quanto, motivo se ferma. Va nel prompt delle risposte dalla scheda (`componiPromptDialogo`, parametro `quadro`) e nel `dettaglio` dell'indicatore, che PC, pagina e app mostrano già sotto il «?»: **per questo l'app non è cambiata** (niente APK nuovo per questo pezzo).

**Trappole.**
- Le chat aperte prima della 0.85.1 non hanno l'hook `PostToolUse` (le impostazioni si scrivono all'avvio della chat): per loro valgono solo i rapporti di fine turno finché non vengono riaperte.
- Scrivendo file con un heredoc Bash i `\n` dentro le stringhe diventano a capo veri: per il codice con `\n` usare Edit/Write.
