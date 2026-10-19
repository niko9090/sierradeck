---
titolo: "Difetto: chiudiChat fallisce se il ramo è già unito e tolto (19/10)"
quando: 2026-10-19T09:24:03.844Z
tag: ["autopilota"]
---

c-7 e c-4 hanno finito, il loro lavoro è in main (76ed7c2), ma chiudiChat dà «merge: ap/ap-f1e631f5/c-7 - not something we can merge» perché il ramo e il worktree sono già stati tolti dopo l'unione. Così le chat finite restano aperte, e Nicholas il 19/10 ha chiesto che le chat finite si chiudano («se no non si capisce più niente»). Correzione per la 0.80.0 (c-11): se il ramo non esiste più ed è già contenuto in main (git merge-base --is-ancestor o l'assenza del ramo più un commit di unione nel registro), chiudiChat chiude la chat senza unire, con un test.

**Stato al 19/10, 11:50 (c-3, Rilascio):**
- **Correzione scelta:** quella di c-11, `12f85e0` sul ramo `ap/ap-f1e631f5/c-11`. In `unisciRamo`, un ramo mancante o già contenuto nel principale vale come «niente da unire». Gli avvisi LF/CRLF non contano più come file in conflitto.
- **La mia versione:** una seconda versione, fatta in parallelo su `main`, non è stata salvata perché sarebbe andata in conflitto con quella di c-11. È in `note/chiudichat-versione-c3-non-usata.patch`. Contiene due cose che in `12f85e0` mancano:
  - tre test sul server, con git vero, per ramo assente, già unito e con lavoro nuovo;
  - con il ramo assente, la chat si chiude subito senza aprire una Revisione su un ramo che non c'è.
  Si possono riprendere dopo che c-11 è stato unito.
- **Trappola:** mai lasciare modifiche non salvate in `main` mentre l'autopilota lavora. Le unioni avvengono nella cartella di `main`: con file sporchi ogni `chiudiChat` fallisce. È già successo, alle 09:39 UTC, con i file della versione qui sopra.
