---
titolo: "0.71.0: da verificare dopo l'installazione di Nicholas"
quando: 2026-10-13T12:38:57.481Z
tag: ["autopilota"]
---

13/10/2026: la 0.71.0 (app 2.71.0) è pubblicata e NON installata. Installa solo Nicholas.

Dopo che l'ha installata:
1. Prova vera di «Sposta su ▾» fra due PC, con un progetto «SierraDeck-prova-…», verificando avanzamento e «Annulla tutto». Il portatile oggi è spento.
2. I tempi del giro dell'autopilota sui progetti veri: in prova erano circa 28 s, prima la media era 155 s.
3. Verificare che una consegna dal sottofondo al riquadro arrivi («partita» nel registro).
4. Togliere i progetti di prova.

Nota: il commit b13a377 ha il messaggio dell'autopilota di prova ma contiene lavoro vero della 0.71.0. La causa, cioè salvaLavoro fuori da un ramo ap/, è corretta in b72155f. Non riscrivere la storia senza il sì di Nicholas.
