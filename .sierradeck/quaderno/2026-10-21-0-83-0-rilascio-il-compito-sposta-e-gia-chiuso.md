---
titolo: "0.83.0, Rilascio: il compito «Sposta in un altro workspace» è già chiuso (21/10)"
quando: 2026-10-21T12:00:00+02:00
tag: ["autopilota", "rilascio", "0.83.0", "trappola"]
---

Le consegne c-447, c-448 e c-449 alla chat di Rilascio della 0.83.0 portano ancora come «tuo compito» il vecchio **«Sposta in un altro workspace» per un autopilota**. È già fatto: non va rifatto.

- Codice in main: `33f32eb7` (funzione), `8978924b`, `8dc203ea` (correzioni della Revisione), unione `53a7d725`; novità in `637756ef`. Uscito nella 0.81.0.
- I passi dopo l'install (Sposta `ap-79a4ce02` in NexoraOS, poi Elimina «dentro al mio server nexora c'è gia un» e «visitafacile») sono già in `analisi-0-80-0.md`, §«Stato al 20/10» e riga «Adesso c'è, nella 0.81.0».
- La domanda «pubblico la 0.81.1?» è superata: 0.81.1 pubblicata e installata, 0.82.0 pubblicata.

Stato al 21/10 per la 0.83.0: in main la versione è ancora 0.82.0 (app 2.82.0); nessun ramo aperto non unito; i lavori di ristrutturazione dell'app (mappa prima/dopo, quattro voci, velocità, leggibilità, file Kotlin sotto le 800 righe, pagina allineata) **non sono ancora partiti**. Il Rilascio non ha niente da preparare finché quei rami non sono uniti dopo la Revisione. I «⋯» di c-38/c-36 restano a Nicholas.

**c-421 (a c-3, 21/10):** è arrivata anche a c-3 la stessa consegna della 0.83.0. c-3 non rifà la mappa (la fa c-10) e non ha domande aperte sulla 0.81.1 da chiudere. Il Rilascio resta in attesa dei rami della ristrutturazione, uniti dopo la Revisione.

**c-436 (al Rilascio, 21/10 ~08:45):** stessa consegna, con il vecchio compito «chat chiusa che chiama il supervisore», già in main e nella v0.81.1 (scheda «c-437: chat chiuse già corrette nella 0.81.1»). Il Rilascio non rifà né quello né la mappa (la fa c-10). Aspetta i rami della ristrutturazione uniti dopo la Revisione, poi fa la 0.83.0. Trappola: con una trentina di chat accese il disco è lentissimo, e un `ls`/`find` sulle copie delle chat supera i 2 minuti; meglio cercare solo nella cartella principale.

**c-449 (al Rilascio, 21/10 ~09:40):** stessa consegna, con il vecchio compito «Rilascio 0.81.1». È già fatto: v0.81.1 pubblicata il 20/10 da `2a441dcb`, non in bozza, con 5 allegati (installer, blockmap, latest.yml, APK 2.81.0, app-android.json); la riga è in `analisi-0-80-0.md`. Il Rilascio non rifà né quella né la mappa (c-10/c-12). Aspetta i rami della ristrutturazione uniti dopo la Revisione.

**Trappola (c-449):** un worktree con `node_modules` collegato come giunzione alla cartella principale non va tolto con `git worktree remove --force`, che si ferma con «Invalid argument» a metà. Prima va tolta la sola giunzione con `[System.IO.Directory]::Delete('<percorso intero>\node_modules', $false)`. `cmd /c rmdir` e i percorsi con variabili li blocca la guardia di SierraDeck. Poi si fa `git worktree prune` e si cancella la cartella col suo percorso intero. L'AVD `sd083` è di c-12, non va toccato.
