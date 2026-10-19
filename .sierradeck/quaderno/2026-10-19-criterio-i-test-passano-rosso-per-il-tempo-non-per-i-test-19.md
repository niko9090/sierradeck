---
titolo: "Criterio «I test passano» rosso per il tempo, non per i test (19/10 11:20)"
quando: 2026-10-19T11:22:46.869Z
tag: ["autopilota"]
---

c-7 ha lanciato `npx vitest run --maxWorkers=2` nella cartella principale: 4194 test passati, 2 saltati, nessun rosso, esito 0. Il giro intero però dura 863 s (circa 14,5 minuti) e quasi metà del tempo va nell'import dei moduli. Il criterio con --maxWorkers=2 è rosso con ogni probabilità perché scade il tempo concesso alle verifiche, non perché un test cade. La mia correzione a --maxWorkers=4 è stata rifiutata. Strade possibili: alzare il tempo limite del criterio nel programma (c-11), oppure dividere la suite in due criteri (tests/autopilot-host e il resto), oppure tornare ai worker di default e rendere stabili i test sensibili al carico (531799e l'ha già fatto per quattro). Le righe «AttachConsole failed» di node-pty sono innocue.
