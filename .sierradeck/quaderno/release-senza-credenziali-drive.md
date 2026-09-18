---
titolo: "La 0.29.0 ha spento il Drive a chi l'ha installata: installer costruito senza le credenziali OAuth (18/09/2026)"
quando: 2026-09-18T17:40:00+02:00
tag: ["release", "drive", "oauth", "incidente", "portatile", "trappola"]
---

# Cosa è successo

La 0.29.0 è stata costruita sul portatile (asus), dove non c'era
`google-oauth.json` nella radice del repo né `SD_GOOGLE_CLIENT_ID/SECRET`
nell'ambiente. `electron.vite.config.ts` in quel caso **non fallisce**:
incastona stringhe vuote (scelta voluta per chi vuole solo provare a
compilare). Risultato: chi ha installato la 0.29.0 ha letto nel registro
`Drive configurato: false` e, ogni 5 minuti, `SALVA fallito: Google Drive
non configurato: mancano le credenziali OAuth dell'app`. Il portatile ci è
rimasto dalle 16:49 alle 17:40: niente salvataggi, niente arrivi. Il fisso
era ancora alla 0.28.2 (battito `pc-deb4db2834a7`), quindi non toccato.

# Come si è rimediato

1. Le credenziali sono **dentro ogni installer già pubblicato**: scaricato
   `SierraDeck-Setup-0.28.3.exe` dalla release, `7z x` → `$PLUGINSDIR/app-64.7z`
   → `resources/app.asar` → `asar extract` → `out/main/index.js`, dove stanno
   il client id (`…apps.googleusercontent.com`) e il secret (`GOCSPX-…`).
   Scritte in `google-oauth.json` nella radice (gitignored) e, per far
   ripartire subito il portatile senza reinstallare, anche in
   `%APPDATA%\sierradeck\google-oauth.json` (il terzo ripiego di
   `configGoogle`, letto a ogni chiamata).
2. **0.29.1** ricostruita con le credenziali incastonate e pubblicata.
3. `scripts/controlla-credenziali.mjs`: `pacchetto` e `pubblica` (e
   `pacchetto-senza-eseguire.cjs`) si fermano se le credenziali mancano.

# La regola

Prima di costruire un installer su un PC nuovo: `google-oauth.json` nella
radice. Se non c'è, si recupera da un installer pubblicato come sopra (il
secret di un client «Desktop» sta nel pacchetto per scelta, vedi il commento
in `electron.vite.config.ts`). Mai nel repo, mai in chat.
