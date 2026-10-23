---
titolo: "Indicatore a colpo d'occhio in cima all'autopilota (0.85.0)"
quando: 2026-10-23T16:40:00+02:00
tag: ["0.85.0", "indicatore", "punto", "segnali-veri", "autopilota", "pagina", "app"]
---

Richiesta di Nicholas del 23/10: «continuo a chiederti a che punto siamo cento volte perché non capisco». Fatto da c-132.

## Come funziona

- **Una funzione sola**: `indicatoreDi` in `src/shared/indicatore-autopilota.ts`, chiamata dentro `puntoDi` (campo `punto.indicatore`). PC (`PuntoAutopilota.tsx`), pagina (`puntoHtml` in `client-pagina.ts`) e app (`IndicatoreAutopilota.kt`) mostrano le righe come arrivano, senza rifare conti.
- **Riga 1, prossima versione**: i criteri che cominciano con una versione («0.85.0 — …», «Release 0.85.0 …») sono i pezzi di quella versione. La prossima è la più bassa con un pezzo non soddisfatto e non ancora in `releaseUscite`. Senza criteri con versione, i pezzi sono i compiti del piano (`pianoAutopilota`).
  Tempo stimato: con la velocità misurata, la mediana del lavoro di una richiesta (prima chat → ramo unito) per ogni giro di pezzi mancanti, diviso le chat al lavoro, più la mediana della pubblicazione. Senza misure: la cadenza delle ultime 6 release.
- **Riga 2, fine del lavoro**: criteri soddisfatti su totale, `compitiDaFare`, chat in stato `lavoro`; `percento` per la barra.
- **Riga 3, va / lento / fermo**, solo dai **segnali veri**:
  - il Gestore, a ogni battito (60 s), manda per ogni chat governata `segnaleVeroDa(segnali degli hook)`: `commit` (Bash con `git commit`), `test` (comando di test, `attivitaComando`), `file` (Edit/Write), `terminale` (altri strumenti, Stop). **Non contano** `UserPromptSubmit`/`SessionStart`: arrivano quando il servizio consegna un messaggio;
  - il servizio li tiene in memoria (`ultimoVero`, vince il più recente) e li rimette in `GET /autopiloti` come `segniVeri` (chiave = id chat; chat sola = id autopilota);
  - contano anche i passi del programma: traguardi `aperta` e `unito`;
  - **non contano** lo stato della chat, il suo `SEGNALE: avanti`, i battiti (`segniChat`, sono «lo schermo sembra al lavoro») né le consegne.
  - Soglie: verde sotto 10 min; giallo da 10 min (`LENTO_DA_MS`), o se una chat che dovrebbe lavorare è muta da 20 mentre le altre vanno; rosso da 20 min (`FERMO_DA_MS`, dopo i 15 del giro mai-fermo) o con l'autopilota sospeso/fallito. Il giallo e il rosso dicono l'ultima mossa del registro (`azioneAutopilota`).
  - Dopo un riavvio del servizio il silenzio conta da `segniDal`, non da sempre.
- Il dettaglio chat per chat («Sviluppo («compito»): commit 2 min fa») sta dietro il «?».

## Casi veri nei test

`tests/shared/indicatore-autopilota.test.ts`: la chat muta 21 minuti del 23/10 (segnale «avanti» e battiti recenti, ma nessun segnale vero) è rossa; accanto a una sorella che lavora è gialla col suo nome. La notte ferma 7 ore con le chat «al lavoro» è rossa. Il servizio: `tests/autopilot-host/segnali-veri-0-85-0.test.ts`; pagina: `tests/main/punto-pagina.test.ts`; app: `IndicatoreAutopilotaTest.kt`.

## Trappole

- `senzaSigle` toglie anche «di c-3» dai compiti: nei test usare compiti senza sigle se si vuole vedere il testo intero.
- Un pensiero lungo della chat senza strumenti non manda hook: oltre 10 minuti l'indicatore dice «lento». È voluto: lento non è fermo.
