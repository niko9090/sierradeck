---
titolo: "c-12: 0.80.0 e 0.80.1 pubblicate e controllate, niente altro nella 0.81.0"
quando: 2026-10-20T08:30:00+02:00
tag: ["c-12", "0.80.0", "0.80.1", "0.81.0"]
---

## Cosa ha fatto c-12
- Grafica della 0.80.0 e della 0.81.0.
- Pubblicazione della 0.80.0, poi della 0.80.1 contro le fermate degli autopiloti (scheda `fermate-autopiloti-0-80-1.md`).
- Nessuna delle due è installata.
- I pezzi della 0.81.0 che restano li fanno le altre chat: `Avvisi.kt` e le voci di grafica ancora aperte vanno a chi fa le notifiche.

## Controllo dei file pubblicati della 0.80.0 (c-177): CHIUSO, tutto giusto
Rifatto dopo la pubblicazione, leggendo GitHub:
- `isDraft: false`, tag v0.80.0 = a22c1df;
- 5 allegati;
- l'APK è `SierraDeck-2.80.0.apk` (16 781 634 byte): stessa impronta sha256 dell'`assembleRelease` fresco a a22c1df, firma «O=Ferrari Consulenze», **non** la 2.79.0;
- `latest.yml` e `app-android.json` dicevano 0.80.0 e 2.80.0/0.80.0;
- le note non nominavano «Elimina workspace», che è della 0.81.0.

## Come la 0.80.1 arriva in main (20/10)
- La 0.80.1 sta sul ramo `ap/ap-f1e631f5/c-12-0-80-1`, fatto a partire dal tag v0.80.0.
- Il ramo della chat `ap/ap-f1e631f5/c-12` non c'era più: chiudendo c-12, `chiudiChat` avrebbe detto «ramo mancante» e la 0.80.1 **non** sarebbe mai entrata in main.
- Per questo il ramo `ap/ap-f1e631f5/c-12` è stato rimesso sulla stessa cima della 0.80.1. La chiusura normale della chat lo unisce, e l'unione con main è pulita.
- **Trappola:** `c-12-verifica` era partito da main, non dal tag. Unirlo alla 0.80.1 portava dentro codice di main, quindi sono state prese solo le sue schede.
