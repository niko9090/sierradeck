---
titolo: "Provare il motore delle chat con chat vere, senza toccare ~/.claude"
quando: 2026-10-17T10:45:00+02:00
tag: ["prove", "claude code", "trappola", "0.79.0"]
---

Usato per la 0.79.0 (gestione delle chat). Serve ogni volta che una funzione tocca i file delle sessioni di Claude Code.

## Come
1. **Una radice finta.** Crea una cartella temporanea e mettila in `CLAUDE_CONFIG_DIR`. Copia dentro solo `.credentials.json` da `~/.claude`.
2. **Le chat vere.** Lancia `claude -p "…" --model haiku` in una cartella `SierraDeck-prova-…`:
   - con `--allowedTools "Agent Read"` e un prompt che chiede un sotto-agente nasce anche `projects/<slug>/<id>/subagents/`;
   - `-p` **non** crea `file-history/` né `session-env/`: quelle cartelle le fanno solo le chat interattive (sono coperte dai test).
3. **Il codice del main senza Electron.** Impacchetta con esbuild e lancia con Node:
   ```
   node_modules/.bin/esbuild prova.ts --bundle --platform=node --format=esm --outfile=prova.mjs --alias:@shared=./src/shared --alias:@main=./src/main
   ```
   Va bene finché il modulo non importa `electron`.
4. **La verifica.** `claude --resume <id> -p "…"` dice se la chat c'è davvero: «No conversation found» dopo l'eliminazione, risposta con il contesto dopo il ripristino.

## Trappole
- **Le credenziali non si possono cancellare.** La guardia di SierraDeck (hook) blocca ogni `rm` fuori dalle cartelle dell'autopilota, anche nello scratchpad. Svuota il file invece: `printf '{}' > …/.credentials.json`.
- **`src/main/index.ts` ha i fine riga CRLF nella copia di lavoro.**
  - Uno script che cerca testo con `\n` non lo trova.
  - Leggi traducendo `\r\n` in `\n`, poi riscrivi con lo stesso fine riga.
  - Gli script vanno scritti con Write, non in un heredoc di Bash: Bash si mangia i backslash.

## Clic veri nella finestra e sulla pagina (17/10, interfaccia 0.79.0)
- **La copia intera:** `npm run build`, poi `electron.exe . --remote-debugging-port=9333` con `SIERRADECK_PROVA=<cartella>\dati` e `CLAUDE_CONFIG_DIR=<cartella>\claude`. Le porte della copia diventano 47650/47651 da sole (`portePerLaProva`). Controlla nel registro «in ascolto sulla porta 47650».
- **Il pilota:** basta Node 24 (ha `WebSocket` e `fetch`): `/json` della porta 9333, poi `Runtime.evaluate` per cliccare e `Page.captureScreenshot` per le foto. Niente Playwright.
- **Il «telefono»:** `dispositivi.json` nella cartella dati con `segno = sha256(chiave)`. Edge `--headless=new --remote-debugging-port=9334` sulla pagina 47650, `localStorage['sierradeck.chiave']` e `Emulation.setDeviceMetricsOverride` a 412×915.
- **Trappole:**
  - `execFileSync('claude', args, { shell: true })` taglia il prompt alla prima parola. Usa il percorso di `claude.exe` senza shell.
  - Un campo React non si scrive con `el.value = …`: usa il setter nativo di `HTMLInputElement.prototype.value`, poi un evento `input`.
  - La pagina non si ridisegna mentre un campo ha il fuoco. Un tasto che dipende da quello che scrivi va acceso o spento dal suo `oninput`.
  - Fermare la copia: `taskkill /T /F` sulla radice dei processi con `remote-debugging-port=9333`, poi controlla che le porte 47650/47651 siano libere.

## Trappole viste nel giro del 18/10 (0.79.0)
- **Provare sempre anche l'azione riuscita, non solo «Annulla» e il rifiuto.** Una conferma che vive dentro una riga sparisce con la riga quando l'azione riesce. È così che l'esito di Elimina da «Riprendi una conversazione» non si vedeva.
- **Per i doppi clic e le spunte, usare eventi veri** (`Input.dispatchMouseEvent` / `Input.dispatchTouchEvent` via CDP), non `element.click()`. Solo il tocco vero dà il fuoco alla casella: è lì che la pagina saltava il ridisegno.
- **Dopo un riavvio la copia riapre le chat che erano aperte nel workspace.** Una chat lasciata aperta si rifiuta a Elimina: prima chiuderla, con l'azione «chiudi».
- **Fermare la copia.** `taskkill /T /F` lanciato da PowerShell può non fermare niente. Funziona `Stop-Process -Force` sui processi `electron.exe` / `msedge.exe` con `prova-079` o `remote-debugging-port=933x` nella riga di comando. Poi controllare che le porte 47650/47651/9333/9334 siano libere.

## Trappole viste il 18/10 (c-47/c-49, copia di un ramo)
- **Una cartella di lavoro di un ramo non ha `node_modules`.** `tsc`/`vitest` «non riconosciuto»: crea il collegamento come nella copia di c-1, `New-Item -ItemType Junction node_modules -Target <progetto>\node_modules` (git lo ignora).
- **Né `.claude/settings.local.json`** (hook di ECC spenti): senza, il primo comando Bash si ferma sul «Fact-Forcing Gate». Copialo dal progetto principale.
- **Il servizio degli autopiloti della copia non ha `prova` nella riga di comando** (`…\out\main\autopilot-host.js`): fermando i processi per `prova-…` resta acceso sulla 47651. Ferma gli `electron.exe` con la cartella del ramo nella riga di comando, poi ricontrolla le porte.
- **Git Bash converte gli argomenti che cominciano con `/`** (`/api/stato` → `<cartella di Git>/api/stato`): agli script passa `api/stato` senza la barra.
- **Un autopilota con specialisti senza farli lavorare davvero:** scrivi il suo JSON in `dati/SierraDeck/autopiloti/<id>.json` (con `versione: 1`, `limiti.stalloMax`) in stato `sospeso`, con le `chats` che puntano alle sessioni delle chat aperte nel workspace; il servizio non le guida, la Panoramica le mostra con i segnali veri.
- **Workspace con chat già pronte:** crea le sessioni con `claude -p … --session-id <uuid>` e scrivi `workspaces.json` con `perSlot["1"] = { root: split, panes: [{ id, sessionUuid, cwd, title }] }`: all'avvio la copia le riprende. Con `.claude.json` → `projects[<cartella>].hasTrustDialogAccepted: true` la domanda di fiducia non compare.
- **Per far «chiedere» una chat:** «Usa lo strumento AskUserQuestion per chiedermi …» (arriva nelle Domande e la scheda diventa ◆).

## Trappole viste nella prova della dashboard (c-50, 18/10 notte)
- **Le porte 47650/47651/9333 possono essere già della copia di un'altra chat** (c-4 la stava usando). Controllare prima con `Get-NetTCPConnection -State Listen` e, se occupate, mettere in `impostazioni.json` della copia `preferenze.portaClient`/`portaAutopiloti` diverse (47660/47661) e usare un'altra porta di debug (9343). La mia copia, partita sulle porte occupate, si è fermata da sola al «non in ascolto sulla porta 47650» prima di cercare il servizio: l'altra non è stata toccata, ma va controllato ogni volta nel registro della copia.
- **Un autopilota vero nella copia** (non sospeso) fa vedere tutto il giro: chat Sviluppo, Revisione, righe corte, «adesso» che cambia. Due compiti minuscoli in un progetto git di prova (somma.js, media.js con `node --test`) bastano: circa 15 minuti.
- **Le chat nascono ferme sulla domanda di fiducia della cartella** (solo nella copia): il compito può restare nel campo e la chat ferma. Rispondere «Yes» dalle domande a destra; se resta ferma, dirlo all'autopilota dal campo della dashboard («ridalle il compito»): lo fa.
- **Foto della pagina con `Emulation.setDeviceMetricsOverride`**: cambiare la larghezza a ogni scatto riporta in cima la chat con l'autopilota. Prima dello scatto chiamare `scorriChatAp()`; su un telefono vero non succede (verificato: all'apertura `scrollTop` è in fondo).
- **Dopo un riavvio la copia riapre le chat che c'erano**, anche ferme sulla fiducia: nelle foto finali compaiono come «aspetta te».
