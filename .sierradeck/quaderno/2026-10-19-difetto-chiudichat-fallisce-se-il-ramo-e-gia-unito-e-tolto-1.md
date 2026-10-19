---
titolo: "Difetto: chiudiChat fallisce se il ramo è già unito e tolto (19/10)"
quando: 2026-10-19T09:24:03.844Z
tag: ["autopilota"]
---

c-7 e c-4 hanno finito, il loro lavoro è in main (76ed7c2), ma chiudiChat dà «merge: ap/ap-f1e631f5/c-7 - not something we can merge» perché il ramo e il worktree sono già stati tolti dopo l'unione. Così le chat finite restano aperte, e Nicholas il 19/10 ha chiesto che le chat finite si chiudano («se no non si capisce più niente»). Correzione per la 0.80.0 (c-11): se il ramo non esiste più ed è già contenuto in main (git merge-base --is-ancestor o l'assenza del ramo più un commit di unione nel registro), chiudiChat chiude la chat senza unire, con un test.
