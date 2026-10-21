---
titolo: "c-7 chiusa senza unire: il ramo era già in main (21/10)"
quando: 2026-10-21T08:36:28.636Z
tag: ["autopilota"]
---

Il lavoro di collaudo 0.79.0 di c-7 è in main (76ed7c2 contiene 2c5b8e5), poi il ramo è stato cancellato e la cartella non è più un worktree. Il «da rifare» della Revisione c-8 per il rosso Android non vale per c-7: il suo diff tocca solo src/shared/gestione-chat.ts e i test, niente android/. Probabilmente è stata la lentezza del PC carico (Gradle 44 min). Scelta per il rapporto 0.83.0: c-7 chiusa senza unire, perché è già in main.
