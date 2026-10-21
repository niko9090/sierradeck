---
titolo: "Pagina del telefono 0.83.0: le quattro voci dell'app (Adesso, Chat, Progetti, Altro) — com'è fatta e le trappole"
quando: 2026-10-21T15:30:00+02:00
tag: ["pagina", "telefono", "navigazione", "indietro", "0.83.0", "c-516", "trappole"]
---

La pagina servita dal PC (`src/main/client-pagina.ts`) ha le stesse quattro voci dell'app (c-516, 21/10). La mappa funzione per funzione sta in `app-android-0-83-0.md` § 5; l'app in `app-android-navigazione-0-83-0.md`.

## Dove sta cosa

- **Regole pure** in `src/shared/navigazione-telefono.ts`: `postoIniziale`, `toccaVoce`, `scegliLinguetta`, `apriSezioneAltro`, `indietroTelefono`, `versoDestinazione`, `pannelliDelPosto`, `SEZIONI_ALTRO`. Sono le stesse di `Navigazione.kt` e finiscono nella pagina con `.toString()`.
- **Stato della pagina**: `posto` = `{ voce, linguette, sezione }`; la vecchia `scheda` non c'è più.
  - `inVista('file')` dice se si vede una delle sette destinazioni di prima.
  - `aperto('drive')` vale se il pannello è aperto a mano oppure se lo mostra la linguetta.
- **Contenuto per voce** (`schermate` in `pannello()`):
  - **Adesso**: domande in cima, poi autopiloti, «Affida», «In moto adesso». Con un autopilota aperto c'è solo lui.
  - **Chat**: Chat · Workspace · Negozio.
  - **Progetti**: Progetti · File · Drive (il Drive con le code).
  - **Altro**: elenco di 9 sezioni con Cerca. Una sezione delle impostazioni = la sua piastrella `data-sezione`, ritagliata da `sezioneImpostazioni()`.
- **Salti di prima**: `vaiScheda('domande'|'file'|…)` funziona ancora e porta nella voce giusta (`versoDestinazione`).
- **«Chiudi» di un pannello** che la linguetta mostra già (Drive, code, Negozio, PC, Consumi): in `apriPannello` vale «indietro».

## Indietro

La regola è uguale all'app: menu → dettaglio (anche una cartella alla volta nei File) → elenco di Altro o prima linguetta → Adesso → esce. I passi 1-2 stanno in `daChiudere()`, i passi 3-5 in `indietroTelefono`.

## Trappole

- **Chrome salta, col tasto indietro, le voci della cronologia aggiunte senza un tocco** (history manipulation intervention). Rimettere una voce «di guardia» dentro `popstate` farebbe uscire dalla pagina al secondo indietro.
  - Rimedio: `armaIndietro()` spinge **al tocco** tante voci quanti sono i passi (`passiIndietro()`); dentro `popstate` se ne rimette una solo se sono finite.
  - Tornati ad Adesso con i tasti, le voci in più si tolgono con `history.go(-n)`, ignorando quella popstate (`ignoraPopstate`).
  - Provato con il «indietro» vero del browser (chrome-devtools `navigate_page back`), non con `history.back()` da script.
- **Le funzioni iniettate con `.toString()` arrivano riscritte da esbuild** (apici doppi, spaziature). I test non devono cercarne il testo (`"p.voce === 'chat'"` non c'è): vanno provate importandole, o estratte ed eseguite.
- **Backtick in un commento dentro il template** (anche `` `nome` `` in un JSDoc) chiude il template: la pagina non compila. Usare «nome».
- **`dump-pagina.test.ts` non scrive in AppData**: la guardia dei test lo blocca. Scrivere in `note/` del worktree, che git ignora.

## Come guardarla senza PC vero

1. `PAGINA_FUORI=<worktree>/note/prova-516/pagina-dopo.html node node_modules/vitest/vitest.mjs run tests/main/dump-pagina.test.ts`
2. Server finto `note/prova-516/server.js <pagina.html> <porta>`: dati di prova, `/#codice=123456` accoppia.
3. Aprirla in chrome-devtools a 412×860 mobile.

Le foto prima e dopo (`prima-*.png`, `dopo-*.png`) stanno in `note/prova-516/`, fuori da git.

## Non fatto qui

- Misure della pagina e prova sull'emulatore: le fanno le altre chat della 0.83.0. Questa pagina non cambia le chiamate al PC: legge entrando, come prima.
