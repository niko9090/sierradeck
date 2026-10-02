---
titolo: "Comandi dei criteri controllati alla scrittura e pannello «Salute del sistema» (0.44.0)"
quando: 2026-10-02T17:45:00+02:00
tag: ["autopilota", "criteri", "salute", "android", "pagina", "decisione-nicholas"]
---

Punti 7 e 4 della lista scelta da Nicholas il 02/10: la tappa A della consegna c-2.

# Comandi dei criteri (punto 7)

- **Le regole pure** sono in `src/shared/controllo-comandi.ts`, con `esaminaComando`, `vagliaCriteri` e `messaggioCriterio`.
  - Sono **errori**, e il comando non entra:
    - le virgolette sbilanciate;
    - un `$` che la shell espande dentro `bash -c "…"` o `sh -c "…"` (`$v`, `$(…)`, `${…}`, `$1`). Non `$/` né `\$`, che la shell lascia stare;
    - `node -e` o `node -p` che non si compila, letto come lo passa la shell: tolte `\"`, `\\`, `\$`, e compilato con `new Function`, senza eseguirlo.
  - Un file letto che non esiste è un **avviso**: il lavoro potrebbe doverlo creare. Contano `test -f`, `node x.js`, `readFileSync('…')`, `require('./…')` e l'ultimo argomento di `grep` o `cat`.
- **Dove si controlla**, tutto nel servizio (`src/autopilot-host/server.ts`):
  - `applicaCambio`, che serve dialogo, PATCH dal pannello e «parla»: un comando nuovo con errori rifiuta il cambio, con il messaggio;
  - `mettiInPronto`, la preparazione: il criterio resta ma senza comando (lo giudica il supervisore), con il messaggio e gli avvisi nel diario;
  - `correggiCriterio` del supervisore: non si applica, e il supervisore legge perché nella risposta allo Stop.
- **Casi veri nei test.** Il primo è il criterio del 01/10 trovato nel file dell'autopilota, decisione «criterio corretto»: `bash -c "v=$(node -p \"require('./package.json').version\") && echo $v | …"`. Il secondo è la forma `f=$(find …); grep … $f` della chat NexoraOS.
  - I criteri che il supervisore usa oggi (node -e tra doppie con `$/` nella regex, `bash -c '…'` tra singole) **passano**.

# «Salute del sistema» (punto 4)

- **Le regole pure** sono in `src/shared/salute.ts`.
  - `componiSalute` mette in fila le voci: Drive, PC, aggiornamento, errori, consegne. Ognuna ha tono, titolo, spiegazione per esteso, «cosa fare» e azioni.
  - `erroriDalLog` legge le righe `[ERRORE]` e quelle «fallito / non riuscito / rifiutato / non partito» delle ultime 6 ore, le raggruppa per messaggio (numeri e id tolti) e le mette in ordine dalla più recente.
- **Il PC.** `leggiSalute` è in `index.ts` e usa:
  - `contoDrive` e `avvisoDrive`;
  - `postino.pc()` con `remoto.statoDi` (bussa) e `stradaDi`;
  - `aggiornamenti.stato().tentativoFallito`;
  - il registro di oggi e di ieri;
  - le `istruzioni` di ogni autopilota con esito non partita o persa nelle ultime 24 ore.
  - Si legge con l'IPC `salute:leggi` e con `GET /api/salute`, che sta **dietro la chiave**: in `rotteClient`, non in `rotteLibere`.
- **L'interfaccia sul PC** è `PannelloSalute.tsx`, dal tasto «♥ Salute» della console.
  - Azioni: Account → Drive, apri il registro, «Installa» (finestra delle note), scarica a mano, apri gli autopiloti, ribussa.
- **La pagina del telefono** ha la piastrella «Salute».
- **L'app** ha `Salute.kt`, una sezione della scheda Computer.
  - Dal telefono «Installa» e «Ricollega il Drive» non si fanno: si fanno dal computer o in Aggiornamenti, con la loro conferma.
  - Prima della 0.44.0 la sezione è spenta (`FunzionePc.SALUTE`).
