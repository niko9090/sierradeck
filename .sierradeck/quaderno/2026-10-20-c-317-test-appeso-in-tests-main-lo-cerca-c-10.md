---
titolo: "c-317/321: il test appeso in tests/main lo cerca c-10 (20/10 17:15)"
quando: 2026-10-20T17:15:00+02:00
tag: ["0.81.0", "coordinamento", "test", "tests/main"]
---

Il punto «trova il file di tests/main che resta appeso» è arrivato a c-10, c-12, c-25, c-27 e c-28 (c-317…c-321).
**Lo fa c-10**, sul suo ramo `ap/ap-f1e631f5/c-10`. Le altre chat passino al resto del loro elenco (Sposta in un altro workspace, rami, rapporto, release).
Qui sotto, appena c'è, il file colpevole e il commit.

**c-316 (a c-3, 17:22):** è arrivato anche a c-3 lo stesso elenco. c-3 non lo rifà:
- il test appeso lo cerca c-10;
- «Sposta in un altro workspace» è sul ramo `c-289-sposta`;
- rami e release sono di c-25;
- il lavoro di c-3 (storico degli errori ed «Errori arrivati») è già in main con c-14.

**c-318 (a c-12, 17:25):** è arrivato anche a c-12. c-12 non lo rifà: aveva lanciato tests/main a metà alla volta, ma lo ha fermato appena ha visto questa scheda, per non caricare il PC mentre c-10 misura. Non ha nessun ramo aperto: `c-12-salva2` è già in main (0e4f0505).

**Esito di c-10 (17:55): nessun file appeso, nessun test da correggere.** Conferma quanto misurato da c-289 in `criteri-vitest-scaduti-restano-vivi-0-80-1.md`.
- `tests/main` intero con `--maxWorkers=2 --reporter=verbose --reporter=hanging-process` e tetto di 15 minuti (17:17–17:32), sul ramo c-10 che contiene tutto main: **0 rossi**, ma solo 38 file su 185 finiti. Il PC aveva **33 processi vitest** e la CPU al 100%.
- I due file in corsa al momento del tetto, `ospite` e `una-casa`, lanciati da soli passano: 13/13 e 8/8.
- Il test di `ospite` «claude.exe per una chat parte solo da lì» (legge tutti i 437 file di `src`): **51,8 s sotto carico, 2,4 s da solo**, e tutto il file 3,4 s di test a macchina più leggera. Va lento perché la CPU non c'è, non perché resta appeso. È sincrono, quindi il tetto di 20 s non lo ferma.
- Fermata la mia seconda corsa (le due metà), per non caricare il PC. Ha lasciato un vitest vivo con due worker, chiuso con `taskkill /T`.
- **Trappola:** fermare una corsa di `npx vitest` dalla bash di Git (TaskStop, timeout) lascia vivo `vitest.mjs` con i suoi worker. Dopo ogni stop controllare i processi `node.exe` con il percorso della propria cartella e «vitest» nella riga di comando.
- Il criterio tornerà a stare nei tempi quando ci sarà una sola suite alla volta. La correzione degli orfani (1e9add64) arriva con l'installazione della 0.81.0.

**c-324 (alla chat del ramo c-310, 20/10 sera):** è arrivato lo stesso elenco. Non rifà quello che fanno già altre chat: «Sposta», rami e rapporto sono sul ramo `c-289-sposta`, la release è di c-28. Ha controllato l'unico indizio rimasto, `chat-di-prova.test.ts`: da solo passa, 19/19 in 12 s, e il reporter `hanging-process` non trova niente aperto. Fa una sola misura dei due criteri, uno dopo l'altro, dalla sua copia (che non viene tolta durante il giro), con i tempi per file. L'esito è qui sotto.

**Esito della misura di c-324 (20/10 sera; main d3a65675 più il ramo c-310; una sola altra suite accesa sul PC):**
- `tests/main --maxWorkers=2`: **189 file passati + 1 saltato, 1807 test verdi, 290 s** (5 minuti). Il reporter `hanging-process` non segnala niente rimasto aperto. I file più lenti, sommando il tempo di ogni file: cassaforte-sincronia 24 s, gestione-chat 13 s, pty-host-client 12 s.
- `tests/autopilot-host tests/renderer tests/shared tests/pty-host --maxWorkers=2`: **251 file, 2736 test verdi, 390 s**. Per cartella (tempo dei file sommato): autopilot-host 263 s, pty-host 11 s, shared 10 s, renderer 4 s. Il più lento è `worktree.test.ts` con 114 s (git vero), poi server.test 42 s.
- **Conclusione:** nessun test appeso e nessuna correzione da fare. Tutti e due i criteri stanno nei 9 minuti quando gira una sola suite alla volta. I rossi per tempo vengono dal carico, cioè dalle suite orfane della 0.80.1 e da più chat che lanciano la suite intera insieme.
