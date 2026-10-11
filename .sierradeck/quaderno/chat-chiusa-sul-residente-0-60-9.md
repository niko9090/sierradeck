---
titolo: "0.60.9: una chat chiusa da Nicholas sul PC di casa si chiude anche sui client"
quando: 2026-10-11T20:20:00+02:00
tag: ["altri PC", "riquadro remoto", "chiusura", "pagina", "app", "0.60.9"]
---

# Il difetto

Nicholas (11/10): «nel PC residente ho chiuso una chat e qui continua a cercarla; se la chiudo sul residente deve chiudersi anche sul client».

Nel registro delle 17:47 c'era la chat DDJ. La casa era stata corretta verso il portatile, che rispondeva «la chat non è aperta là», e il riquadro di qui restava su «Riapri là». Chi guarda da lontano vedeva solo «non aperta» e non poteva distinguere una chiusura voluta da un riavvio, un aggiornamento o un guasto, dopo i quali la chat va davvero ripresa.

# Come funziona

**Il PC di casa scrive.**
- `chiuse.json` nei dati (`src/main/chiuse-store.ts`) e regole in `src/shared/chiuse.ts`.
- «Chiusa» la scrivono solo:
  - la × del riquadro (`Mosaic.tsx`);
  - «Chiudi» dal telefono (`client.suChiusura`);
  - «Chiudi» da lontano, cioè l'azione `chiudi` di `/api/chat/chiudi` attraverso il ponte (`suAzione`).
- Tutte e tre passano dall'IPC `chiuse:segna`. Riavvii, aggiornamenti e guasti non passano di qui, quindi non contano.
- Registro: `[chiuse] «titolo» (id) chiusa da te (dal telefono|da lontano)…`.

**La riapertura toglie lo stato.**
- `impostaAllaRiapertura` in `ipc.ts` è chiamata da `avvia`, cioè da ogni pty acceso per quella sessione: finestra, sottofondo, «Riapri là», scrivere da lontano.
- Registro: `[chiuse] … riaperta: non è più «chiusa»`.

**Pubblicazione.**
- `/api/stato` ha `chiuse: [{sessione, il}]`: 30 giorni, al massimo 200 voci, nessun campo se è vuoto.
- `remoto:stato` le passa al riquadro.

**Il client (PC):**
- `RiquadroRemoto.tsx` usa `chiusaDopo(chiuse, sessione, remoto.dal)`. Il riquadro si chiude (`closePane`) e il Core scrive `[apertura] «titolo» (id): chiusa sul PC di casa (PC alle HH:MM): chiudo anche qui…`.
- **Vale l'ultima azione:**
  - `remoto.dal` è l'ora in cui il riquadro è stato aperto qui. La mette `addPane`/`rendiRemoto` e la salva il layout (`workspace.ts`).
  - Un riquadro aperto dopo la chiusura resta.
  - Un riquadro senza `dal` (salvato prima della 0.60.9) vale come aperto da sempre.
- Non si chiude mentre «Avvia là in sottofondo» è in corso.

**Pagina e app:**
- La vista della chat tornava già all'elenco quando la chat spariva.
- Ora, se la sessione è in `chiuse`, lo dicono con l'ora: `notaChiusa` nella pagina, `ChiuseDaTe.kt` + `AvvisoChiusa` in `Chat.kt`.

**Al contrario:** chiudere qui un riquadro remoto non tocca la chat sul PC di casa (chi guarda e basta). Il riquadro non torna da solo dopo un riavvio, perché il layout locale lo decide questo PC.

# Trappole

- **Orologi diversi:** il confronto fra `il` (orologio del PC di casa) e `dal` (orologio di qui) assume che i due siano allineati a pochi secondi, come con l'ora di Windows sincronizzata.
- **Chiusure fatte con una versione precedente non contano:** non sono mai state scritte. Il riquadro DDJ di Nicholas, chiuso là con la 0.60.8, va chiuso a mano una volta.
- **Test:**
  - `tests/shared/chiuse.test.ts`;
  - `tests/main/client-rotte.test.ts` («porta le chat chiuse da te»);
  - `ChiuseDaTeTest.kt`.
