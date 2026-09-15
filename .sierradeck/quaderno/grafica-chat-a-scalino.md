---
titolo: "«La grafica della chat si sminchia»: righe a scalino dopo un ridimensionamento (0.27.0)"
quando: 2026-09-15T16:20:00+02:00
tag: ["terminale", "xterm", "conpty", "ridimensionamento", "ui"]
---

# Il sintomo (foto di Nicholas, 15/09 16:07)

Nel riquadro di una chat le righe di Claude Code compaiono a scalino
(ognuna spostata di qualche colonna rispetto alla precedente), una tabella
disegnata in diagonale, il riquadro di destra che si sovrappone. Nella
stessa foto, in alto, c'è la striscia «1 chat arrivata dal Drive»: è
appena comparsa e ha spinto giù i riquadri.

# La causa

Il riquadro cambia misura più volte in un attimo (la striscia entra con
un'animazione di 160 ms, un pannello si apre, il diario si allarga):
`ResizeObserver` → `fit` → `pty.resize` a ogni passo. ConPTY riceve tre o
quattro larghezze diverse in pochi ms e ridisegna il buffer su una
larghezza già vecchia; Claude Code (Ink) ridisegna a sua volta con le
colonne sbagliate. xterm tiene le righe così come arrivano: lo scalino.

# Le correzioni

1. **Niente più strisce che entrano ed escono** sopra il mosaico: il lavoro
   con il Drive, le chat arrivate e il riavvio sono fumetti fuori dal flusso
   (`fumetti-sincronia.md`). Sparisce la causa più frequente.
2. **Una misura sola, quando è ferma** (`Terminal.tsx`,
   `RIPOSO_RIDIMENSIONAMENTO_MS` = 120 ms): il ridimensionamento del pty
   parte solo quando il riquadro ha smesso di muoversi.

# Se ricapita

Ridimensionare un pelo la finestra (o il diario) fa ridisegnare tutto: è
il rimedio a mano. Se si vede ancora spesso senza strisce, il sospetto
successivo è il riaggancio dopo un cambio di workspace (`aggancio.ts`,
scrollback ricostruito su una larghezza diversa).
