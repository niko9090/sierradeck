---
titolo: "Scorciatoie da tastiera personalizzabili (0.28.0): dove stanno e le regole dei tasti"
quando: 2026-09-16T17:20:00+02:00
tag: ["ui", "tastiera", "scorciatoie", "preferenze", "workspace"]
---

Nicholas (16/09): «predisponiamo anche le shortcut per spostarsi tra
workspace e il resto, facciamoli personalizzabili».

- **Modulo puro** `src/shared/scorciatoie.ts`: le azioni (`AZIONI`), i tasti
  di fabbrica, `combinazioneDi(evento)` → stringa canonica («Ctrl+Shift+Tab»,
  «Alt+3»), `combinazioneValida`, `normalizzaScorciatoie`, `azionePer`,
  `doppioni`, `workspaceDaAzione`. Test in `tests/shared/scorciatoie.test.ts`.
- **Preferenza** `scorciatoie: Record<Azione, string>` in `preferenze.ts`
  (stringa vuota = spenta), normalizzata voce per voce.
- **Tabella viva** `src/renderer/scorciatoie-vive.ts` (stesso schema di
  `preferenze-vive.ts`): la Console la aggiorna dalle preferenze; il
  terminale (`Terminal.tsx`, `attachCustomKeyEventHandler`) chiede
  `azioneDelTasto(e)` e se è una scorciatoia risponde `false` → xterm non la
  prende. L'ascolto vero è in `Console.tsx`, `keydown` **in cattura** sulla
  finestra con `preventDefault`: senza, Alt+3 arriverebbe a Claude Code come
  ESC 3.
- **Chat accanto**: `src/renderer/fuoco-chat.ts` — il mosaico non ha una
  «chat attiva», si parte da `document.activeElement`, si cerca il
  `.riquadro` e si dà il fuoco alla `.xterm-helper-textarea` del vicino.
- **Pannello**: `SezioneScorciatoie.tsx` in Impostazioni → Generali.
  «Cambia» mette la riga in ascolto e **sospende** le scorciatoie vive
  (`sospendiScorciatoie`), altrimenti premere Ctrl+Tab per assegnarlo
  cambierebbe workspace.

## Regole dei tasti (perché queste e non altre)

- Si confronta `KeyboardEvent.code` (tasto fisico), non `key`: con la
  tastiera italiana Shift+1 è «!» e AltGr+E è «€».
- Niente Ctrl+lettera di fabbrica: Claude Code li usa quasi tutti (Ctrl+C,
  R, U, L, O, B, T…). Niente Ctrl+Alt: su Windows con tastiera italiana è
  AltGr. Ctrl+Shift+C/V restano copia/incolla (`appunti.ts`).
- Serve Ctrl o Alt, oppure un tasto funzione nudo: una lettera sola è
  scrittura.
- Con un doppione vale la prima azione nell'ordine di `AZIONI`; il pannello
  segna le righe in ambra.
