---
titolo: "Riprendere una chat dal telefono: nel suo workspace, in una finestra sola (0.16.2)"
quando: 2026-09-07T14:30:00+02:00
tag: ["telefono", "workspace", "chat", "ripresa", "bug"]
---

# Il difetto

Dal tab Chat del telefono, toccare una chat «da riprendere» la apriva nel
workspace che la finestra aveva davanti, non in quello dove stava salvata:
la chat cambiava workspace (e al salvataggio successivo l'invariante «una
chat, un workspace» la toglieva da quello vero). Con due finestre nasceva
due volte, perché `client:apri` andava a **tutte** le finestre. Nicholas:
«il cellulare deve avere una visione generale delle chat ma non deve
interferire con i workspace».

# La correzione

- `index.ts` `riprendiSessione`: `workspaceDellaSessione(archivio, sessione)`
  dice dove vive; `finestraPerRipresa(dove, finestre)` (`consegne-layout.ts`,
  puro, provato) sceglie **una** finestra: quella che già mostra quel
  workspace (`workspaceDellaFinestra(winId)` = ricevuta del registro consegne
  in `ipc.ts`), altrimenti la prima viva. `client:apri` porta `workspace`.
- `App.tsx` `suApertura`: se `workspace` ≠ `workspaceCorrente()` prima
  `azioniDiFinestra().cambia(workspace)` (la stessa strada dell'autopilota),
  poi si cerca il riquadro con quella `sessionUuid`: se c'è (dopo il cambio
  c'è, perché il layout del workspace lo contiene) si fa solo `sveglia` se
  dorme; un `addPane` sarebbe la stessa conversazione due volte. Senza
  `workspace` (chat mai salvata) nasce dove sei, come prima.

# Da sapere

- Il cambio di workspace lo subisce la finestra scelta: se stai lavorando
  sul PC in un altro workspace, lo vedi cambiare. È inevitabile: una chat
  vive solo a schermo, nel suo workspace.
- «Riprendi» dal desktop (`ModaleSessioni`) è un'altra strada e apre nel
  workspace corrente per scelta dell'utente.
- Lato telefono (pagina e app) niente da cambiare: chiamano la stessa
  rotta `/api/sessioni/riprendi`. APK 2.25.2 solo per la regola «in ogni
  release l'APK».
