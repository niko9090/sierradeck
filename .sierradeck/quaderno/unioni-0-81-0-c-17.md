---
titolo: "0.81.0: rami uniti, rami chiusi senza unirli, workspace del 19/10 rimandati (c-17, 20/10)"
quando: 2026-10-20T16:30:00+02:00
tag: ["0.81.0", "rami", "unioni", "workspace", "rilascio"]
---

# Rami della 0.81.0 rispetto a main (consegna c-290)

Ogni ramo è passato dalla Revisione (un agente revisore per ramo, solo lettura). Le unioni sono fatte nella cartella principale, con i file puliti. Dopo ogni unione è stato eseguito il typecheck, sempre pulito.

## Uniti
| Ramo | Cosa porta | Revisione | Unione |
|---|---|---|---|
| c-18 | Drive: copia di conflitto mai persa, 403 ritentato, fusione che si ferma se i file del Drive non si leggono; dati: PIN, recupero e scritture atomiche; prestazioni | APPROVE (un MEDIO: un `workspaces.json` del Drive rovinato ferma la fusione ogni volta con «Riprova fra poco», senza via d'uscita) | `0d72a7f7`; conflitto solo in `analisi-0-80-0.md`, tenute le due parti |
| c-24 (con dentro c-231) | suite dei test a 20 min, gli altri criteri col tempo di prima; hook a 3600 s; `worktree.test.ts` più veloce | APPROVE | `4af604b8`; conflitto solo nel quaderno |
| c-10 | righe brevi solo per gli eventi che contano; «Ha finito» / «Si è fermato» su PC, pagina e app | APPROVE dopo il conflitto | `c3f12759`; conflitto sulla riga di `import` da `@shared/autopilota` in `server.ts`: tenuti tutti i nomi. 150 test di `server.test.ts` e `righe-che-contano.test.ts` verdi |
| c-12-verifica | due schede del controllo della 0.80.0 | — (solo quaderno) | `b6d56936`; tenuta la scheda di main, più recente |
| c-241 (= c-22) | notifiche: consegne in sottofondo, scelte non riannunciate, Domande che non lampeggiano due volte, `salvaLavoro` solo nel suo worktree | APPROVE | unito dall'autopilota (`b8cc5b4b`); c-22 ha gli stessi commit |

## Chiusi senza unirli (`git merge -s ours`, il contenuto NON entra)
Così `chiudiChat` li trova uniti e li chiude. Il lavoro resta nella storia di git.
- **c-3:** doppione di «Errori arrivati» (quello di c-14 in main fa le stesse cose e di più). Unirlo avrebbe creato due giri paralleli, con il rischio di due autopiloti per gli stessi errori.
- **c-19:** la nota «rilascio in attesa» è superata.
- **c-23 e c-248:** la correzione di `worktree.test.ts` (`fea2942c`) è superata da quella di c-24. Se serve, si possono riportare in c-24 le due righe utili: `maintenance.auto=false` e `gc.auto=0` nel repository modello.
- **c-12 e c-12-0-80-1:** erano già in main.

## Workspace sbagliati del 19/10: rimandati, NON toccati
Il compito era metterli nel recupero di 30 giorni e spostare l'autopilota in NexoraOS. Non si può fare adesso, per tre motivi:
1. **Il programma installato è la 0.80.1.** Lì «Elimina workspace» toglie il workspace dall'elenco, con una copia messa da parte, ma non mette la cartella nel recupero di 30 giorni: quello arriva con la 0.81.0.
2. **Non esiste una rotta per spostare un autopilota in un altro workspace.** Il campo `workspace` si sceglie solo alla creazione, quindi lo spostamento vorrebbe dire modificare a mano il file dell'autopilota (`ap-79a4ce02…`) mentre il servizio gira. Le regole lo vietano.
3. **`E:\Users\nikof\Documents\VisitaFacile` NON è più vuota.** È la cartella dell'autopilota «Recupero VisitaFacile da nexora-nas», che il 20/10 era in stato `lavoro`. Dentro ci sono `STATO_PROGETTO.md` (il suo resoconto) e `.sierradeck/`. Non va nel recupero insieme al workspace «visitafacile».

Le cartelle davvero vuote sono `C:\Users\nikof\Progetti SierraDeck\visitafacile` e `C:\Users\nikof\Progetti SierraDeck\dentro al mio server nexora c'è gia un`.

**Dopo che Nicholas installa la 0.81.0:**
- prima si sposta l'autopilota in NexoraOS, come ha risposto lui (serve una funzione «sposta in un altro workspace», che oggi non c'è);
- poi si eliminano i due workspace dal programma, con il recupero;
- la cartella `Documents\VisitaFacile` resta all'autopilota.

Il visitafacile vero su DESKTOP non va toccato.
