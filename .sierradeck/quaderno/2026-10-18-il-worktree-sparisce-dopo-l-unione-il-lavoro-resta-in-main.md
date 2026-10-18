---
titolo: "Il worktree sparisce dopo l'unione, il lavoro resta in main"
quando: 2026-10-18T12:46:23.961Z
tag: ["autopilota"]
---

18/10: dopo l'unione di ap/ap-f1e631f5/c-7 (76ed7c2) il programma ha tolto il ramo e il worktree. La chat c-7 è rimasta in una cartella senza git e pensava di aver perso il lavoro. I 12 file sono uguali in main. Quindi: se una chat si trova senza git dopo la Revisione, prima guardi git log in main. Non si ricrea il worktree per aggiungere note: la chat si chiude e le note le scrive la chat successiva. Il collaudo dal vero di c-7 (note/prova-c75, porte 47670/47671) è andato bene. Le correzioni sono in main: chat di preparazione dell'autopilota contata come governata, doppio punto nel messaggio Drive, conferma della scelta multipla con le sole chat cancellabili, motivo giusto quando cambia «anche dal Drive». Da togliere a mano: note/prova-c75.
