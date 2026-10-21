---
titolo: "Trappole delle prove: attese fisse su xterm e cache di Kotlin dopo un'unione"
quando: 2026-10-21T03:30:00+02:00
tag: ["test", "trappola", "xterm", "android", "gradle"]
---

## xterm headless: non aspettare un tempo fisso
`@xterm/headless` elabora `write()` in modo asincrono. In
`tests/main/sottofondo.test.ts` la funzione `digerisci` aspettava 20 ms fissi.
Con il PC al 100%, il test «un testo che Claude Code perde torna in coda…»
cadeva ogni tanto (21/10).

Ora il `creaTerminale` del test avvolge `write` e conta le scritture non ancora
elaborate. `digerisci` aspetta con `vi.waitFor` che il conto torni a zero:
sotto carico passa 10 volte su 10.

**Regola:** nei test con xterm si aspetta la callback di `write`, mai un tempo
fisso.

## Gradle dopo un'unione: «Unresolved reference» che non c'è
Subito dopo un `git merge`, `compileDebugKotlin` ha dato «Unresolved reference»
su funzioni che esistono (`TitoloDialogo`, `apriCartellaDa`, `Aiuto` in
`Gestione.kt`). Era la compilazione incrementale rimasta da una build fatta
prima dell'unione. Rilanciata sullo stesso albero, la build è verde.

**Regola:** prima di correggere il codice, rilancia la build. Se il file
mancante esiste, il codice non c'entra.

Nel progetto non c'è `gradlew`: si usa `gradle`.
