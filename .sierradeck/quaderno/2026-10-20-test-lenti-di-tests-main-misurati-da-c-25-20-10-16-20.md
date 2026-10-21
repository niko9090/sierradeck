---
titolo: "Test lenti di tests/main misurati da c-25 (20/10, 16:20)"
quando: 2026-10-20T16:21:21.802Z
tag: ["autopilota"]
---

c-25 ha misurato i file di tests/main, ognuno da solo, con il PC carico. cassaforte-sincronia.test.ts: 195 s, 4 test scaduti a 20 s. gestione-chat.test.ts: 164 s, 1 scaduto a 20 s. file-autopilota.test.ts: 60 s, 1 scaduto a 60 s (c-17 l'ha accorciato in main con 498f2b7f). file-telefono.test.ts: 46 s, passa. cassaforte-workspace-unione.test.ts: 31 s, passa. pty-host-client.test.ts: 31 s, passa. Il giro intero a copia intatta è finito da solo in 1203 s con 1 test rosso. C'era anche l'avviso di un worker di chat-di-prova.test.ts che non si chiudeva in tempo: è il primo da controllare. Trappola: il programma toglie il worktree appena unisce il ramo, quindi un giro di test lanciato in quella copia finisce in «Cannot find module» (129 file). I test vanno misurati in una copia che resti al suo posto per tutto il giro. Ancora da fare per la 0.81.0: la compilazione Android dopo che c-10 ha toccato Panoramica.kt (c-21) e le due suite verdi (c-28).
