---
titolo: "Proposta 0.80.0: misurare i criteri su una copia pulita di main"
quando: 2026-10-18T13:41:00.199Z
tag: ["autopilota"]
---

18/10, da c-7. Oggi i criteri dell'autopilota girano nella cartella principale, cioè main più i file non salvati di chi ci lavora. Così il typecheck e i test sono diventati rossi per modifiche altrui non salvate (pty-host-client, verifiche-shell, poi criteri-veloci, worktree, collegamento-rtc), non per il codice in main. Gli stessi file non salvati bloccano anche chiudiChat su c-4 e c-7 con un «conflitto». Proposta: misurare i criteri in una copia temporanea (git worktree add <tmp> main), lanciare lì i comandi e poi togliere la copia. I test che cadono solo a macchina carica (git, shell, pty host) si rilanciano da soli prima di dare il rosso. Inoltre chiudiChat per una chat il cui ramo è già unito e tolto deve chiuderla senza unire, invece di dare «not something we can merge». Da valutare per c-11, con test e Revisione.
