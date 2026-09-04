---
titolo: "L'antivirus blocca «Installa Claude Code» (Panda: PUP nella cartella TEMP)"
quando: 2026-09-04T17:10:00+02:00
tag: ["preparazione", "claude-code", "antivirus", "installazione", "supporto"]
---

# «Cannot create process, error code: 5» premendo Installa Claude Code

**Il fatto (2026-09-04, PC nuovo con Panda).** Il tasto «Installa Claude Code»
del modale di preparazione apre un terminale interno (node-pty, ConPTY) che
lancia `powershell.exe -NoProfile -Command "irm https://claude.ai/install.ps1 | iex"`
(`INSTALLA_CLAUDE` in `src/main/preparazione.ts`). Sul PC compare
«Cannot create process, error code: 5» (= accesso negato, da `CreateProcessW`
in `conpty.cc`), e Panda notifica di aver fermato un **PUP nella cartella
TEMP**.

**La causa.** L'antivirus. Il comando ha la forma «scarica ed esegui» che
gli antivirus trattano come sospetta, e l'installatore ufficiale scarica
`claude.exe` in `%TEMP%` prima di copiarlo in `%USERPROFILE%\.local\bin`.
Panda lo classifica come PUP (falso positivo) e blocca la catena: il
processo non parte (errore 5) o il file scaricato viene messo in quarantena.
Non è un difetto di SierraDeck né del terminale interno.

**Cosa fare sul PC.**
1. In Panda: ripristinare dalla quarantena il file bloccato e aggiungere
   un'esclusione per `%USERPROFILE%\.local\bin\claude.exe` (e, per la durata
   dell'installazione, per `%TEMP%`), oppure sospendere la protezione per il
   tempo dell'installazione.
2. Rilanciare l'installazione: dal modale di SierraDeck, o a mano in una
   PowerShell normale con `irm https://claude.ai/install.ps1 | iex`.
3. Riavviare SierraDeck: `trovaClaude` lo cerca in `~/.local/bin`, nel PATH,
   in WinGet Links e in `%APPDATA%\npm`, e passa al passo dell'accesso.

**Alternativa senza scaricare da script:** con Node.js installato,
`npm install -g @anthropic-ai/claude-code` (SierraDeck lo trova in
`%APPDATA%\npm\claude.exe`).

**Da ricordare per il prodotto.** L'errore 5 dal terminale interno non
distingue «l'antivirus ha bloccato» da «ConPTY non funziona»: il modale
potrebbe dirlo («se hai un antivirus, controlla che non abbia bloccato
l'installatore in TEMP») invece di lasciare solo la riga rossa nel
terminale. Da fare se capita di nuovo.
