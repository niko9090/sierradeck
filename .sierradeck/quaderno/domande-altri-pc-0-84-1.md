---
titolo: "Domande dalle chat degli altri PC: testo intero, contesto, italiano, «Apri la chat su <PC>» (0.84.1)"
quando: 2026-10-22T10:30:00+02:00
tag: ["domande", "altri-pc", "battito", "italiano", "0.84.1", "c-74"]
---

# La richiesta (Nicholas, 22/10)

Le domande che arrivano dalle chat degli altri PC devono avere la domanda intera e qualche riga di contesto, il nome del progetto e del PC, e le opzioni di Claude in italiano («Scrivo io la risposta», «Ne parlo nella chat»). Se il testo manca, serve un tasto «Apri la chat su <PC>». Deve essere uguale su PC, pagina e app.

# Cosa non andava (fino alla 0.84.0)

- **Il battito portava solo le opzioni.** Una chat di un altro PC ferma su un elenco di scelte mandava `scelte` e basta. Nelle Domande, al posto della domanda, c'era «Su <PC>: la chat aspetta che tu scelga».
- **Causa nascosta, valida anche per le chat di questo PC.** `NUMERATA` in `domande-telefono.ts` non riconosceva la riga con il cursore («❯ 1. Rosso»). L'opzione sotto il cursore non si trovava mai, e `contestoScelta` ripiegava sulle ultime 20 righe dello schermo, opzioni comprese. Adesso il cursore `❯ › >` davanti al numero è ammesso.
- **Opzioni in inglese.** «Type something.» e «Chat about this» comparivano così sui tasti della scheda.

# Cosa fa la 0.84.1

- **Battito** (`domandaPerBattito` in `src/shared/domande-telefono.ts`, chiamata dal postino in `index.ts`):
  - con le scelte, `domanda` è il testo sopra l'elenco e `contesto` sono le righe sopra il riquadro;
  - senza scelte, `domanda` è la domanda in fondo al turno e `contesto` il paragrafo prima (`contestoSopraDomanda`, calcolato in `conSegnali`);
  - i limiti sono 1200 caratteri per la domanda e 6 righe da 200 per il contesto (anche in `progetti/posta.ts`);
  - per una chat con il PIN non viaggia niente, come prima.
- **Scheda** (`domande-conversazioni.ts`):
  - `chi` è «chat «X» · progetto · su PC»;
  - `suPc` e `viaPc` ci sono anche per le scelte;
  - nei dettagli ci sono «La domanda intera», «Prima della domanda» e «Dove»;
  - se il testo manca c'è `scheda.apri` = `{ pcId, pc, sessione, cwd, titolo }`.
- **Italiano** (`opzioneInItaliano` in `scheda-domanda.ts`):
  - riguarda solo le opzioni fisse di Claude Code (Type something, Chat about this, Submit, Yes/No e le varianti dei permessi), che diventano `etichetta`;
  - **al tocco si manda sempre `testo`**, perché `/api/scegli` confronta il testo con lo schermo vero;
  - le opzioni scritte da Claude per la domanda restano come sono.
- **I tre lati:**
  - PC: `SchedaDomandaVista.tsx`, dove `apriChatAltrove` apre il riquadro dal vivo;
  - pagina: `etichettaScelta`, `etichettaOpzione` e `apriAltroveHtml` → `pdApriChat`, che apre la chat dal vivo sul computer;
  - app: `etichettaScelta`, `SceltaVista.etichetta`, e `Apertura.apriChatSu` → la scheda Chat attraverso il ponte (`SuPc`), dentro la conversazione per `sessione`.

# Test

- `tests/main/domande-altri-pc-0-84-1.test.ts`: schermo vero di claude 2.1.294, PC A e B con `/api/domande`, pagina, sorgenti del PC e dell'app.
- `android/.../DomandeAltriPcTest.kt`.

# Trappole

- Un PC con la 0.84.0 o più vecchia non manda `domanda` per le scelte. Per quelle chat il tasto «Apri la chat su <PC>» resta finché quel PC non si aggiorna.
- Sulla pagina il tasto apre la chat **sul computer** che serve la pagina (riquadro dal vivo), non sul telefono. Nell'app invece si entra nella chat dal ponte.
- In questa copia gli hook ECC erano accesi (GateGuard chiede «i fatti» al primo tocco di ogni file) e mancava `node_modules`. Per i test si è usata una junction verso quella della cartella principale: va tolta con `rmdir`, non cancellata ricorsivamente.
