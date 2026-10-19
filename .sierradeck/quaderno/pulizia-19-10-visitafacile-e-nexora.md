---
titolo: "Pulizia del 19/10: i workspace «visitafacile» e «dentro al mio server nexora…» NON tolti"
quando: 2026-10-19T11:55:00+02:00
tag: ["pulizia", "0.80.0", "workspace", "autopilota", "da decidere con Nicholas"]
---

Compito della pulizia di oggi, punto 2: «se la chat VisitaFacile è vuota, metti nel recupero i due workspace creati per sbaglio alle 11:18 e alle 11:20». **Non ho tolto niente.** La chat VisitaFacile è vuota, ma uno dei due workspace è la casa di un autopilota vero.

## Cosa c'è
- **Workspace «visitafacile»** (11:18):
  - un riquadro con la chat `e6ecbaf0…`, che non ha nessun file (vuota);
  - cartella `E:\Users\nikof\Documents\VisitaFacile`, vuota, creata alle 11:18;
  - c'è anche `C:\Users\nikof\Progetti SierraDeck\visitafacile`, vuota.
- **Workspace «dentro al mio server nexora c'è gia un»** (11:20):
  - è il workspace dell'autopilota `ap-79a4ce02…`, nello stato «intervista»;
  - l'obiettivo è quello scritto da Nicholas: «dentro al mio server nexora c'è gia un progetto che stiamo cominciando. riprendi in mano tutto e vediamo a che punto sia»;
  - la sua cartella di lavoro è proprio `E:\Users\nikof\Documents\VisitaFacile`;
  - l'intervista è la chat `353b4549…` (674 KB, dalle 11:20 alle 11:28 del 19/10), in `~/.claude/projects/E--Users-nikof-Documents-VisitaFacile/`;
  - c'è anche `C:\Users\nikof\Progetti SierraDeck\dentro al mio server nexora c'è gia un`, vuota.

## Perché non l'ho tolto
Togliendo il workspace o la cartella VisitaFacile, l'autopilota resta senza casa e si perde la richiesta di Nicholas su NexoraOS. Il compito dice «se la chat non è vuota, fermati e scrivi a Nicholas cosa contiene».

## Da decidere con Nicholas
- L'autopilota sul server Nexora va rifatto nel workspace **NexoraOS**, nella sua cartella (`E:\Users\nikof\Documents\NexoraOS`)? Oppure va tenuto così?
- Dopo la sua risposta si possono mettere nel recupero di 30 giorni, con `cancellaSicura`:
  - i due workspace;
  - le tre cartelle vuote;
  - l'autopilota `ap-79a4ce02`, se va rifatto.
- Il progetto vero visitafacile vive su DESKTOP: non toccato.

## Causa (va in «Difetti di chat e workspace», punti 2 e 3)
- Aprire «visitafacile», che vive su DESKTOP, ha creato qui una cartella vuota nuova.
- Il primo messaggio all'autopilota è diventato il nome di un workspace con la sua cartella.

## Dopo (19/10, 12:15)
- **`/api/workspace/elimina` è vietata alle chat**, e non va aggirata né con altre rotte né a mano sui file. I due workspace li toglie Nicholas con «Elimina workspace» (recupero di 30 giorni). Sono scritti in `analisi-0-80-0.md`.
- **La cartella «…\ap-f1e631f5-c-11\$APPDATA\SierraDeck\$S\chiave.txt» non viene da un test.** L'ha creata la chat c-11 con un suo comando di shell, quello che preparava una chiave per un dispositivo temporaneo:
  - dentro `node -e '…'` il percorso è arrivato con `$APPDATA` e `$S` non sostituiti;
  - Node ha scritto il file in una cartella che si chiama proprio «$APPDATA», sotto la cartella di lavoro di c-11.
  - In `src`, `tests` e `scripts` (main e rami c-10/c-11/c-12) nessun test scrive `chiave.txt` o un `$APPDATA` letterale.
  - Quel comando ha anche aggiunto il dispositivo «collaudoc11tmp» al `dispositivi.json` vero e ha chiamato `/api/workspace/elimina` sui due workspace.
  - Alle 12:10 il dispositivo era già tolto (resta solo il telefono), i due workspace c'erano ancora e non risultavano fra gli eliminati: nessun danno.
  - La cartella sparisce quando si toglie il worktree di c-11: non va cancellata a mano.
- **Trappola:** in un comando, una variabile messa dentro le virgolette singole di `node -e '…'` non viene sostituita. Il percorso va passato come argomento (`node -e '…' "$S"` e `process.argv[1]`) o costruito in JavaScript con `process.env.APPDATA`.
