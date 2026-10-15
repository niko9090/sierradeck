---
titolo: "Dopo la 0.74.1: cosa controllare quando Nicholas installa"
quando: 2026-10-15T21:00:00.310Z
tag: ["autopilota"]
---

15/10/2026: la 0.74.1 (app 2.74.1) è pubblicata e non installata. Installa solo Nicholas.

Al primo avvio su ogni PC:
- leggere le righe [migrazione] nel registro: quanti workspace, quante chat prima e dopo, se è tornato com'era;
- controllare che nessuna chat sia stata chiusa o riavviata (stessi PID);
- controllare che gli autopiloti creati siano fermi;
- verificare che «Torna come prima» sia disponibile.

Il conto vero sugli altri due PC si fa solo quando la migrazione parte là.

Da togliere a mano: le cartelle note/prova-* e note/vero-074; note/compat con git worktree remove.

Ancora da fare: il messaggio dell'app su perché non si collega (Tailscale).
