---
titolo: "c-263 («ha finito il turno») già fatto da c-17: non ridarlo (20/10)"
quando: 2026-10-20T11:54:26.457Z
tag: ["autopilota"]
---

La modifica che non restava più su «aspetta te» per una chat a fine turno, ma la diceva «ha finito il turno»/«ferma» su pagina e app come sul PC, è salvata nel commit 0469fd34 (ramo ap/ap-f1e631f5/c-17) e unita in main con 3a36149f il 20/10 alle 11:50 UTC. Test: tests/main/client-pagina-spunte-e-schede.test.ts 13/13; NotificheTest e AnalisiAppTest con BUILD SUCCESSFUL. La scheda «Compito c-263 arrivato alla chat chiusa c-15: va ridato» è superata: non serve aprire chat per questo. Sempre su c-17 è in main anche la correzione dei criteri scaduti che lasciavano accese le suite di test (1e9add64, 6e508683, unita con fb205c55): vale dopo l'installazione della versione nuova.
