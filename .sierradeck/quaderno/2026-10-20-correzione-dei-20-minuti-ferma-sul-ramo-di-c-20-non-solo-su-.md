---
titolo: "Correzione dei 20 minuti ferma sul ramo di c-20, non solo su c-231 (20/10)"
quando: 2026-10-20T11:42:27.715Z
tag: ["autopilota"]
---

I commit 459d0bae, 3a865b07 e 5a1f43be (suite dei test con 20 minuti, tetto dell'hook a 3600 s) stavano sul ramo ap/ap-f1e631f5/c-20, che è lo stesso commit di c-231. c-20 risultava finita ma il ramo non era mai stato unito. Per 9 giri il criterio «I test del programma passano» è scaduto allo stesso modo, mentre le chat aspettavano c-231. Rimedio: chiudiChat su c-20, così il ramo passa dalla Revisione ed entra in main. Trappola: una chat finita il cui ramo non è in main va chiusa con chiudiChat, non aspettata.
