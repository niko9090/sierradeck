---
titolo: "0.81.0: la bozza delle 16:40 è vecchia, va rifatta dopo l'unione di c-310 (20/10)"
quando: 2026-10-20T17:04:57.843Z
tag: ["autopilota"]
---

Su GitHub c'è una bozza della v0.81.0 creata alle 16:40 UTC. È di prima dell'unione di c-17 (f09264db) e di c-310 (la correzione per cui le chat chiuse non ricevono più giri né compiti, fatta da c-29 fuori dal servizio). c-28 non deve rendere pubblica quella bozza: deve aspettare che c-310 sia in main e poi rifare la build e gli allegati da main (latest.yml, APK firmato con npm run allega-apk, app-android.json). Una release sola, non bozza, mai installata.
