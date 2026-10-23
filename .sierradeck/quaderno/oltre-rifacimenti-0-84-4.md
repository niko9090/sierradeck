---
titolo: "Oltre i rifacimenti decide il programma (0.84.4): niente più «Come vado avanti con …?»"
quando: 2026-10-23T14:10:00+02:00
tag: ["0.84.4", "revisione", "autopilota", "domande", "trappola"]
---

**Prima (fino alla 0.84.3):** dopo `RIFACIMENTI_MAX` (2) «da rifare» della Revisione sullo stesso compito, il programma chiedeva a Nicholas «Come vado avanti con «…», che la Revisione ha già rimandato indietro N volte?» (rifallo ancora / uniscilo così / lascialo fuori). Il 23/10 sono arrivate per il Punto, per le domande del programma e per il Gestore RDP. Nicholas: «sei tu che devi trovare le soluzioni, non io».

**Adesso** (`src/autopilot-host/oltre-rifacimenti.ts` per la regola, `oltreRifacimenti` in `server.ts` per le mosse), in quest'ordine:

1. **Ramo senza novità** (non c'è più, è già nel principale, o `git merge-tree --write-tree` dà lo stesso albero del principale) → chat chiusa come doppione (`approvata`, `conclusa: unito`). Il ramo non si tocca.
2. **Revisione OK ma criteri rossi nella copia** → `provaNelPrincipale`: `git merge --no-ff --no-commit` nella cartella principale, criteri misurati lì con i pacchetti veri, poi `commit --no-edit` se il ramo non rompe niente di quello che passava, altrimenti `merge --abort`. Serve la cartella principale pulita e sul ramo base.
3. **Lavoro davvero da rifare** → chat nuova (`daCapo: true`) in una copia nuova dal ramo principale, con tutte le note della Revisione. La copia vecchia si toglie dopo aver salvato il suo lavoro sul suo ramo, che resta da leggere.
4. **Anche la chat da capo oltre il tetto** (o la copia nuova non si crea) → messa da parte: `stato: finita` con `lasciataFuori: { il, perche }`, conversazione nel recupero, una riga a Nicholas («Non è entrato «…»: … L'ho messo da parte, le altre chat continuano e il compito resta nella lista dei lavori»). Nessuna domanda.

Le domande ancora aperte di quel tipo, di **tutti** gli autopiloti, le chiude `ricontrollaDomande` (all'avvio e ogni 10 minuti) come superate e fa partire la strada per la chat ferma; se manca il contesto, la chat si ritrova dal nome del lavoro fra « ».

**Trappole da ricordare**

- **Misure durante l'unione di prova.** `misuraCriteri` dentro `turni.unione` si blocca per sempre (un comando pesante aspetta che finiscano le unioni nella sua cartella). Per questo la prova prende il turno solo per `merge` e per `commit/abort`, e fra le due tiene un suo blocco (`proveInCorso`): `unisciAlTurno` aspetta che la prova finisca, così nessun'altra unione parte a metà.
- **La cache dei criteri** usa `improntaCodice` (HEAD + diff): con l'unione non ancora confermata il diff cambia, quindi la misura sulla prova non riusa l'esito di prima. Nei test con un git finto bisogna far cambiare `rev-parse HEAD`/`diff HEAD` per cartella, se no la cache confonde le misure.
- **`togliWorktree` con una cartella che non è una copia delle chat** risaliva fino alla radice del disco e chiedeva `git worktree remove --force E:\`. Adesso si ferma senza toccare niente (guardia in `togliPassi`).
- **I test di `server.test.ts` con `cwd: process.cwd()` e `gitFinto`** creano davvero cartelline `<copia>.sierradeck-wt/ap-…-c-N/.claude/settings.local.json` accanto alla copia della chat (le scrive `allineaHookEcc` dopo il `worktree add` finto). Il test nuovo usa una cartella temporanea; quelli vecchi lasciano ancora quelle cartelline (solo il file di impostazioni dentro).
