---
titolo: "Trappola: il ramo non si unisce perché un file è sporco nella cartella principale"
quando: 2026-10-24T02:30:00+02:00
tag: ["unione", "trappola", "quaderno", "giro-senza-fine"]
---

Il 24/10 c-149 è rimasta per oltre 10 giri con «i criteri passano tutti, ma il supervisore non ha detto se il lavoro è concluso». Il ramo entrava senza conflitti (`git merge-tree` pulito), eppure `main` restava fermo.

**Causa:** nella cartella principale c'erano modifiche non salvate a file del quaderno (`git status`: ` M .sierradeck/quaderno/trappola-giro-senza-fine-chat-finita-0-85-0.md` e altri). Il ramo cambiava proprio uno di quei file, e `git merge` rifiuta di sovrascrivere modifiche locali. L'hook non lo dice: rifà il giro e basta.

**Rimedio dalla copia, senza toccare la cartella principale:**
1. `cd /e/Users/nikof/Documents/SierraDeck && git status --short`, solo per leggere;
2. `git diff --name-only main HEAD` nella copia;
3. per ogni file che compare in tutti e due: `git checkout main -- <file>` nella copia, poi commit. Se la modifica serve, va in una scheda nuova.

**Regola:** le schede «giro senza fine visto anche su c-N» si scrivono in un file nuovo, non nella scheda comune: proprio quella resta spesso sporca nella cartella principale. Vedi anche la regola «niente codice in main con l'autopilota».
