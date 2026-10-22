---
titolo: "Il Punto in cima alla conversazione dell'autopilota e le righe degli eventi delle chat (0.84.3)"
quando: 2026-10-23T10:30:00+02:00
tag: ["0.84.3", "punto", "autopilota", "conversazione", "segnali", "pagina", "app"]
---

Richiesta di Nicholas (22/10 sera): l'autopilota è l'unico interlocutore. Fatto da c-90 sul ramo `ap/ap-f1e631f5/c-90`.

## Come funziona

- **Una funzione sola**: `puntoDi` in `src/shared/punto-autopilota.ts`. La chiama il PC (componente `PuntoAutopilota.tsx`) e la rotta `/api/autopilota` (campo `punto`, con `aiuto`); la pagina (`puntoHtml` in `client-pagina.ts`) e l'app (`PuntoAutopilota.kt`, `PuntoAutopilotaVista`) mostrano le righe come arrivano, senza rifare conti.
- Contenuto: passo in corso con i criteri, una riga per chat (riusa `adessoDi`, quindi le ferme in cima e in rosso) con il **segnale** (`COLORE_SEGNALE`/`SIMBOLO_SEGNALE`: bloccata rosso ■, aspetto ambra ◆, avanti/fatto verde, parto blu), «Finito», «Dopo» (prima in revisione, poi la coda, da `pianoAutopilota`), «Da te», limiti del piano solo informativi (letti da `deps.consumi()`; sul PC da `sessions.consumi()`).
- **Niente sigle**: `senzaSigle` (in `chat-autopilota.ts`, riesportata dal Punto) toglie `c-N`, `(c-N)`, «gruppo N», rami `ap/…`, id `ap-…`. Una chat senza ruolo nel Punto è «Una chat», non «c-14». La sorella aspettata si dice «aspetta Sviluppo («compito»)».
- Sul PC il Punto sostituisce «Adesso» dentro `ChatAutopilota` (stesse righe, più il segnale); nella Panoramica `senzaChat` perché le chat stanno già nella sua sezione «Adesso». Sulla pagina, se c'è `punto`, `adessoHtml` non si ripete. Nell'app il Punto è il primo elemento della conversazione; «Adesso» resta nei Dettagli.

## Righe nuove nella conversazione (traguardi)

- `bloccata`: scritta quando arriva `SEGNALE: bloccata` (server, dove si annota «segnale da c-N»), con il motivo nella nota.
- `ferma`: scritta dal giro da solo (`giriDaSoli`) per ogni ripresa o sostituzione, con l'azione (`notaFerma` in `mai-fermo.ts`). La sostituzione prima usava `nel-recupero`, che diceva «ha finito… La chiudo»: era sbagliato per una chat muta.
- Parte = `aperta`, finisce = `finito`/`in-revisione`/`nel-recupero`, unita = `unito`/`approvato`: c'erano già.

## Decisione: a 15 minuti la chat ferma si riprende

`FERMA_DA_DIRE_MS = 15 min` (shared/autopilota). Prima una chat muta fra sorelle al lavoro restava ferma fino all'ora della messa da parte; ora `giroMaiFermo` la riprende a 15 minuti anche se le altre lavorano. La riga «muta» dei 5 minuti ora dice «a 15 minuti la rimetto al lavoro io». Tre test vecchi aggiornati di conseguenza (mai-fermo, server «riga del silenzio», righe-che-contano).

## Trappole

- In `client-pagina.ts` il codice della pagina sta dentro un template TS: niente backtick né `${` nelle funzioni nuove, solo concatenazioni.
- Alcuni banchi di prova di `rotteClient` non hanno `consumi`: `limitiInPercento` controlla che sia una funzione.
- `Punto(…)` esiste già nell'app (il led): il Punto dell'autopilota si chiama `PuntoAutopilotaVista`.
