---
titolo: "Il menu dei workspace: con più di sei, il nome intero e un elenco (0.27.0)"
quando: 2026-09-15T16:45:00+02:00
tag: ["ui", "workspace", "fascia", "menu"]
---

Nicholas (15/09): «quando sono tanti vedo solo dei puntini praticamente.
metti un menu a tendina o qualcosa di figo». Le linguette `.ws__voce` hanno
`max-width: 120px` e con dieci workspace si leggeva «Prede…», «W…», «H…».

- `src/renderer/menu-workspace.ts` (puro, provato): `LINGUETTE_MAX = 6`,
  `serveIlMenu`, `filtraWorkspace` (senza accenti/maiuscole, ordine
  conservato), `contaChatPerWorkspace` da `workspace.dove()` (sessione →
  workspace).
- `src/renderer/components/MenuWorkspace.tsx`: il tasto con il nome intero
  di dove sei, il numero dei workspace e il pallino se altrove qualcuno
  chiama; la tendina (`.ws-menu__tendina`, velo trasparente per chiudere
  cliccando fuori, Esc) con tutti i nomi per esteso, ✓ sull'attivo, ● su
  chi chiama, «N chat»; casella di ricerca oltre gli 8 (Invio = il primo);
  in fondo «Crea, rinomina o elimina…» (il pannello di sempre).
- `Console.tsx`: fino a 6 workspace le linguette come prima; oltre, il
  menu. Il cambio passa da `cambiaWorkspace` (stesso salvataggio del layout).
