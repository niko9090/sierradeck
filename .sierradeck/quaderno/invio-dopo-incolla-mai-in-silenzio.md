---
titolo: "Consegne dell'autopilota: mai un Invio a mano (0.37.5, causa vera e correzione 0.38.1)"
quando: 2026-10-02T00:10:00+02:00
tag: ["autopilota", "consegne", "terminale", "difetto"]
---

# Il difetto

Il 01/10 le istruzioni dell'autopilota sono state incollate in una chat ma l'Invio non è partito. Nicholas ha visto il testo fermo nella casella e ha dovuto premere Invio a mano.

# La causa (verificata)

In `src/renderer/consegne-autopilota.ts`, `premiInvio` aspettava che `ponte.prontoARicevere(ptyId)` tornasse vero. Oltre `TENTATIVI_INVIO * 10` attese da 200 ms (6 s) c'era un **`return` muto**: niente Invio, niente segnale.

La prontezza usata era `aspettaOra` di `App.tsx`, la stessa degli annunci «aspetta te»:
- 0,7 s di quiete del flusso (`QUIETE_MS`);
- più **4 s di «aspetta» stabile** (`ASPETTA_STABILE_MS`), che ripartono da zero a ogni ridisegno.

Dopo un incolla lungo Claude Code ridisegna il campo con «[Pasted text #N +M lines]». Bastava poco più di un secondo di ridisegni per superare i 6 s.

I marcatori dell'incolla (`ESC[200~` / `ESC[201~`) sono interi: nel sorgente il carattere ESC c'è, anche se non si vede.

# La correzione

- **`premiInvio`:** oltre `ATTESE_PRONTEZZA` preme Invio **comunque**.
  - Dopo `CONTROLLO_INVIO_MS` guarda se è partita, prima dallo schermo (`ponte.partita`), poi dalla prontezza; se non è partita riprova, fino a `TENTATIVI_INVIO + 1` invii.
  - Se non parte ancora chiama `ponte.segnala`. Lo fa anche `attendiEConsegna` alla resa dei 90 s.
- **Prontezza per l'invio:** `prontoPerInvio`, cioè `chatAspetta` senza i 4 s di stabilità, in `ultime-righe.ts`.
  - Il segno del campo riconosce anche «[Pasted text #N».
  - `consegnaPartita(schermo)` dà `true` con «esc to interrupt», `false` con il testo incollato ancora nel campo, `undefined` se non si sa.
- **Il segnale:** in `App.tsx`, una banda «Il compito è nella chat X ma non è partito», con «Premi Invio» (scrive CR in quel pty) e «Chiudi».
  - Una nota va nel diario dell'autopilota, con la rotta nuova `POST /autopiloti/:id/nota` del servizio e l'IPC `autopilota:nota`, così il supervisore la vede.

# Test

- `tests/renderer/invio-dopo-incolla.test.ts`, con un ponte finto:
  - prontezza che non torna mai e chat che non parte: Invio premuto e segnale alzato;
  - prontezza che non torna mai ma Invio forzato che la fa partire: un solo Invio;
  - prontezza lenta: un solo Invio;
  - chat che parte subito: nessun secondo Invio;
  - lo schermo vero di Claude Code dopo un incolla multi-riga, per `consegnaPartita` e `prontoPerInvio`.
- `server.test.ts`: la nota nel diario (200, 400, 404).

# 0.38.1 — la causa vera, provata con un Claude Code vero

**Il fatto.** Il 01/10 alle 21:34:48 UTC il diario dell'autopilota NexoraOS (`ap-335600d4`) annota che il compito «non è partito dopo 4 invii». La 0.37.5 mostrava allora la banda «Premi Invio». Nicholas: «cosa vuol dire premi invio come domanda? non va da solo? deve essere automatico se no a cosa serve l'autopilota se devo premere invio io!».

**La prova.** Claude Code 2.1.287 è stato aperto in un pty come fa `pty-manager.ts` (`useConpty`, `--session-id`, `--dangerously-skip-permissions`); il flusso è passato da un `@xterm/headless` per fotografare lo schermo. Le sonde sono rimaste nello scratchpad della sessione.
- **Incolla di circa 4000 caratteri** fra `ESC[200~`…`ESC[201~`, poi INVIO = `` (CR, `String.fromCharCode(13)`) dopo 200 ms: **la chat parte e risponde**. L'Invio non era il problema.
- **Lo schermo dopo l'invio:** il messaggio mandato resta sopra (anche come «[Pasted text #1 +N lines]»); il campo di adesso (l'**ultima** riga «❯») è vuoto. Mentre lavora c'è la riga d'attività «* Schlepping… (2s · thinking)» / «(2s · ↓ 75 tokens)». **«esc to interrupt» non c'è sempre**: in diversi momenti mancava del tutto.
- **Quindi il difetto era un falso allarme.** `consegnaPartita` della 0.37.5 cercava «esc to interrupt» (spesso assente) e «[Pasted text #» in **tutto** lo schermo, dove resta nel messaggio già mandato. Risultato: «non partita», altri 3 Invio, poi la banda per Nicholas.

**La correzione (0.38.1).**
- **File più riga corta.** Nel main, prima di mandare la consegna alla finestra, `preparaConsegna` (`src/shared/consegna-breve.ts`) gestisce i testi oltre 280 caratteri o con un a capo:
  - li scrive in `<cwd della chat>/.sierradeck/consegne/<id>.md` con `scriviFileConsegna` (`src/main/consegne-file.ts`), che crea un `.gitignore` con `*`, toglie i file con più di 7 giorni e rifiuta i percorsi fuori da quella cartella;
  - nella chat si **digita** solo «Leggi ed esegui le istruzioni in .sierradeck/consegne/<id>.md (dal tuo supervisore).», senza marcatori.
  - I marcatori restano solo per un testo su più righe, quando il file non si può scrivere.
- **Partenza letta dal fondo dello schermo** (`consegnaPartita(righe, scritto)` in `ultime-righe.ts`): conta la riga d'attività `(Ns ·` o «esc to interrupt» nelle ultime 12 righe, oppure l'ultima riga «❯». Se è vuota (o «Try …») la chat è partita; se contiene ancora la riga scritta o un «[Pasted text», no. Lo scrollback non conta.
- **Mai «Premi Invio» per Nicholas.** Dopo 4 Invio si riprova da soli in un **secondo modo** (pausa di 3 s, altri 4 tentativi). Se fallisce, `segnala`:
  - mette nel diario «guasto del programma: …», che il supervisore legge;
  - manda l'evento `sierradeck:invio-mancato`, che fa comparire **solo nella scheda dell'autopilota** una nota discreta con un tasto «Invio» facoltativo. La banda in `App.tsx` è tolta.
- **Collaterale:** il divieto di cancellare riconosceva `/e/…` (Git Bash) e `/mnt/e/…` (WSL) come percorsi fuori dalle cartelle. Ora diventano `E:/…` (`percorsiDa` in `divieti.ts`).

**Test:**
- `tests/renderer/invio-dopo-incolla.test.ts`, con lo schermo vero della sonda:
  - una consegna lunga produce il file e la riga corta;
  - «[Pasted text» nel messaggio già mandato non fa scattare l'allarme;
  - la riga corta parte al primo Invio con il ponte finto;
  - il secondo modo, il guasto nel diario, nessuna banda.
- `tests/main/consegne-file.test.ts`:
  - il file, il `.gitignore`, i percorsi rifiutati;
  - **la prova con `claude.exe` vero** (saltata se manca; parte con `SIERRADECK_PROVA_CLAUDE=1` perché consuma il piano): la chat esegue l'istruzione del file, una parola che sta solo lì.
- `divieti-coordinatore.test.ts` per i percorsi `/e/`.

**Trappola per le prove.** In una cartella nuova Claude Code chiede prima «Is this a project you trust?» con «No, exit» già scelto: un Invio lo **chiude**, e freccia giù + Invio mandati dal pty non sono stati presi. Per le prove reali usare una cartella già fidata (quella del progetto).
