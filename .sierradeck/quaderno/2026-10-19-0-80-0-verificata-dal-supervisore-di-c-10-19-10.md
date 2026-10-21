---
titolo: "0.80.0 verificata dal supervisore di c-10 (19/10)"
quando: 2026-10-19T16:20:29.591Z
tag: ["autopilota"]
---

La v0.80.0 è pubblicata e non è una bozza. Allegati: installer, blockmap, latest.yml, SierraDeck-2.80.0.apk, app-android.json. Il ramo c-10 è tutto in main (Elimina workspace + correzioni della revisione + test Kotlin senza punti) e Gradle dà 369/369. Per la 0.81.0 restano: lo storico degli errori ed «Errori arrivati» (c-3), i due workspace sbagliati da togliere dopo che Nicholas installa la 0.81.0 e il bump dell'app, perché android/ è cambiato. chiudiChat su chat con il ramo già tolto (c-7, c-12) fallisce con «not something we can merge» finché il servizio installato è la 0.79.0: riprovare dopo l'installazione della 0.80.0.
