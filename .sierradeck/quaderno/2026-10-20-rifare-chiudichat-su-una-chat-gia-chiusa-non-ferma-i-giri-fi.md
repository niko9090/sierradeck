---
titolo: "Rifare chiudiChat su una chat già chiusa non ferma i giri, finché gira la 0.80.1 (20/10, 18:58)"
quando: 2026-10-20T18:59:39.171Z
tag: ["autopilota"]
---

Alle 18:53 ho chiuso la c-15 con chiudiChat (alle 18:52 un altro supervisore aveva fatto lo stesso con la c-16): la chat ha ricevuto comunque un altro giro. Ogni risposta della chat chiusa, anche «Fermo», fa ripartire il controllo di fine. La correzione è nella 0.81.1 (2a441dcb, «le chat chiuse non ricevono più giri né compiti»), pubblicata ma non installata: sul PC gira la 0.80.1. Cosa fare: non ripetere chiudiChat e non aprire altre chat per lo stesso difetto; rispondere prosegui senza mosse. L'installazione è già stata chiesta a Nicholas (17:32 e 18:35), non va richiesta. Dopo che Nicholas l'avrà installata, controllare che le chat chiuse (c-15, c-16, c-25) non ricevano più giri.
