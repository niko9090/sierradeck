---
titolo: "14/10: la cancellazione di AppData\\Local — analisi della causa, con le prove (risposta: non trovata con certezza)"
quando: 2026-10-15T12:00:00+02:00
tag: ["incidente", "sicurezza", "AppData", "autopilota", "criteri", "analisi", "0.72.0"]
---

Tutte le ore sono **UTC** (in Italia +2). L'analisi è stata fatta **solo leggendo**: nessun file è stato cancellato o cambiato. Le protezioni messe dopo sono in `sicurezza-cancellazioni-0-72-0.md`.

# Cosa è successo
Fra le 07:02:54 e almeno le 07:09:52 del 14/10 il contenuto di `%LOCALAPPDATA%` è stato cancellato cartella per cartella, in ordine alfabetico.
- Sono rimasti solo i file bloccati dai programmi aperti e i file chiamati `nul`.
- In un'ora C: ha guadagnato 12,12 GB di spazio libero.
- Alle 07:08:49 Windows ha buttato la copia shadow di C:, perché lo spazio per le copie non poteva crescere (Volsnap 35). Per questo dopo non c'era nessun punto di ripristino.

# Risposta: il processo che ha cancellato non è identificato
**Mancano le prove che lo nominerebbero:**
- la creazione dei processi (Security 4688) è stata accesa solo alle 12:19, dalla sessione di recupero;
- i registri di PowerShell sono vuoti, e Sysmon non c'è;
- il giornale dei cambi del disco (USN, 32 MB) è traboccato: il primo record rimasto è delle 07:18:58.
- Prefetch, BAM, Amcache e SRUM direbbero quali programmi giravano, ma servono i permessi di amministratore.

**Escluso, con le prove:**
- **Chat di Claude Code:** in nessuna trascrizione di `~/.claude/projects` ci sono righe fra le 02:00 e le 10:47, e in `history.jsonl` non ci sono prompt.
  - Non coperte: le sessioni senza trascrizione e quelle con la configurazione dentro Temp, che sarebbe stata cancellata anche lei.
- **SSH:** nessun accesso fra le 06:35 e le 07:25.
- **Installatori, Windows Update e Defender:** nessun evento. L'aggiornamento di SierraDeck non è partito.

# Cronologia
| UTC | Fatto | Fonte |
|---|---|---|
| 06:51–07:06:42 | Il task PowerShell della conversione video gira. Cancella solo un suo file `.lock`, con un percorso fisso, e la cancellazione continua dopo la sua fine | Utilità di pianificazione, script |
| **07:02:54** | Primo segno di cancellazione (`AnthropicClaude\app-…\resources`) | Trascrizione della sessione di recupero |
| 07:04–07:07 | Disco saturo: MT5 aspetta 32 s, i task partono in ritardo | Ntfs/Operational, Utilità di pianificazione |
| 07:06:36 | `gh` ricrea `%LOCALAPPDATA%\GitHub CLI`: un criterio dell'autopilota con `gh` è partito **dopo** che la cancellazione era passata dalla «G» | Data di creazione della cartella |
| **07:07:41** | Diario di ap-f1e631f5: «ricontrollo da solo: «L'app Android compila…» non passa più». Gradle cade perché le sue cose in AppData\Local non ci sono più | Archivio dell'autopilota |
| 07:08:49 | Copia shadow di C: buttata | Volsnap 35 |
| 07:08:44–07:09:52 | Cancellazioni in `NVIDIA`, `PowerToys`, `Programs` | Date delle cartelle |
| 07:10:08 | Claude Code si aggiorna (2.1.296 → 2.1.299), 7 minuti dopo l'inizio | File delle versioni |
| 07:10:33 | `npm` ricrea `npm-cache`. Questa **non** è la fine della cancellazione, come pensava la sessione di recupero: la fine vera non si sa | Data di creazione |

# Le ipotesi
**H1, la più vicina negli orari e non provata: qualcosa lanciato dal «ricontrollo da solo» dei criteri di ap-f1e631f5.** È stato tolto nella 0.72.0.
- **A favore:**
  - era l'unico esecutore automatico di comandi attivo per tutta la finestra;
  - ogni 10 minuti, senza nessuno davanti, lanciava fino a due criteri insieme con `bash -l`, e i giri potevano sovrapporsi;
  - `gh`, gradle e `npm` hanno lasciato tracce dentro la finestra.
- **Contro:**
  - nessun comando dei criteri cancella qualcosa. Erano: privacy con `git grep`, versione con `node -e`, `gh release view`, `gh release download` con `mktemp -d` più `apksigner`, `npm test`, `npm run typecheck`, gradle, e `git fetch`/`status`;
  - nel codice della 0.71.1 non c'è nessun percorso che porti a `%LOCALAPPDATA%`;
  - gli stessi criteri erano girati senza danni ogni 10 minuti tutta la notte.
- **Riesecuzione isolata (15/10, 07:15–07:20).**
  - **Come:** gli stessi 8 criteri, sul codice di allora (0.71.1, commit 0419ca7), in un worktree in `note/`. Giravano con `bash -l` come il servizio, con HOME, USERPROFILE, APPDATA, LOCALAPPDATA e TEMP finti. C'erano dei canarini nelle cartelle finte e in una cartella «fuori», e l'elenco di `%LOCALAPPDATA%` vero era preso prima e dopo.
  - **Esito: nessun canarino sparito, e nessuna voce sparita da `%LOCALAPPDATA%` vero.**
  - `npm test` e gradle sono andati anche **insieme**, come poteva capitare nel ricontrollo.
  - npm test ha dato 2 rossi: un artefatto della prova (la Temp finta stava dentro il repository, e due test cercano «una cartella che non è git»). Il typecheck è verde.
  - I due criteri con `gh` **non si sono potuti rifare**: il login di `gh` su questo PC oggi non è valido (401). Vanno rifatti dopo che Nicholas ha rifatto il login.

**H2, debole: l'aggiornamento automatico di Claude Code.** Coincide solo nell'ora, e comincia 7 minuti dopo. Lavora in `~/.cache/claude/staging`, e nel programma non c'è nessuna cancellazione di AppData\Local.

**H3, debole: il task PowerShell della conversione video.** Usa `Remove-Item -Recurse -Force` su un percorso fisso sotto `%LOCALAPPDATA%\…\aac.lock`, gira da settimane, ed è finito prima della fine della cancellazione.

**Sul modo, una deduzione e non una prova:** la cancellazione è andata avanti sui file bloccati e ha lasciato i file `nul`. Assomiglia più a una cancellazione con le API di Windows (`Remove-Item -Recurse -Force`, `rd /s /q`, `shutil.rmtree` con `ignore_errors`) che a `rm -rf` di Git Bash, che i `nul` li sa cancellare.

# Cosa resta incerto, e come chiuderlo
Servono i permessi di amministratore, sempre in sola lettura:
- **SRUM** (`C:\Windows\System32\sru\SRUDB.dat`): i byte scritti da ogni processo, ora per ora. Chi ha cancellato 12 GB fra le 07:00 e le 08:00 si vede.
- **Prefetch, BAM, Amcache:** gli ultimi avvii di powershell, cmd, bash, node, java e python intorno alle 07:02.
- **Il registro della conversione video sul NAS:** cosa ha fatto fra le 06:51 e le 07:06.

Da adesso, se succede ancora, la creazione dei processi con la riga di comando (4688) e i registri di PowerShell, accesi il 14/10 alle 12:19, diranno chi è stato. E il servizio degli autopiloti scrive nel registro ogni comando che lancia (0.72.0).
