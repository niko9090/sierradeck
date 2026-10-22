---
titolo: "Errori dell'interfaccia del 21/10 (0.84.1): grezze, sierradeck:al-telefono, chat finite senza cartella"
quando: 2026-10-22T10:05:00+02:00
tag: ["0.84.1", "errori", "renderer", "domande", "workspace"]
---

# Errori dell'interfaccia del 21/10

Trovati in `%APPDATA%\SierraDeck\errori\errori-app.json` (versione 0.84.0). Ramo `ap/ap-f1e631f5/c-76`.

## 1. RiquadroRemoto: «Cannot read properties of undefined (reading 'join')» — 2 volte
- **Causa:** la risposta a `/api/storia` di un altro PC (LAPTOP, rete locale) arrivava senza `grezze`; il riquadro faceva `storia.grezze.join(...)` e React smontava tutto.
- **Correzione:** `storiaRemotaSicura()` in `src/shared/pc-remoto.ts`: senza `grezze` valgono le righe pulite, senza nemmeno quelle lo schermo è vuoto. Usata sia nel main (`remoto:storia`) sia nel riquadro (`setStoria`).

## 2. `pannello:mostraDomande` rifiuta «sierradeck:al-telefono» — 12 volte
- **Causa:** le domande del programma stesso hanno un autopilota finto `sierradeck:<cosa>` (`al-telefono`, `rimozione`, `quaderno-personale`). `decidiColonnaDomande` le metteva fra le `linguette`, e il main le convalidava come id di autopilota → eccezione. In più non apparivano nella colonna: nessuno le vedeva.
- **Correzione:** `eDomandaDelProgramma()` e `haLinguetta()` in `src/shared/domande-conversazioni.ts`: le domande del programma stanno nella **colonna** (si aprono e si rispondono lì), mai fra le linguette. Il main ignora in silenzio quegli id prima della convalida.
- **Trappola:** ogni nuovo `autopilotaId: 'sierradeck:…'` è una domanda di colonna. Non dargli un id da autopilota vero.

## 3. Chat finita che riparte nella copia di lavoro cancellata — 36 righe rosse
- **Caso vero:** c-34 (sessione `d653be68…`), stato «finita» nell'autopilota, copia `…sierradeck-wt\ap-f1e631f5-c-34` tolta dopo l'unione. Il suo riquadro era ancora nel layout salvato del workspace «SierraDeck» (senza il campo `autopilota`); a ogni passaggio a quel workspace partiva `pty:spawn` → «cwd non accessibile». **Non** era fra le chiuse (`chiuse.json`) né nel recupero: per questo serve anche il controllo «finita di un autopilota».
- **Correzione:** `src/shared/chiusa-senza-cartella.ts`. Nel main, `pty:spawn` chiede **solo se la cartella manca** (`impostaChiusaSenzaCartella`, async): chat chiusa, nel recupero o finita di un autopilota → errore con prefisso `CHAT_CHIUSA_SENZA_CARTELLA:`; il riquadro (`aggancio.ts` → `Terminal.tsx`) toglie se stesso con `closePane` e scrive una riga nel registro. La conversazione resta (chiuse/recupero).
- Una chat **non** chiusa con la cartella sparita fa come prima: diagnosi «La cartella di questa chat qui non c'è più» con «Scegli la cartella».

Test: `tests/shared/errori-interfaccia-21-10.test.ts` (14).
