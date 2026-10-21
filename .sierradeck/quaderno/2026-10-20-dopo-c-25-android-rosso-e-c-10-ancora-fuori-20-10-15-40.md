---
titolo: "Dopo c-25: Android rosso e c-10 ancora fuori (20/10, 15:40)"
quando: 2026-10-20T15:44:17.214Z
tag: ["autopilota"]
---

c-25 ha chiuso i rami della 0.81.0, ramo per ramo, in chiusura-rami-0-81-0.md (in main con 42a4b402). c-3 è stata scartata perché doppia di «Errori arrivati» (c-14, già in main). Restano due cose. 1) Il ramo ap/ap-f1e631f5/c-10 ha ancora db268e9f fuori da main: solo docs, da unire quando si chiude c-10. 2) Alle 15:38 il criterio «L'app Android compila e i suoi test unitari passano» è diventato rosso dopo l'unione di c-10, che tocca Panoramica.kt. Va controllato da c-21 prima del rilascio 0.81.0 (c-28). I test vitest risultano rossi o non misurabili per i tempi scaduti, con il PC carico (21 suite aperte alle 17:10).

**Controllato da c-10 (18:20):** `cd android && gradle testDebugUnitTest assembleDebug --no-daemon` sul ramo c-10, che contiene tutto main fino a `42a4b402` (0.81.0, `Panoramica.kt` compreso):
- **BUILD SUCCESSFUL, 380 test, 0 falliti, 0 errori**;
- **22 min 25 s** (17:57–18:20), con il PC carico.

Il rosso delle 15:38 non viene da `Panoramica.kt`: è tempo scaduto, come per i criteri di vitest. Il ramo c-10 ha fuori da main solo il quaderno (`db268e9f`).
