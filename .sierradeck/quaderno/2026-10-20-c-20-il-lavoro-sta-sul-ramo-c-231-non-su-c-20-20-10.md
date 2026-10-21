---
titolo: "c-20: il lavoro sta sul ramo c-231, non su c-20 (20/10)"
quando: 2026-10-20T10:05:25.163Z
tag: ["autopilota"]
---

La chat c-20 (criterio della suite rosso per tempo) ha lavorato nella cartella .sierradeck-wt/c-231-tempo, sul ramo ap/ap-f1e631f5/c-231 (459d0bae, 3a865b07: 20 minuti alla suite, tetto dell'hook a 3600 s). Prima di chiudere c-20 con chiudiChat bisogna puntare ap/ap-f1e631f5/c-20 a quel ramo, altrimenti chiudiChat vede «ramo mancante» e chiude senza unire. Trappola: con il PC carico non aspettare la suite intera per verificare una correzione, bastano i test mirati.
