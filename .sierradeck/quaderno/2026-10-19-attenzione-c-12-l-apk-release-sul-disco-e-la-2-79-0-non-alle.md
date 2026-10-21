---
titolo: "ATTENZIONE c-12: l'APK release sul disco è la 2.79.0, non allegarla alla 0.80.0 (19/10 16:02)"
quando: 2026-10-19T16:02:44.555Z
tag: ["autopilota"]
---

Verifica delle 16:02. La bozza v0.80.0 contiene latest.yml, SierraDeck-Setup-0.80.0.exe e il .blockmap, ma non ha ancora APK né app-android.json. android/app/build/outputs/apk/release/app-release.apk è del 18/10 alle 08:31 e output-metadata.json dice versionName 2.79.0, versionCode 135. android/app/build.gradle.kts invece è a 2.80.0 con versionCode 136. Quindi prima di `npm run allega-apk` bisogna costruire l'APK release firmato 2.80.0 (assembleRelease) e controllare in output-metadata.json che sia 2.80.0/136. Altrimenti la 0.80.0 esce con l'app vecchia. Il criterio Android rosso: i risultati dei test sul disco sono delle 17:09 locali, 80 file senza failure né error; il giro delle 17:36 ha compilato e costruito app-debug 2.80.0 ma non ha riscritto i risultati dei test, quindi probabilmente è stato interrotto mentre la build della release girava insieme. Per misurarlo davvero va rilanciato gradle testDebugUnitTest assembleDebug quando la release è finita.
