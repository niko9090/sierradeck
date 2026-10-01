---
titolo: "Novità di Claude Code utili a SierraDeck: proposte (01/10/2026)"
quando: 2026-10-01T19:10:00+02:00
tag: ["ricerca", "claude-code", "proposte", "hook", "statusline", "remote-control", "decide-nicholas"]
---

# Cosa è questa scheda

Nicholas (01/10): «ci sono altre novità che possiamo apportare? sei aggiornato con le novità pubblicate che potrebbero aiutare a far funzionare meglio questo programma?».

Sono **proposte**: niente è implementato, decide Nicholas. Riporto solo quello che ho letto nelle fonti, con la versione di Claude Code in cui è uscito. Su questo PC è installato **Claude Code 2.1.286** (`claude --version`), quindi tutto quello che segue è già disponibile qui.

**Fonti lette il 01/10/2026:**
- [F1] Changelog ufficiale, testo grezzo: https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md (da 2.1.286 indietro). Pagina: https://code.claude.com/docs/en/changelog
- [F2] Hook: https://code.claude.com/docs/en/hooks
- [F3] Remote Control: https://code.claude.com/docs/en/remote-control
- [F4] Riga di stato: https://code.claude.com/docs/en/statusline

**Cosa fa SierraDeck oggi** (punto di partenza):
- le chat partono con `--session-id`/`--resume`, `-n` e `--append-system-prompt`;
- `--settings` serve **solo** alle chat governate da un autopilota (gli hook Stop/Notification e il PreToolUse dei divieti);
- la statusLine (comando `curl` verso `/api/polso`) viene messa solo se l'utente non ne ha una sua;
- le domande e i permessi delle chat si riconoscono **leggendo lo schermo** del terminale (`scelteVive`);
- l'autopilota capisce che una chat è ferma leggendo terminale e hook;
- i worktree sono suoi (`worktree.ts`);
- il negozio non ha plugin per singola chat.

# Le proposte, in ordine di priorità

| # | Proposta | Priorità | Costo | Rischio |
|---|---|---|---|---|
| 1 | Domande e permessi da hook strutturati (Notification + PermissionRequest) invece che dallo schermo | **alta** | medio | medio |
| 2 | StopFailure: l'autopilota sa quando un turno muore per un errore API (limiti, accesso) | **alta** | basso | basso |
| 3 | Riga di stato che si rinfresca da sola (`refreshInterval`) | **alta** | basso | basso |
| 4 | Remote Control: le chat di SierraDeck dall'app Claude ufficiale, con le notifiche push | media | medio | medio |
| 5 | Hook dei divieti più leggeri e senza shell (`if`, `args`, `type: "http"`) | media | basso | basso |
| 6 | Cache del prompt nei Consumi (`prompt_cache`) | media | basso | basso |
| 7 | Compattazione vista dal programma (PreCompact / PostCompact) | media-bassa | basso | basso |
| 8 | Plugin per singola chat nel negozio (`--plugin-dir`, `--plugin-url`) | media-bassa | medio | medio |
| 9 | `/goal` per i lavori semplici a una chat | bassa | basso | medio |
| 10 | Vista degli agenti (`claude agents --json`) e sessioni in background | bassa | alto | alto |

## 1. Domande e permessi da hook strutturati — priorità alta

- **Cosa porta a Nicholas:** le domande delle chat («vuoi procedere? 1. Sì 2. No», un permesso, una chat che ha finito) arrivano nella colonna Domande, nella pagina e nell'app **dall'evento di Claude Code**, non da una lettura dello schermo. Oggi un riquadro ridisegnato, una cornice o una lingua diversa possono far perdere o sbagliare una scelta: è la famiglia del «non vedo le domande».
- **Novità usate:**
  - hook `Notification` con i matcher `permission_prompt` e `idle_prompt` [F2];
  - hook `PermissionRequest`, che riceve `tool_name`, `tool_input`, `tool_use_id` e può rispondere `{"decision": {"behavior": "allow"|"deny"}}` [F2]; aggiunto in **2.0.45** [F1];
  - `last_assistant_message` negli input di Stop (**2.1.47**) [F1], che SierraDeck usa già per le governate.
- **Costo:** medio.
  - Gli hook vanno passati con `--settings` a **tutte** le chat, non solo alle governate.
  - Servono una rotta locale che li riceva e un PermissionRequest che resta in attesa della risposta data dalle Domande.
  - La lettura dello schermo resta come riserva per le versioni vecchie.
- **Rischio:** medio.
  - Un hook che aspetta tiene ferma la chat: serve una scadenza, poi si lascia decidere al prompt normale.
  - Da verificare prima: come `--settings` si unisce agli hook che l'utente ha nei suoi file.
  - Le chat di SierraDeck partono con `--dangerously-skip-permissions`, quindi oggi i permessi veri sono pochi. Il guadagno maggiore è su `idle_prompt` e sulle domande.

## 2. StopFailure per l'autopilota — priorità alta

- **Cosa porta a Nicholas:** quando una chat si ferma per un errore dell'API (limite raggiunto, accesso scaduto), l'autopilota lo sa **subito e con il motivo**. Oggi invece lo deduce dal silenzio (guardiano) o dallo schermo. Ripartenze più rapide, meno «fermo senza motivo».
- **Novità usate:**
  - hook `StopFailure`, «fires when the turn ends due to an API error (rate limit, auth failure, etc.)»: **2.1.78** [F1], elencato in [F2];
  - matcher di `Notification` `quota_auto_resume_fired`, `quota_auto_resume_stale` e `quota_auto_resume_disabled` [F2].
- **Costo:** basso. Si aggiunge un evento agli hook delle chat governate e una rotta nel servizio, accanto a quella dello Stop.
- **Rischio:** basso. Se l'evento non arriva, resta il comportamento di oggi.

## 3. Riga di stato che si rinfresca da sola — priorità alta

- **Cosa porta a Nicholas:** limiti e contesto meno vecchi nella colonna «Consumi e limiti» e nel freno degli autopiloti. Oggi una chat ferma non manda più niente, e la 0.37.0 deve segnare la lettura come «vecchia» oltre 20 minuti.
- **Novità usate:**
  - `refreshInterval` della statusLine, «re-run the status line command every N seconds»: **2.1.97** [F1], descritto in [F4];
  - inoltre la riga di stato si riesegue da sola quando una finestra di limiti «reaches its `resets_at` time» [F4]. Questo conferma la scelta della 0.37.0 di tenere la finestra «azzerata, in attesa».
- **Costo:** basso. Un campo nella statusLine che SierraDeck già scrive (`rigaDiStatoPerChat` in `index.ts`), per esempio 60 s.
- **Rischio:** basso.
  - Un `curl` al minuto per chat.
  - Una riga ridisegnata senza una risposta nuova **non** ringiovanisce la lettura (`unisciPolso`), quindi l'età resta onesta.
  - Il valore dei limiti resta quello dell'ultima risposta della sessione: rinfresca il contesto e l'azzeramento, non il consumo fatto altrove.

## 4. Remote Control con l'app Claude ufficiale — priorità media

- **Cosa porta a Nicholas:** una chat di SierraDeck si continua dall'**app Claude** (iOS/Android) o da claude.ai/code: messaggi, foto e file dal telefono, mentre la chat gira sul PC. Ci sono anche le notifiche push quando Claude «decide» di avvisare, e un file di presenza le spegne quando lui è al PC. Copre parte di «P1» (le chat dal vivo dal telefono) senza scrivere una nostra vista remota.
- **Novità usate:**
  - `claude --remote-control "<nome>"` (o `--rc`) per una sessione interattiva anche remota; `claude remote-control` in modalità server con `--spawn same-dir|worktree|session` [F3];
  - piani Pro, Max, Team ed Enterprise; con le chiavi API non funziona [F3];
  - «Claude keeps running locally the entire time» [F3];
  - nome della sessione con `--remote-control "<nome>"` o `--name` (**2.1.69**) [F1];
  - strumento di notifica push con «Push when Claude decides» (**2.1.110**) [F1];
  - `CLAUDE_CLIENT_PRESENCE_FILE` per tacere le push mentre si è al computer (**2.1.181**) [F1];
  - streaming dal vivo dei subagenti in primo piano (**2.1.251**) [F1].
- **Costo:** medio.
  - Un interruttore per chat (o per workspace) che aggiunge `--remote-control <titolo>` allo spawn.
  - Il file di presenza scritto da SierraDeck quando la finestra è in primo piano.
  - Spiegazioni nella UI.
- **Rischio:** medio.
  - La prima volta Claude Code chiede una conferma interattiva [F3], e la cartella deve essere «trusted».
  - Dipende dal piano e dalle regole dell'organizzazione.
  - Si sovrappone in parte all'app SierraDeck.
  - Va deciso da Nicholas se vuole le sue chat visibili su claude.ai.

## 5. Hook dei divieti più leggeri e senza shell — priorità media

- **Cosa porta a Nicholas:** l'hook PreToolUse dei divieti scatta solo sui comandi che possono cancellare, non su ogni strumento, e parte senza passare da una shell. Meno lavoro per chat, meno sorprese con le virgolette su Windows. Integra la correzione della 0.37.1 sui falsi allarmi.
- **Novità usate** [F2]:
  - campo `if` con la sintassi delle regole di permesso (es. `"Bash(rm *)"`, valutato solo sugli eventi degli strumenti): **2.1.85** [F1];
  - forma «exec» con `args`, senza shell: **2.1.139** [F1];
  - hook `type: "http"`, che mandano il JSON in POST a un URL: **2.1.63** [F1].
- **Costo:** basso. Si cambia il modello degli hook generato per le governate.
- **Rischio:** basso. Con `if` troppo stretto un comando di cancellazione scritto in modo insolito passerebbe senza controllo. Per questo `if` va usato solo per **scartare** gli strumenti che non cancellano mai (Read, Edit…), mai per restringere Bash/PowerShell.

## 6. Cache del prompt nei Consumi — priorità media

- **Cosa porta a Nicholas:** nella colonna «Consumi e limiti», per ogni chat: cache calda o fredda, quante volte è stata mancata e perché (per esempio «idle past the TTL»). Spiega perché una chat ripresa dopo una pausa consuma di più, e quando conviene riprenderla subito.
- **Novità usate:**
  - oggetto `prompt_cache` nella riga di stato (**2.1.251**) [F1];
  - causa probabile del miss (**2.1.260**) [F1]; campi come `expires_at` e `hit_ratio` [F4];
  - inoltre gli hook `SessionStart` di ripresa ricevono la «staleness» e il costo stimato di ri-cache (**2.1.251**) [F1].
- **Costo:** basso. `leggiPolso` legge un campo in più, `limiti-piano.ts` ne fa la frase, e colonna, pagina e app la mostrano.
- **Rischio:** basso.

## 7. Compattazione vista dal programma — priorità media-bassa

- **Cosa porta a Nicholas:** quando una chat compatta il contesto, la colonna lo dice («compattata alle 14:20, il contesto riparte») invece di mostrare un numero che salta. L'autopilota può anche salvare un riassunto nel quaderno **prima** che i dettagli si perdano.
- **Novità usate:** `PostCompact` (**2.1.76**) [F1]; `PreCompact` che può anche bloccare (**2.1.105**) [F1]; entrambi elencati in [F2].
- **Costo:** basso.
- **Rischio:** basso. Bloccare la compattazione no: solo osservarla.

## 8. Plugin per singola chat nel negozio — priorità media-bassa

- **Cosa porta a Nicholas:** dal negozio si accende un plugin **solo per una chat** (o un workspace) invece che per tutte. È il pezzo che manca al negozio (memoria «negozio»: «Manca lo scoping per-chat via --settings»).
- **Novità usate:**
  - `--plugin-url <url>`, «fetch a plugin .zip archive from a URL for the current session» (**2.1.129**) [F1];
  - `--plugin-dir` (citato in **2.1.283** per gli errori di caricamento nello stream-json) [F1];
  - attenzione alla sincronizzazione dei plugin dell'account claude.ai nelle sessioni del terminale (**2.1.275**, si spegne con `syncClaudeAiPlugins: false`) [F1].
- **Costo:** medio. Lo spawn deve passare `--plugin-dir` per chat, e il negozio deve ricordare a quale chat va cosa.
- **Rischio:** medio. Il comportamento esatto di `enabledPlugins` dentro `--settings` non l'ho verificato nelle fonti: va provato prima.

## 9. `/goal` per i lavori semplici — priorità bassa

- **Cosa porta a Nicholas:** per un compito piccolo a una chat sola, «lavora finché questa condizione non è vera» detto a Claude Code, senza un autopilota completo.
- **Novità usata:** comando `/goal`, «set a completion condition and Claude keeps working across turns until it's met», anche in `-p` e Remote Control (**2.1.139**) [F1].
- **Costo:** basso, come una voce «Fallo finché…» nel menu della chat.
- **Rischio:** medio. Si sovrappone all'autopilota, ma senza i suoi criteri verificati, il freno e i divieti. Va presentato come cosa diversa.

## 10. Vista degli agenti e sessioni in background — priorità bassa

- **Cosa porta a Nicholas:** in teoria, SierraDeck potrebbe leggere lo stato di tutte le sessioni di Claude Code, anche quelle avviate fuori dal programma.
- **Novità usate:**
  - `claude agents` (Research Preview, **2.1.139**) e `claude agents --json` (**2.1.145**) [F1];
  - hook `Notification` con `agent_needs_input` / `agent_completed` per le sessioni in background (**2.1.198**) [F1].
- **Costo:** alto. È un modello diverso, sessioni in background invece dei terminali di SierraDeck.
- **Rischio:** alto. È in anteprima e cambia spesso.

# Vincoli emersi (non proposte)

- **Comandi in background con tempo massimo:** dalla **2.1.285** si fermano dopo il loro `timeout` (predefinito 30 min, massimo 2 h), e Claude viene avvisato [F1]. Un autopilota che lancia build lunghe in background deve saperlo.
- **`--bare` non è per noi:** serve per le chiamate `-p` da script (salta hook, plugin, skill) ma «requires `ANTHROPIC_API_KEY` or an `apiKeyHelper`» e disattiva l'accesso OAuth (**2.1.81**) [F1]. Con l'abbonamento di Nicholas non si usa per l'interrogazione del supervisore.

# Prossimo passo

Che Nicholas scelga quali proposte fare. Il mio consiglio è di partire da **1, 2 e 3**: costano poco o medio e toccano proprio i difetti di questi giorni (domande non viste, autopiloti fermi senza motivo, letture vecchie).
