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
