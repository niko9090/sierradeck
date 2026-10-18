---
titolo: "Pulizia delle prove sul portatile e storie ricomparse: FATTA il 18/10"
quando: 2026-10-18T08:40:00+02:00
tag: ["pulizia", "prove", "portatile", "recupero", "fatto"]
---

# Fatta il 18/10/2026 (Nicholas: «Vai»)
**Portatile** (LAPTOP-E60QM2D1, già sulla 0.78.1), da PC-Fisso attraverso il ponte:
- chat di prova aperte: nessuna;
- autopiloti di prova «Autopilota di prova c2» (`SierraDeck-prova-ap`) e «Autopilota di prova collaudo»: fermati e archiviati. `/api/stato` li elenca ancora, con `archiviato: true`: è normale, si vedono solo con le archiviate;
- progetti `SierraDeck-prova-ws`, `-c2` e `-ap`: nel recupero di 30 giorni del portatile. Per `-c2` è andata anche 1 cartella di conversazioni, grazie alla 0.75.2;
- `SierraDeck-prova-collaudo`: sul portatile non ha cartella (era già nel recupero dall'11/10). Resta solo una voce nel registro dei progetti;
- workspace di prova: nessuno;
- dispositivo temporaneo: tolto con `revoca` del programma. La sua chiave dà 401 e `dispositivi.json` contiene solo il telefono.

**PC-Fisso:** le 4 cartelle di storie di prova ricomparse il 16/10 alle 07:36 (ARRIVO dal Drive, prima della correzione della 0.76.0) sono di nuovo nel recupero. Le ha spostate `storieDiProvaInRecupero` del programma, lanciata con esbuild dallo scratchpad: `/api/prova/togli-progetto` risponde 404 se la cartella del progetto è già nel recupero. Scadono il 17/11. Dalla 0.76.0 l'ARRIVO le lascia sul Drive («chat lasciate sul Drive perché la loro cartella è nel recupero»), quindi non tornano.

# Resta
- **Il Drive:** Nicholas apre Progetti → Spazio sul Drive → «Chat delle prove» → «Conferma». Le chat vanno nel recupero del Drive per 30 giorni e «Annulla» le rimette. Non la preme una chat.
- **DESKTOP:** la storia delle chat di `prova-c2` nel suo `~/.claude/projects` non si raggiunge da lontano, e il progetto là è già nel recupero (togli-progetto → 404).

# Trappola
Quando la rotta di là risponde 404, il ponte riscrive l'errore come «questa chat là non è aperta (è stata chiusa, o non c'è più)», anche se la rotta non riguarda una chat (per esempio `/api/prova/togli-progetto`). Il motivo vero sta dentro, fra «…». Il testo è da correggere.

# Come si fa (per la prossima volta)
1. Dispositivo temporaneo in `%APPDATA%\SierraDeck\dispositivi.json`. Prima si fa una copia del file. Poi nome «Collaudo Claude (temporaneo)» e il segno SHA-256 di una chiave casuale tenuta nello scratchpad. Le chiamate vanno a `http://127.0.0.1:47640` con l'intestazione `x-sierradeck-chiave` (con `MSYS_NO_PATHCONV=1` da Git Bash).
2. `POST /api/ponte {"pc":"<id del PC>","percorso":"…","corpo":{…}}`. Senza `corpo` è una GET. Le risposte lunghe vanno salvate su file, non tagliate.
3. Inventario: `/api/stato`. Poi `/api/prova/chiudi`, `/api/prova/autopilota` (prima `ferma`, poi `archivia`), `/api/workspace/elimina` e `/api/prova/togli-progetto`.
4. Si toglie sempre il dispositivo: `apriDispositivi(dati).revoca(id)` di `src/main/dispositivi.ts`. Poi si verifica il 401.
