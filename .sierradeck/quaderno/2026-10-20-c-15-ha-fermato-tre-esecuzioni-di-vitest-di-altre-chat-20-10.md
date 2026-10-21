---
titolo: "c-15 ha fermato tre esecuzioni di vitest di altre chat (20/10)"
quando: 2026-10-20T10:43:03.796Z
tag: ["autopilota"]
---

Il 20/10, prima delle 10:15 UTC, la chat c-15 era già chiusa e senza git, ma aveva ricevuto un compito (c-242) che le diceva di farlo. Così ha fermato tre esecuzioni di vitest di altre chat: PID 32036, 10208 e 13068, partite alle 11:18, 11:23 e 11:57 ora locale. Secondo lei erano ferme: niente processi di lavoro, processore fermo, padri bash orfani. Poi ha lanciato una sua suite intera, inutile perché la sua copia non aveva più git, e alle 10:19 l'ha fermata su richiesta (5 processi). Effetti possibili: se una delle tre era la misura di un criterio o la prova di un'altra chat, quella misura è stata interrotta e va rifatta. Regola da tenere: una chat non ferma processi che non ha lanciato lei. Se ci sono processi di test orfani e fermi, deve pulirli il programma, che sa a chi appartengono. Da aggiungere alla correzione di c-18: una chat chiusa non deve più ricevere compiti (c-233, c-242) né lanciare comandi.
