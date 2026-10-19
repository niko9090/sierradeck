---
titolo: "0.80.0 ferma prima della pubblicazione: consegne perse in sottofondo (19/10)"
quando: 2026-10-19T14:05:00.000Z
tag: ["release", "0.80.0", "autopilota", "consegne"]
---

**Stato:** la 0.80.0 è pronta in main ma **non pubblicata**:
- versione alzata e novità scritte: `d947277`, `836d2dd`;
- app 2.80.0, versionCode 136;
- `npm test` verde: 4261 passati, 265 s;
- typecheck e guardia delle cancellazioni puliti.

Nicholas ha scelto di aspettare che il ramo `ap/ap-f1e631f5/c-11` sia unito in main, dopo la Revisione.

**Il difetto in main (da `0c9d839`), segnalato da c-10 e verificato:**
- **Cosa fa il renderer:** `comePortare` (`src/renderer/consegna-visibile.ts`) manda in «sottofondo» ogni consegna per un workspace che non è sullo schermo. `App.tsx` toglie la consegna dalla banda e chiama `autopilota.inSottofondo(c)`.
- **Cosa fa il PC:** l'handler `autopilota:inSottofondo` (`src/main/index.ts`) risponde `false` se `c.sottofondo !== true`, cioè se Nicholas non ha chiesto il sottofondo per quell'autopilota.
- **Il guaio:** il `false` non lo guarda nessuno, quindi la consegna si perde. L'autopilota aspetta per sempre la risposta a un'istruzione mai arrivata. Con la 0.79.0 non succedeva: la finestra cambiava workspace e consegnava.

**Correzione:** è in `b22892d` sul ramo c-11.
- L'handler accetta anche le consegne senza `sottofondo`.
- Se il sottofondo non è pronto, il renderer porta la finestra invece di perdere la consegna.
- Il `e270a0c` di c-10 è stato ritirato: non va preso.

**Dopo l'unione di c-11:** controllare che nelle novità 0.80.0 di `src/shared/novita.ts` ci siano anche le notifiche di c-11 (sono già scritte solo per quello che c'è in main). Poi rifare i controlli e pubblicare con la procedura di `pubblicare-una-release.md`.
