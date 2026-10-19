---
titolo: "0.80.0: pubblicare da 836d2dd, diff pulito (c-7, 19/10 14:02)"
quando: 2026-10-19T14:02:35.728Z
tag: ["autopilota"]
---

Ho controllato le righe aggiunte da v0.79.0 a main in src, tests, android e assets. Non ci sono nomi di PC, percorsi personali, numeri di telefono né «nikof». Come IP c'è solo 127.0.0.1 e come email solo prova@esempio.it nei test. «Nicholas» compare solo come nome, in commenti e nomi di test, senza cognome. Le versioni sono allineate: package.json 0.80.0, android/app/build.gradle.kts:49 versionName 2.80.0 con versionCode 136, novita.ts:44 '0.80.0'. Si pubblica da 836d2dd e non da d947277, perché 836d2dd corregge due righe delle novità: il nome del workspace e l'avviso senza autopilota.
