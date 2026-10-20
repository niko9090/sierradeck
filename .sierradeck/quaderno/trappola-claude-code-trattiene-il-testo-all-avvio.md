---
titolo: "Trappola: Claude Code appena avviato trattiene quello che si scrive (6-10 s), e un Invio alla cieca crea un doppione"
quando: 2026-10-20T14:50:00+02:00
tag: ["trappola", "sottofondo", "consegne", "claude code", "0.81.0"]
---

**Il sintomo.** Una consegna arriva **due volte** nel campo, una sotto l'altra, e non parte più. Oppure resta ferma con «Invio non lo fa partire». Lo stesso doppione si vedeva nel primo messaggio delle chat aperte in sottofondo, anche sul PC vero.

**La causa, misurata il 20/10 (c-241) con un pty a parte e Claude Code 2.1.304:**
- Dopo 6-10 s dall'avvio, Claude Code disegna il campo e chiede al terminale `ESC[>0q`, `ESC[?u` e `OSC 7501`.
- Per altri 6-10 s **tiene da parte** l'input (di più con il PC carico) e lo mostra solo dopo. Le prime lettere scritte prima che il campo esista si perdono.
- Rispondere alle domande del terminale non cambia niente: provato con risposte date a mano.
- Se un Invio arriva mentre il testo è ancora trattenuto, diventa un a capo dentro il testo (la stessa trappola di c-26 per i testi lunghi).

**La regola nel codice** (`src/main/sottofondo.ts`, `ECO_CAMPO_VUOTO_MAX_MS`):
- con il campo **vuoto** non si preme Invio alla cieca e non si riscrive;
- si aspetta fino a 60 s che il testo compaia;
- l'Invio alla cieca dopo 8 s resta solo quando il campo mostra qualcos'altro.

**Per provarlo di nuovo:** `node-pty` più `@xterm/headless` lanciati con `ELECTRON_RUN_AS_NODE=1` e l'electron del progetto (node-pty è compilato per Electron). Si scrive una lettera ogni 500 ms e si guarda quando compare nel campo.
- Togli `CLAUDE_CODE_CHILD_SESSION` dall'ambiente se lanci da dentro una chat di Claude Code: con quella variabile il comportamento cambia e la prova inganna.
