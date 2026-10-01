---
titolo: "L'invio dopo l'incollaggio non manca mai in silenzio (0.37.5)"
quando: 2026-10-01T20:30:00+02:00
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
