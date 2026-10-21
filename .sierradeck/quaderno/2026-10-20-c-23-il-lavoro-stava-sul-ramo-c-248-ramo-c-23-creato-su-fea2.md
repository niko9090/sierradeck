---
titolo: "c-23: il lavoro stava sul ramo c-248, ramo c-23 creato su fea2942c (20/10)"
quando: 2026-10-20T11:16:01.756Z
tag: ["autopilota"]
---

La chat c-23 ha lavorato nella cartella c-248-test sul ramo ap/ap-f1e631f5/c-248 (commit fea2942c: repository finto copiato invece che ricreato, manutenzione di git spenta nei test, file worktree da 143 s a 105 s con la CPU al 100%, nessun tempo limite alzato). Il ramo ap/ap-f1e631f5/c-23 non c'era, quindi chiudiChat non trovava niente e la chat ha ricevuto 7 consegne uguali. Il supervisore ha creato il ramo ap/ap-f1e631f5/c-23 su fea2942c e ha chiuso c-23. Trappola: quando una chat lavora su un ramo con un nome diverso dal suo, va creato il ramo col nome della chat prima di chiuderla.
