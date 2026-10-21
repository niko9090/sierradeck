---
titolo: "Doppione c-23 / c-24 sull'esito dei test di main (20/10)"
quando: 2026-10-20T11:34:59.606Z
tag: ["autopilota"]
---

c-23 e c-24 hanno lo stesso compito: produrre l'esito JSON della suite intera sul commit di main per il criterio «I test del programma passano». Puntano però a file diversi: c-23 a SierraDeck.sierradeck-wt/esiti/test-<commit>.json, c-24 a .git/esito-test.json. Ne basta una. Va tenuta quella che scrive il file letto dal criterio attivo in quel momento, e l'altra va chiusa senza lanciare una seconda suite: due corse insieme fanno scadere il tempo a tutte e due. Il criterio deve usare percorsi assoluti (vedi la scheda «Trappola: il criterio a file d'esito deve usare percorsi assoluti»), perché le chat chiuse non hanno più git.
