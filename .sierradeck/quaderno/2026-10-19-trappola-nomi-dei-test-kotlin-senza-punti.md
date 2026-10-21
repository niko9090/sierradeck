---
titolo: "Trappola: nomi dei test Kotlin senza punti"
quando: 2026-10-19T15:59:32.258Z
tag: ["autopilota"]
---

Il 19/10 Gradle testDebugUnitTest è caduto per un test di c-10 che aveva «0.81.0» nel nome fra apici inversi: in Kotlin/JVM i punti lì non sono ammessi. Corretto con 2fafda5. Dopo la correzione: 369 test passati, 0 falliti, PonteTest compreso. La cartella di lavoro non ha gradlew: si usa gradle.
