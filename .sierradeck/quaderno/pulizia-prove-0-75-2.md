---
titolo: "Pulizia delle prove (c-26) e 0.75.2: cosa è stato tolto, PC per PC, e cosa resta in coda"
quando: 2026-10-16T09:45:00+02:00
tag: ["pulizia", "prove", "recupero", "0.75.2", "rapporto", "per Nicholas"]
---

# Cosa è stato tolto (16/10, verso le 09:33)
Tutto è andato nel **recupero di 30 giorni** (scade il 15/11), senza cancellazioni definitive. Le chat vere non le ho toccate.

**PC-Fisso (questo):**
- workspace «SierraDeck-prova-collaudo»: tolto con `/api/workspace/elimina`. È nella lista dei workspace eliminati, quindi recuperabile.
- progetti `SierraDeck-prova-collaudo`, `-c2` e `-c3`: tolti con `/api/prova/togli-progetto`. Le cartelle sono andate nel recupero e il registro dei progetti è aggiornato.
- cartelle «Prova elenco» e «Seconda prova»: **erano mie**. Le ha create la copia di prova il 15/10 alle 20:07Z, con il mio clic su «Prepara» nella prova della vista a elenco. Erano vuote. Sono nel recupero.
- storie delle 21 chat di prova, cioè 5 cartelle in `~/.claude/projects`: prova-c2, -c3, -collaudo, la copia `E--Documents-…-prova-c2` e `…scratchpad-hook-prova` (11 chat delle prove degli hook del 02/10). Sono nel recupero.
- nessuna chat di prova era aperta e nessun autopilota era di prova: i due autopiloti di qui sono veri.

Tutto si trova in `%APPDATA%\SierraDeck\recupero-progetti\` (elenco in `elenco.json`). Si ripristina da «Cartelle in recupero».

**DESKTOP-G24D499 (0.75.1):** il progetto `SierraDeck-prova-c2` è andato nel recupero di là, tramite il ponte. Là non c'erano workspace, chat o autopiloti di prova. **Resta la storia delle chat di prova-c2 nel `~/.claude/projects` di DESKTOP**: nessuna rotta può toglierla da lontano. Si toglie da sola con la 0.75.2, al prossimo «togli progetto di prova».

**Cartella di SierraDeck:** tolti i worktree `note/compat/v0.69.0` e `v0.73.0` (con `git worktree remove`) e le copie `note/prova-072`, `prova-0721`, `prova-073` e `vero-074`. Le fixture della compatibilità restano in `tests/fixtures/pc-misti`.

# Il portatile (LAPTOP-E60QM2D1, 0.69.0, spento dal 13/10): da fare quando si accende
Ancora niente, **e nessuno script lo aspetta**. Lo script di attesa che avevo lanciato è stato fermato il 16/10 verso le 10, su richiesta del supervisore: niente processi che girano da soli (regola dopo il 14/10). Il dispositivo temporaneo «Collaudo Claude (temporaneo)» è stato tolto con `revoca` del programma. La verifica: la sua chiave dà 401 e `dispositivi.json` ha solo il telefono.

I passi esatti sono nella scheda **«Pulizia del portatile, da fare quando si accende»** (`pulizia-portatile-da-fare.md`). Si fanno quando Nicholas accende il portatile e lo dice.

# 0.75.2: i pezzi di prova che il programma lasciava indietro da solo
1. **La copia di prova (`SIERRADECK_PROVA`) creava i workspace nuovi fra i progetti veri.** Leggeva `cartellaProgetti` dal `pc.json`, che spesso è copiato dai dati veri, oppure la predefinita nella home. Adesso con `SIERRADECK_PROVA` la cartella dei progetti è sempre dentro la prova (`cartellaProgettiDellaProva` in `src/main/progetti/pc.ts`). Una cartella scelta fuori dalla prova non vale.
2. **«Togli progetto di prova» lasciava le conversazioni** in `~/.claude/projects` e quindi sul Drive. Adesso `storieDiProvaInRecupero` (in `src/main/rimozione-sicura.ts`) le manda nel recupero con la cartella: quella del percorso di qui, e le copie arrivate dagli altri PC, cioè ogni cartella che finisce con `-<nome di prova>`. Funziona solo per nomi «SierraDeck-prova-…».

Test: `tests/main/prove-senza-avanzi.test.ts`.

3. **0.75.3 — le chat delle prove restavano sul Drive.** Il salvataggio **non toglie mai** dal Drive una chat sparita dal disco: dopo la pulizia c'erano ancora 21 chat di prova. Per toglierle c'è una nuova proposta in Spazio sul Drive, «Chat delle prove» (`slugDiProva` in `src/shared/spazio-drive.ts`). Vale per gli slug che finiscono con `-SierraDeck-prova-…` o che sono dentro lo scratchpad di una sessione di Claude Code. **La conferma Nicholas** (non è fra `PULIZIE_DA_SOLE`): le chat vanno nel recupero del Drive per 30 giorni e «Annulla» le rimette.
   - **Da fare dopo che Nicholas installa la 0.75.3:** in Progetti → Spazio sul Drive premere «Chat delle prove» → «Conferma». Oggi sono 21 chat.

**Trappola (verificata il 16/10):** spostare una storia di chat fuori da `~/.claude/projects` **non** la toglie dal Drive. Il salvataggio dopo ha detto «0 rimossi» e il pannello continua a mostrarle (stato «solo-cloud»). Dal Drive una chat esce solo con una pulizia di Spazio sul Drive, che ha il suo recupero. Le chat vere non vanno mai spostate a mano.
