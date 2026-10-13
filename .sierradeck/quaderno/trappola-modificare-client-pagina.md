---
titolo: "Trappola: modificare client-pagina.ts con uno script"
quando: 2026-10-13T04:40:00+02:00
tag: ["trappola", "pagina", "telefono", "script"]
---

`src/main/client-pagina.ts` è **un unico template literal** che diventa lo script della pagina del telefono. Modificarlo con uno script (Python, Node, sed) ha tre trappole, tutte incontrate nella notte della 0.70.0:

1. **Gli apici negli `onclick`**: nel sorgente TS serve `\\'` (diventa `\'` nella pagina). Uno script scritto con una stringa JS/Python che contiene `\\'` produce `\'` nel file: **un backslash in meno**, e la pagina si rompe. Rimedio: dopo lo script, cercare il pezzo nuovo e raddoppiare (`split(B + "'").join(B + B + "'")` con `B = String.fromCharCode(92)`), oppure usare lo strumento Edit.
2. **`sed` e gli heredoc di bash mangiano i backslash** (`\\r\\n` diventa un a capo vero). Gli script vanno scritti con lo strumento Write e lanciati, non composti in linea.
3. **CRLF dopo un commit**: appena git tocca il file, nella copia di lavoro le righe finiscono in `\r\n`. Uno script che cerca `'...\n'` non trova più niente («trovato 0»). Rimedio: leggere normalizzando (`split(CR+LF).join(LF)`) e riscrivere come era (CRLF se lo era), con `CR = String.fromCharCode(13)`.

**Funzioni della pagina provate nei test**: i test le estraggono una per una (`estrai('nome')`), quindi devono essere **autosufficienti** (niente variabili globali della pagina se non `esc`/`escJs`, che il test aggiunge con `riga('const esc =')`). Esempi: `tests/main/quaderno-pagina.test.ts`, `tests/main/account-pagina.test.ts`.
