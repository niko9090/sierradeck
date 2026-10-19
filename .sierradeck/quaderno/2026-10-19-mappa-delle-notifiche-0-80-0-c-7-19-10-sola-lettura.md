---
titolo: "Mappa delle notifiche 0.80.0 (c-7, 19/10, sola lettura)"
quando: 2026-10-19T11:59:05.526Z
tag: ["autopilota"]
---

Ci sono 15 punti di notifica. Nessuno viene scritto nel registro e solo l'app raggruppa (Ronda.kt:261).

PC:
- index.ts:6317, aggiornamento in attesa: utile al limite.
- index.ts:4692 e finestre-pannello.ts:104, Domande con flashFrame: utile.
- telegram.ts:155, chiamato da deps.avvisa in server.ts. Tipi: domanda (1364, 1991, 2645, 2794, 2990), finito (2857), stallo (2697, 2706), pronto (1444): utili. sospeso (958, 1126, 1307, 1340, 1394, 1471, 2133, 2706): misto. ripreso (1221): non utile.

Pagina, client-pagina.ts avvisaSeServe (5512):
- domanda 5526, scelta 5536, pronto 5544, finito 5555, chat che aspetta 5569: utili.
- «si è fermato» 5556: misto.
- versione 5579: al limite.
- Il tag sostituisce l'avviso precedente dello stesso oggetto, ma non c'è raggruppamento.

App:
- Avvisi.kt e Ronda.kt:244 (d:, k:, c:, f:, p:, v:): utili.
- s: con chiaveFermo (Avvisi.kt:336) = id + momento + motivo, quindi ogni pausa fa un avviso nuovo.
- Consegne.kt:275: utile.
- RispostaVeloce.kt:106 e ControlloApp.kt:137: al limite.
- GuardiaService.kt:95: la notifica fissa va bene.

Causa probabile delle «mille notifiche»: un autopilota che si sospende e riparte spesso, più «ripreso» a ogni riavvio. Non è ancora provato su una copia.

Da fare:
- togliere «ripreso»;
- «sospeso» solo quando aspetta davvero Nicholas (permesso, domanda, errore che blocca), con la stessa regola in server.ts, client-pagina.ts:5556 e Avvisi.kt s:;
- raggruppare gli avvisi vicini dello stesso autopilota su Telegram e sulla pagina;
- scrivere ogni notifica nel registro con tipo, chat o autopilota e causa, sulle tre facce.
