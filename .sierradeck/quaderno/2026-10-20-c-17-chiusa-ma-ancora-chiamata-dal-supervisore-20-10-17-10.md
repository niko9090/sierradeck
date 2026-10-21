---
titolo: "c-17 chiusa ma ancora chiamata dal supervisore (20/10 17:10)"
quando: 2026-10-20T17:09:36.787Z
tag: ["autopilota"]
---

c-17 ha finito: notifiche, tre correzioni dei test lenti (498f2b7f, 6fc4fab7, 3f14cbaf) e la scheda test-lenti-a-pc-carico-0-81-0.md (bb1d313c), tutto in main con l'unione f09264db. Dalle 16:48 è chiusa due volte con chiudiChat, ma il servizio installato (0.80.1) continua a darle giri: è il difetto delle chat chiuse ancora chiamate. La correzione sta sul ramo ap/ap-f1e631f5/c-310, 2 commit non ancora uniti in main. Finché la 0.81.0 non viene installata, i giri a c-17 vanno ignorati: non c'è lavoro da darle. Stato della release v0.81.0 alle 17:10: bozza con APK 2.81.0, app-android.json e il blockmap dell'installer; mancano l'installer e latest.yml. Va rifatta dopo l'unione di c-310 (c-28).
