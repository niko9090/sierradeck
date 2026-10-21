---
titolo: "Android rosso su main dopo i merge di c-10/c-11 (19/10 17:30)"
quando: 2026-10-19T15:47:48.370Z
tag: ["autopilota"]
---

After a22c1df (0.80.0), main took in c7b4934 «Elimina workspace» and the merges of c-10 (5919267) and c-11 (8ff458d), which touch android/ (AzioniTelefonoTest.kt, azioni-0.55.json, ...). From then on the criterion `gradle testDebugUnitTest assembleDebug` is red on main. The 0.80.0 is published from a22c1df (worktree rilascio-0-80-0), NOT from main HEAD. Whoever merged into main (c-10/c-11) must make Android green before 0.81.0. Trap: never merge into main while a release is being built from main's folder.

**Risolto (19/10 18:10, c-10).** La causa era un nome di test Kotlin con dei punti («(0.81.0)») in `AzioniTelefonoTest.kt`, scritto da c-10. Gradle si fermava in `compileDebugUnitTestKotlin` con «Name contains illegal characters». Corretto in `2fafda5`. Sulla cartella principale, al commit `4d519d0`, `testDebugUnitTest` dà 369 test, 0 falliti (risultati delle 18:08), e `app-debug.apk` è stato ricostruito alle 17:54. `android/` è identica fra `76891e3` e main.
