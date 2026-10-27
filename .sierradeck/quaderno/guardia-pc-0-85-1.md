---
titolo: "Guardia del PC (0.85.1): con il PC al limite niente chat nuove né comandi pesanti"
quando: 2026-10-23T22:50:00+02:00
tag: ["0.85.1", "guardia-pc", "autopilota", "indicatore", "prestazioni"]
---

**Perché.** Il 23/10 sera il processore era al 100%, con 15 processi `claude` e un programma esterno pesante. I posti delle chat (0.82.0) scendevano, ma le chat nuove partivano lo stesso fino al minimo, e le chat lanciavano gradle e vitest per conto loro.

**La regola** (`src/autopilot-host/guardia-pc.ts`): il PC è «carico» se il processore resta **sopra l'85% per un minuto** (`giudicaMisura` conta da quando è sopra; una misura sotto azzera) oppure se la **memoria libera è sotto il 15%** (subito). La misura viene da un `creaMisuratore()` tutto suo (media mobile), separato da quello dei posti, perché le due cose lo chiamano con ritmi diversi.

**Dove agisce:**
- **chat nuove**: `tettoApertura` in `server.ts` tiene il tetto alle chat già al lavoro. Le chat che lavorano non si fermano. Per non restare mai fermi, se l'autopilota non ha nessuna chat al lavoro, dopo `ATTESA_MASSIMA_MS` (15 min) di PC carico se ne apre una lo stesso;
- **criteri pesanti** (`ePesante`: gradle, vitest, npm test, build, adesso anche `electron-builder`): `conTurni(…, TURNI_PC, guardia)` aspetta la guardia *dentro* il turno, così resta uno solo per volta in tutto il servizio e dietro non parte niente. Si rimisura ogni 15 s; dopo 15 minuti parte lo stesso, scritto nel registro (`[guardia-pc] parte … anche se il PC è carico`);
- **comandi pesanti delle chat**: l'hook PreToolUse (`/hook/pretool`) risponde «no» con `giudicaPesanteConPcCarico`: «rimanda, continua con altro, riprova fra qualche minuto, non chiudere programmi». Non è un divieto: non finisce nelle decisioni, solo una riga `[guardia-pc]` nel registro.

**Nell'indicatore**: `GET /autopiloti` aggiunge `pcCarico` agli autopiloti al lavoro; `indicatoreDi` scrive in ambra «PC carico: aspetto — motivo; consuma di più X (N% del processore | N MB)». Passa dal Punto, quindi è uguale su PC, pagina e app (android/ non cambiato).

**Il programma più pesante**: `Get-CimInstance Win32_PerfFormattedData_PerfProc_Process` in CSV (solo lettura), letto al più ogni 2 minuti e solo quando il PC è carico. Il processore è sommato sui core (si divide per i processori), le istanze `nome#N` si sommano, `_Total` e `Idle` si saltano. **Nessun programma viene chiuso**: c'è un test che controlla che il comando legga e basta.

**Trappola**: la guardia è una per servizio (creata in `index.ts`), condivisa fra server e turni. Nei test del server si passa una guardia finta (`guardiaPc: { valuta, stato, attendi }`). Senza `guardiaPc` il servizio si comporta come prima.

Test: `tests/autopilot-host/guardia-pc-0-85-1.test.ts`.

**Trappola vista unendo (23/10 notte)**: il lavoro sul testo fluido (0.85.1) ha spostato il campo di scrittura da `ChatAutopilota.tsx` a `CampoChatAutopilota.tsx`. Due test che leggono il sorgente (`copia-incolla.test.ts`, `grafica-0-81-0.test.ts`) cercavano ancora nel file vecchio e facevano fallire `tests/main` in main. Sono stati corretti da c-148. Chi sposta un pezzo di interfaccia deve cercare `readFileSync('src/renderer/components/…` nei test.
