---
titolo: "Giri dell'autopilota più veloci: dove andava il tempo, cache dei criteri, tempi misurati (0.71.0)"
quando: 2026-10-13T14:16:00+02:00
tag: ["autopilota", "velocità", "criteri", "misure", "0.71.0"]
---

# Prima (misurato sul PC vero, 9–13/10, in sola lettura)

Fonti:
- la trascrizione della chat governata: fine del turno → prossimo messaggio;
- la sessione del supervisore: richiesta → ultima risposta;
- il registro dei passi delle consegne.

| Fase | Mediana | Note |
|---|---|---|
| Fine turno → istruzione nella chat, via consegna | 76 s | n=24 |
| Fine turno → risposta dell'hook Stop | 155 s | n=23 |
| Decisione del supervisore | 17 s | p90 45 s, n=88; prompt di circa 10 000 caratteri |
| Consegna: ritiro → «partita» | 3–15 s | 2,5 s di verifica dopo l'Invio; fino a 14 s ad aspettare il prompt di una chat appena ripresa |

**Dove andava il tempo**: nei criteri, rimisurati **in fila a ogni fermata**. Nella consegna c-13 erano undici, fra cui npm test, gradle e gh release.

# Cosa è cambiato (`src/autopilot-host/criteri-veloci.ts`)

- **Cache sull'impronta del codice** (`improntaCodice`: HEAD + status + diff + dimensione e data dei file non tracciati), valida 10 minuti.
  - Mai in cache i comandi che guardano fuori (`guardaFuori`: gh, curl, git fetch…).
- **Comandi lunghi a turni alterni** (`ePesante`: gradle, npm test, vitest run…): si misurano il primo turno, poi ogni 3, e **sempre prima di accettare «finito»**. Negli altri turni vale l'ultimo esito, e il quadro lo dice: «esito delle hh:mm, non rimisurato».
- **Al massimo 2 comandi insieme.**
- **I tempi di ogni giro** (`tempi.ts`, `servizio/tempi.jsonl`, `GET /tempi`), per fase: lettura, unione, criteri, supervisore, risposta. Si vedono nella scheda, sulla pagina e nell'app: «giro 12 s (criteri 2.0 s, supervisore 9 s) · 8 giri · criteri dalla cache 40%».

# Dopo

I numeri della prova dal vero sono nel rapporto della 0.71.0 (`rapporto-autopilota-0-71-0.md`). Quelli dei progetti veri si leggono nella scheda dopo l'installazione.

# Trappola

Lo stato dei criteri su cui ragiona il supervisore può essere vecchio di 2 turni per i comandi lunghi. Per questo «finito» rimisura sempre tutto: se qualcosa non passa, la decisione diventa «prosegui», con l'uscita dei criteri rossi.
