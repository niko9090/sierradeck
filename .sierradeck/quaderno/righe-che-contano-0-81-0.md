---
titolo: "Righe brevi solo per gli eventi che contano (0.81.0, «Nicholas partecipe» punto 4)"
quando: 2026-10-20T08:00:00Z
tag: ["0.81.0", "partecipe", "autopilota", "conversazione", "PC", "pagina", "app"]
---

Correzione di rotta di Nicholas del 20/10: «non so mai cosa sta facendo». Divisione del lavoro in `2026-10-20-partecipe-chi-fa-cosa.md`: a c-10 tocca il punto 4.

## Come funziona
- Nella conversazione dell'autopilota (a sinistra, con la Panoramica) entrano solo:
  - le battute fra Nicholas e lui;
  - le righe dei **traguardi** (`Decisione.traguardo`, scritte da `rigaTraguardo` in `src/shared/chat-autopilota.ts`);
  - le note finali «Ha finito.» e «Si è fermato.».
- Le note tecniche, i giri compresi, restano in «Cosa è successo ▸».
- Il filtro è `separaConversazione`. Ne esistono **tre copie**: `src/shared/panoramica.ts`, `src/main/client-pagina.ts` (scritta dentro la pagina) e `Panoramica.kt`. Vanno cambiate insieme.

## Traguardi nuovi (`EsitoTraguardo`)
| Esito | Chi lo scrive | Riga |
|---|---|---|
| `aperta` | `apriChatMancanti` | «Sviluppo: comincia «…».» |
| `unito` | unione del ramo della chat singola | «…: «…» unito.» (chat singola: «Lavoro unito.») |
| `mai-partita` | `riportaInCoda`, **solo** per «nessuna finestra l'ha ritirata», una volta finché c'è un altro traguardo | «… non è partita: nessuna finestra l'ha aperta. Rimetto il compito in coda e riprovo.» |
| `muta` | `controllaChatFerme`, dopo `SILENZIO_DA_DIRE_MS` (5 min) | «… non dà segnali da 5 minuti: aspetto. Se tace per un'ora la metto da parte e te lo dico.» |

## Le regole della riga «muta»
- La riga si dice una volta per silenzio. `mutaDetta` ricorda da quale segnale parte il silenzio: se la chat riparla, anche fra due giri, il silenzio è nuovo e si ridice.
- Serve un segnale vero in memoria. **Trappola** trovata dalla Revisione: dopo un riavvio del servizio `chiTace` ripiega su `ultimoEvento`, ma `salva` lo sposta a «adesso». La riga stessa azzerava il silenzio: ricompariva ogni 5 minuti e la messa da parte a 60 minuti non arrivava mai.
- Una chat con domande aperte a Nicholas non viene detta muta.
- Nello stesso giro, la messa da parte (0.80.1) parte dall'oggetto aggiornato. Altrimenti la riga «muta» si perderebbe.

## Compatibilità
- Un PC o un'app più vecchi scartano i traguardi con esito sconosciuto: niente errori, ma niente righe nuove.
- Un PC vecchio che riscrive il file perde quei traguardi.
- L'app non calcola le righe: le riceve già fatte da `/api/autopiloti` (`chat: conversazione(a)`). Basta il filtro.

## Non fatto
- **«Release pubblicata»:** non c'è un evento che la confermi. Vale la riga «Rilascio: ha finito «…»» della chat di rilascio.
- **«Chat chiusa»:** coincide con «finito».

## Test
- `tests/shared/righe-che-contano.test.ts`.
- `tests/autopilot-host/server.test.ts`: cercare «0.81.0» e «la Revisione». C'è anche il riavvio, verificato rosso senza la correzione.
- `PanoramicaTest.kt`.
