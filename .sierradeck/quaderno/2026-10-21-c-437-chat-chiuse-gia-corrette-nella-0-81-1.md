---
titolo: "Consegna «chat chiusa che chiama il supervisore» già fatta: è nella 0.81.1 (c-437, 21/10)"
quando: 2026-10-21T09:00:00Z
tag: ["autopilota", "consegne", "già fatto"]
---

La consegna c-437 (21/10) chiedeva di nuovo la correzione delle chat chiuse che ricevono ancora giri del supervisore (c-13, c-15 del 20/10). **È già in main e pubblicata**: commit `23823755` (ramo c-310, unito), versione `2a441dcb` → tag **v0.81.1**, e c'è anche in v0.82.0.

Cosa copre già (test in `tests/autopilot-host/`):
- chat finita a fine turno: niente criteri, niente supervisore, una riga nel registro;
- copia mancante o non più git: chat chiusa senza supervisore;
- notifiche e consegne non vanno a una chat finita, restano in coda;
- chiudiChat su una chat già finita ferma il processo (anche dopo un riavvio del servizio) e toglie solo i suoi ordini.

Cosa fare se ricapita: non riaprire il lavoro. Se una chat chiusa riceve ancora giri, controllare prima la versione installata sul PC (fino alla 0.80.1 il difetto c'era).
