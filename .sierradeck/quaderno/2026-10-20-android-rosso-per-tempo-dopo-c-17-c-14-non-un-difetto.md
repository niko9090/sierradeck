---
titolo: "Android rosso dopo c-17/c-14 (20/10): è il tempo, non un difetto"
quando: 2026-10-20T09:55:00Z
tag: ["autopilota", "android", "criteri", "tempo-limite"]
---

**Cosa.** Alle 09:20 UTC del 20/10 il criterio «L'app Android compila e i suoi test unitari passano» è diventato rosso, subito dopo le unioni di c-17 (5187eed7, notifiche) e c-14 (4cb3f4a5, storico degli errori). Le due unioni toccano 14 file in android/.

**Misurato da c-235** su main 4cb3f4a5, in una cartella di lavoro pulita (ap/ap-f1e631f5/c-235), con lo stesso comando del criterio:
- prima compilazione: **12 min 7 s** (741 s in tutto), BUILD SUCCESSFUL. **377 test, 0 falliti, 0 errori**, fra cui ErroriAppTest e NotificheTest;
- seconda compilazione, con tutto già fatto: **1 min 46 s**;
- anche nella cartella principale, alle 09:27–09:29 UTC, c'è un giro finito con 377 test passati e app-debug.apk ricostruito.

**Causa.** Le modifiche ad android/ fanno ricompilare da capo Kotlin e i test. Con le altre chat al lavoro questo supera i **10 minuti** di `TIMEOUT_PREDEFINITO_MS` (src/autopilot-host/verifiche.ts:14), che valgono per ogni criterio. È lo stesso problema della scheda «Criterio "I test del programma passano" rosso per tempo». Non ci sono nomi di test Kotlin con caratteri vietati: c'è solo un avviso per un «?» in AzioniTelefonoTest.kt:88, che non blocca.

**Cosa fare.** Se ne occupa c-20 (decisione del supervisore, 20/10): verifiche.ts lo tocca solo c-20. Il codice Android non va cambiato. Va corretto il tempo dei criteri: un tempo per ogni criterio, almeno 20 min per gradle e per la suite vitest. In alternativa, la rimisura deve partire solo quando non c'è un altro comando pesante in corso. Dopo ogni unione che tocca android/, aspettarsi la prima rimisura lenta.

**Resto da togliere.** A c-235 è rimasta la cartella `SierraDeck.sierradeck-wt/c-235-android`: contiene solo la build, git non la conta più come cartella di lavoro e non ha nessun ramo. git non è riuscito a cancellarla per i percorsi troppo lunghi, e la guardia delle cancellazioni ha bloccato `rd /s` perché è fuori dalle cartelle dell'autopilota. La toglie la pulizia di SierraDeck (decisione del supervisore): non si cancella a mano e non si chiede a Nicholas.

**21/10, rimisura (c-439/c-482)** su main 41bcf37e (0.82.0), in una cartella di lavoro pulita (`c-439-android`), con lo stesso comando del criterio:
- risultato: **BUILD SUCCESSFUL**, **394 test, 0 falliti**, app-debug.apk costruito;
- tempo: **44 min 46 s**, perché la compilazione partiva da zero mentre giravano altre 3 JVM di Gradle di altre chat.

Il codice è sano. Con la 0.83.0, che ristruttura android/ e ha molte chat su Gradle insieme, la prima compilazione di ogni cartella nuova supera di molto anche i 20 minuti. Quindi un criterio Android rosso va prima letto: test falliti o tempo scaduto? Conviene una sola compilazione Gradle per volta.
- Resta anche `SierraDeck.sierradeck-wt/c-439-android` (solo build, git non la conta più come cartella di lavoro): la toglie la pulizia di SierraDeck, come c-235.
