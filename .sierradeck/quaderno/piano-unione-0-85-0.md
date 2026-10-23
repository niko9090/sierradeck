---
titolo: "Piano di unione della 0.85.0: richieste, riscontro, velocità"
quando: 2026-10-23T15:10:00+02:00
tag: ["0.85.0", "unione", "revisione", "c-130"]
---

# Piano di unione della 0.85.0

Chi rivede e unisce: c-130. Le tre chat partono da main **solo dopo che la
0.84.4 è pubblicata** (alle 15:10 del 23/10 non c'era ancora il tag `v0.84.4`,
né la release; la preparava c-942, la prova di 2 ore era in c-122).

| Ramo | Compito | Dipende da |
|---|---|---|
| c-127 | ogni richiesta di Nicholas diventa un obiettivo (data, testo, criterio mai vuoto), in cima al «Punto» con lo stato | nessuno |
| c-128 | riscontro con la prova a richiesta chiusa (cosa, commit, test, versione), in conversazione e in `lista-lavori.md` | il registro delle richieste di c-127 |
| c-129 | velocità: tempi dalla richiesta alla versione e tempo perso fra i passi, nel «Punto» e in un rapporto | il registro delle richieste di c-127 |

## Ordine

1. **c-127 per primo**: porta il registro delle richieste, che gli altri due
   leggono. Se c-128 o c-129 si inventano un registro loro, è un doppione:
   va ricondotto a quello di c-127 prima di unire.
2. c-128 e c-129 dopo, uno alla volta, con `main` unito dentro prima della
   Revisione.

## Dove si scontreranno

Tutti e tre toccano il «Punto» nei tre posti, quindi conflitti sicuri lì:

- `src/shared/punto-autopilota.ts` (`puntoDi`, `AIUTO_PUNTO`), usato da
  `src/main/client-rotte.ts` (pagina e app) e dal renderer;
- `src/renderer/components/PuntoAutopilota.tsx` e `DalVivoAutopilota.tsx`;
- `android/.../PuntoAutopilota.kt` (se cresce, sotto le 800 righe: dividere).

Nel risolvere: le richieste aperte **in cima**, poi il resto del Punto; la
velocità con testo corto e «?» (regola dei testi corti).

## Cosa controllare in Revisione

- una domanda di Nicholas **non** diventa obiettivo (c-127);
- test col caso vero del 23/10: due richieste rimaste fuori dalla coda;
- nessun dato privato nei test (niente nomi di PC, percorsi, IP);
- nessuna funzione tolta; guardia delle cancellazioni;
- se cambia `android/`, alla 0.85.0 serve un APK nuovo (`npm run allega-apk`).
