---
titolo: "Divieto di cancellare fuori dalle cartelle: falsi allarmi e lettura dei comandi (0.37.1)"
quando: 2026-10-01T17:00:00+02:00
tag: ["autopilota", "divieti", "hook", "harness", "sicurezza"]
---

# Il difetto

L'hook PreToolUse delle chat governate (`giudicaStrumento` in `src/autopilot-host/divieti.ts`) ha bloccato un comando innocuo con «SierraDeck blocca questa cancellazione: «/autopiloti/ap-fermo/archivia» è fuori dalle cartelle di questo autopilota». È successo il 01/10, durante la 0.37.0.

Il comando era un `cat >> tests/autopilot-host/server.test.ts <<'EOF' … EOF` che appendeva dei test. Dentro c'era il nome di un test: «scrive il momento **del** fermo».

**Causa:** `CANCELLA` era una regex che cercava `rm|rmdir|del|erase|rd|remove-item|ri|unlink|shred` come **parola ovunque** nel pezzo:
- anche fra virgolette, negli heredoc, negli argomenti di grep/curl/`node -e` e negli URL;
- la parola italiana «del» diventava il `del` di Windows;
- le parole dopo, fino alla rotta dell'API, diventavano percorsi da cancellare.

Il testo italiano è pieno di «del», «ri…» e simili: il divieto toglieva all'autopilota proprio l'autonomia voluta da Nicholas.

# La correzione

`bersagliCancellazione(comando, cwd, powershell)` ora legge il comando come la shell (`leggiComandi`):
- virgolette, escape, `;` `&` `|` `( )` `{ }` e a capo separano i comandi (`2>&1` no);
- gli heredoc sono dati;
- conta solo il **primo comando** di ogni pezzo, dopo `VAR=…` e gli involucri (`sudo`, `env`, `xargs`, `nohup`, `time`, `timeout`, …), con il nome del verbo ripulito (`/bin/rm`, `rm.exe`);
- URL (`schema://`) e rinvii (`> file`, `2>/dev/null`) non sono percorsi.

**Per non aprire buchi**, il testo che la shell *esegue* si rilegge come comando:
- `$(…)`, i backtick di bash, `$(…)` dentro le virgolette doppie;
- `bash/sh/zsh -c "…"`, `powershell/pwsh -Command "…"` (anche `-EncodedCommand`, decodificato), `cmd /c …`, `wsl …`;
- un heredoc dato a una shell (`bash <<EOF`).

Restano coperti anche:
- `cd`/`Set-Location`/`pushd`, che cambiano la cartella base per i pezzi dopo (`cd /c/altro && rm -rf build` è bloccato);
- `git -C dir clean|rm|worktree remove`;
- `find … -delete` / `-exec rm`;
- una cancellazione senza percorsi (`xargs rm`, `… | Remove-Item`), che si giudica sulla cartella corrente: se è la cartella di lavoro intera, è bloccata.

**Trappola:** in bash la `\` toglie il significato solo ai caratteri speciali. Davanti a una lettera resta, così `E:\Progetti\x` resta un percorso Windows.

# Test

`tests/autopilot-host/divieti-coordinatore.test.ts`, «i divieti senza falsi allarmi (0.37.1)»:
- il comando reale del 01/10;
- `curl -X POST http://…/autopiloti/x/archivia`, `grep -rn "rm " src`, `node -e` con «del» in una stringa, un heredoc con `rm`/`del` dentro, `git commit -m` con «rm»;
- 20 cancellazioni vere che restano bloccate (sudo, env, `"rm"` citato, `/bin/rm`, `cd` + `rm`, `git -C`, `git clean`, `find -delete`/`-exec rm`, `xargs rm`, `bash -c`, `$(…)`, backtick, `bash <<EOF`, Remove-Item, `powershell -Command`, `cmd /c rd`, `del`) e due dallo strumento PowerShell;
- le cancellazioni dentro le sue cartelle continuano a passare.
