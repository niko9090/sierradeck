---
titolo: "Efficienza: dove si spreca e come si ottimizza senza rischi"
quando: 2026-08-26T22:35:00+02:00
tag: ["efficienza", "performance", "polling", "cache", "idle"]
---

## Il criterio
L'app fa **lavoro periodico continuo** (polling) e **I/O sincrono ripetuto** sul
thread main/servizio. Il criterio adottato: **non ottimizzare a naso**, misurare
i punti caldi, e correggere solo dove il guadagno è reale e il rischio nullo. Per
le cache, lo schema sicuro è quello dell'indexer: **rileggere+parsare solo quando
`mtime`+`size` cambiano** — niente cache stantìa perché le scritture sono atomiche
(temp + rename → l'mtime cambia) e regge anche modifiche esterne al file.

## Fatto — RILASCIATO come 0.12.8 (commit 13e9360, test 1663 verdi)
**Renderer (CPU a riposo):**
- `DomandaModale`: l'orologio da 1s batteva **sempre** (re-render/sec 24/7 anche
  senza domande). Ora parte solo con una domanda a schermo.
- `App.tsx` `ricaricaAutopiloti` (polling 5s): `setAutopiloti` riceveva un array
  nuovo ogni giro → ridisegnava mezza UI ogni 5s a vuoto. Ora aggiorna solo se la
  **firma JSON** cambia. Idem `doveSta`, e l'IPC `autopilotiAlLavoro` solo se il
  conteggio cambia. (Lo stesso idioma di dedup era già in `setPensano`, riga ~182.)

**Main / servizio (I/O sincrono ripetuto):**
- `autopilot-host/archivio.ts` `elenca()`: rileggeva+parsava **tutti** i file
  autopilota da disco a ogni chiamata — servita da `/api/stato` (telefono, ogni 2s)
  e dalla guardia (60s). Ora cache per-file su mtime/size: `statSync` al posto di
  `readFileSync`+`JSON.parse`+`parseAutopilota`. Era l'I/O più caldo dell'app.
- `main/workspace-store.ts` `leggi()`: `workspaces.json` riletto+parsato a ogni
  `/api/stato` (2s) e a ogni consegna (~1,5s). Ora stessa cache mtime. Sicuro
  perché le operazioni workspace sono **pure** (vedi `workspace-operazioni.ts`:
  creano un nuovo archivio, non mutano quello letto) → riferimento condiviso ok.

Anche fatto in 0.12.8: **`avviaRitiro`** backoff adattivo (a vuoto sale fino a 6s,
torna a 1,5s appena arriva una consegna) e **`scope.leggiOgg`** cache mtime su
`settings.json`/`.claude.json` (riletti a ogni apertura chat). L'utente HA
approvato il backoff adattivo.

## Ancora da fare (ordinato per impatto) — [[errori-invisibili-e-schermo-bianco]]
1. **`ipc.ts`/`index.ts` `sessioni:consumi`** — `listSessions(db)` fa `SELECT *`
   su tutte le sessioni + materializza tutto, quando a `riassumiConsumi` serve
   tutto tranne `primo_prompt`. On-demand (pannello consumi), guadagno modesto.
2. **Altri store JSON senza cache** (`impostazioni`, `provider`, `etichette`,
   `dispositivi`, `istantanee`, `finestre`, `negozio/azioni`): tutti **on-demand**
   (handler IPC), non timer → non sono drenaggio a riposo, priorità bassa. Stessa
   cache mtime se serve. NB: `scope.tutte()` NON va cache-ata a riferimento
   condiviso, perché `imposta` la muta (`delete mappa[cwd]`).
3. **`db.ts` `upsertSession`**: `db.prepare()` a ogni riga nel loop (better-sqlite3
   ha una cache statement, impatto basso). Preparare una volta fuori dal loop.
4. **`registro.ts`**: `file` (nome-per-giorno) calcolato **una sola volta** all'avvio
   → in sessioni lunghe oltre mezzanotte il log non ruota. Nit di correttezza.

## Prossime fasi (roadmap utente, 26/08)
Dopo l'efficienza: (1) **sistemare l'APK Android** (è indietro sul desktop e non
funziona — il client mobile è la pagina-via-pairing); (2) **restyling grafico
completo**; (3) **app nativa, non webview** (da chiarire se = Android nativo al
posto della pagina, o desktop nativo al posto di Electron — quest'ultimo enorme).
Vedi [[sierradeck-app-mobile-indietro]].

## Cose verificate SANE (non toccare)
Indexer (incrementale size+mtime, streaming), buffer scrollback pty (tetto 256KB,
scarto dalla testa), `coda-layout` (scadenza 15s), Map/Set di stato autopilota in
`server.ts` (add/delete bilanciati). L'unico `ultimoTurno` non ripulito è un
`number` per id: perdita trascurabile.
