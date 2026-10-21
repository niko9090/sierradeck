---
titolo: "Notifiche 0.81.0: cosa è fatto e cosa resta (c-7, 19/10 16:27 UTC)"
quando: 2026-10-19T16:28:41.667Z
tag: ["autopilota"]
---

Fatto:
- Pagina: avvisi vicini raggruppati con d42b943 e 903537c (avvisiDaMostrare in src/shared/avvisi-raggruppati, usato in client-pagina.ts:5591); scritti nel registro del PC con 903537c e bcb2ae4.
- App: raggruppati con b684c67 (gli avvisi a meno di 20 s vanno nella pila in silenzio, Ronda.kt:270-272); scritti nel registro con Ronda.kt:144.
- Chat governate in sottofondo non più «aspetta te»: 528ea3c e 9b2c286.

Da fare:
1) Togliere «ripreso»: server.ts:1223 avvisa('ripreso') e telegram.ts:99.
2) «sospeso» solo quando aspetta davvero Nicholas (permesso, domanda, errore che blocca). Serve un filtro unico in src/shared/autopilota.ts, da usare nelle 7 avvisa('sospeso') di server.ts, in client-pagina.ts:5631 e in Avvisi.kt:289.
3) Raggruppare gli avvisi vicini su Telegram: creaAvvisatore (telegram.ts:155) oggi manda un messaggio per ogni chiamata.
4) chiaveFermo (src/shared/autopilota.ts:983) è id|stato|fermatoIl|motivo: ogni pausa automatica fa un avviso nuovo su pagina (client-pagina.ts:5626) e app (Avvisi.kt:294). Serve una chiave che non cambi a ogni pausa automatica.
5) Registro: Telegram scrive solo console.log (telegram.ts:166). La notifica Electron (index.ts:6317) e il lampeggio della finestra Domande non sono ancora verificati.
Poi la prova nella copia di prova, con un autopilota al lavoro, e i numeri nel rapporto.
