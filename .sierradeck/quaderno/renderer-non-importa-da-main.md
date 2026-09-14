---
titolo: "Il renderer non importa valori da src/main: il typecheck passa, la build dell'installer no"
quando: 2026-09-14T14:30:00+02:00
tag: ["build", "electron-vite", "renderer", "trappola", "pubblicazione"]
---

# Cosa è successo (0.27.0, 14 settembre)

`npm run typecheck` a 0 e 2289 test verdi, ma `npm run pacchetto` moriva
nella build del renderer:

```
src/shared/scrittura-atomica.ts (2:9): "randomUUID" is not exported by
"__vite-browser-external", imported by "src/shared/scrittura-atomica.ts".
```

Causa: `PannelloAccount.tsx` faceva `import { pcVivo } from
'../../main/progetti/posta'` (un **valore**, non un tipo). Vite segue la
catena `posta.ts → registro.ts → scrittura-atomica.ts → node:fs/crypto` e
nel bundle del browser quei moduli non esistono. Il typecheck non se ne
accorge: per TypeScript `node:` esiste ovunque.

# La regola

- Dal renderer (e dal preload) verso `src/main/**` si importano **solo
  tipi** (`import type { … }`): quelli spariscono alla compilazione.
- Una funzione pura che serve a tutti e due i lati sta in `src/shared/`
  **senza** import `node:` e senza import da `src/main`. Esempio: i tipi e
  `pcVivo` della posta stanno in `src/shared/posta.ts`; `src/main/progetti/posta.ts`
  li riesporta, così i test e il main continuano a importare da lì.
- Il test `tests/shared/posta.test.ts` controlla che il file condiviso non
  importi `node:`. Per un altro modulo condiviso, stesso guardiano.

# Come accorgersene prima della release

Il typecheck e i test non bastano: prima del `chore(versione)` fare
`npm run build` (è la prima metà di `pacchetto`/`pubblica`, dura mezzo
minuto). Se cade con «is not exported by __vite-browser-external», cercare
l'`import` senza `type` che dal renderer entra in `src/main`.
