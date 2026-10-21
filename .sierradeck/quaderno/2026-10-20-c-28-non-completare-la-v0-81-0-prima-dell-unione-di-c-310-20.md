---
titolo: "c-28: non completare la v0.81.0 prima dell'unione di c-310 (20/10 17:10)"
quando: 2026-10-20T17:09:10.022Z
tag: ["autopilota"]
---

Alle 17:10 UTC la bozza v0.81.0 ha già APK 2.81.0, app-android.json e il blockmap, ma non ha ancora l'.exe né latest.yml. main è a f09264db e non contiene ancora c-310, la correzione per cui le chat chiuse non ricevono più giri né compiti. c-29 la unisce adesso. Prima di rendere pubblica la release, c-28 deve controllare che `git branch --no-merged main --list 'ap/ap-f1e631f5/c-310'` sia vuoto, rifare la build dell'installer da quel main e ricaricare latest.yml, l'.exe e il blockmap. L'APK si può riallegare uguale, se android/ non è cambiato.
