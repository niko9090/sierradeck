---
titolo: "Giri a vuoto sulle chat chiuse c-13 e c-15: uno ogni 40 secondi circa (20/10, 13:04-13:08)"
quando: 2026-10-20T13:08:42.531Z
tag: ["autopilota"]
---

Dalle 13:04 del 20/10 le chat chiuse c-13 e c-15 ricevono un giro del supervisore a turno, circa ogni 40 secondi: 13:05:29, 13:05:31, 13:06:11, 13:06:23, 13:06:58, 13:07:11, 13:07:41, 13:07:55. Entrambe sono finite e senza ramo: rispondono «ok» e ogni giro finisce con «prosegui» senza mosse. Ogni giro chiama un supervisore e rilegge i criteri (il criterio dei test è rosso per tempo scaduto), quindi consuma i limiti del piano senza produrre niente. Prima i giri arrivavano a qualche minuto l'uno dall'altro. Per c-18: una chat finita, o con la copia che non è un repository git, non deve far partire il giro (hook Stop / idle_prompt). Come prova serve: chat chiusa più criterio rosso → nessuna chiamata al supervisore.
