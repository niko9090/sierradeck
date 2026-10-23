---
titolo: "Rapporto 0.84.3 (bozza finché non è pubblicata)"
quando: 2026-10-23T12:00:00+02:00
tag: ["0.84.3", "rapporto", "release", "c-93"]
---

# Rapporto 0.84.3

**Stato (23/10, c-93):** NON ancora pubblicata. Versione già preparata sul ramo c-93: `package.json` 0.84.3, app 2.84.3 (versionCode 142), novità in `src/shared/novita.ts`. Mancano le due voci di c-95 (riga
«Domande scritte dal programma» e «ultima strada»), il collaudo c-94 e la
Revisione dei rami c-90 e c-91. Mai installata da noi: l'installazione la avvia
solo Nicholas.

## Cosa c'è dentro

| Voce | Chi | Stato |
|---|---|---|
| Mai fermo: D1 (chat muta dall'avvio abbandonata finché una sorella lavora) e D2 (consegna del servizio presa come risposta); il giro da solo dice cosa apre davvero | c-87 | in main (93573507), rivisto da c-92 |
| Domande fra PC: D1 opzioni oltre 200 caratteri, D2 verifica col tempo vero (entro 9 s), D3 «Presa» nell'app, D4 spiegazioni delle scelte nel battito | c-88 | in main (83f59d7d), rivisto. Tocca `android/` |
| Mai gesti a mano, «lo giudico io» al secondo rifiuto, chiusura da sola con criterio non misurabile, domande vecchie chiuse come superate | c-89 | in main (73ed147d), rivisto |
| «Punto» in cima alla conversazione dell'autopilota su PC, pagina e app; righe per chat partita, finita, bloccata, unita, ferma da 15 minuti | c-90 | in main (9af91d61, commit del salvataggio dell'autopilota), Revisione da fare. Tocca `android/` |
| Aggiornamento senza tempi morti: 5 minuti dopo «Installa», poi commit delle chat e si installa; fasi col tempo; riepilogo alla ripresa; «Aggiorna adesso» nell'app | c-91 | in main (b8fa6802), Revisione da fare. Tocca `android/` |
| Domande scritte dal programma che si capiscono da sole; ultima strada con una chat nuova prima di «sono bloccato», lavoro che continua mentre si aspetta | c-95 | in corso |
| Collaudo delle domande fra PC dopo le correzioni | c-94 | in corso |

## APK

`android/` è cambiato dalla v0.84.1 (c-88, c-90, c-91): alla 0.84.3 serve un APK
nuovo, solo con `npm run allega-apk` (firmato Ferrari Consulenze, mai debug).
File Kotlin più lunghi il 23/10: `App.kt` 772 righe, `Api.kt` 754 (limite 800).

## Prima di pubblicare (trappola della v0.84.2)

Creare il tag `v0.84.3` sul commit della versione e pusharlo **prima** di
`npm run pubblica`: il `main` remoto è fermo a `a22c1dff` (0.80.0) e GitHub, senza
tag, lo crea lì (successo alla v0.84.2, tag ancora sbagliato).

## Rami di questo lavoro (c-87…c-96)

Stato al 23/10 00:00 UTC (c-93). Si completa alla release.

| Ramo | Cosa | Scelta |
|---|---|---|
| c-87 | mai fermo D1 e D2, il giro dice cosa apre davvero | unito dopo la Revisione (c-92), 93573507 |
| c-88 | domande fra PC D1-D4 (tocca `android/`) | unito dopo la Revisione (c-92), 83f59d7d |
| c-89 | mai gesti a mano, «lo giudico io», chiusura da sola | unito dopo la Revisione (c-92), 73ed147d |
| c-90 | il «Punto» (tocca `android/`) | unito (4fc3e88e); Revisione di c-93 il 23/10, un test aggiunto, nessun difetto |
| c-91 | aggiornamento senza tempi morti (tocca `android/`) | unito (cb35b61c); Revisione di c-93 il 23/10, nessun difetto |
| c-92 | Revisione e unione dei rami; con la scheda di c-24 | unito (82d0c2a2); il ramo non c'è più |
| c-93 | questa release: revisione di c-90/c-91, prova di 2 ore, versione 0.84.3 | unito a ogni turno |
| c-94 | ricollaudo delle domande fra PC: verde; caso limite lieve (emoji tagliata al 200° carattere dall'app, 409) | da unire (solo quaderno, 9e0d0a25); il caso limite non è corretto |
| c-95 | «sono bloccato» in parole semplici (lavoro e controllo che non passa), conseguenza sotto ogni scelta su PC, pagina e app (anche da un altro PC), scelte eseguite dal programma, ultima strada con una chat nuova sullo stesso ramo prima di chiedere, domanda che non ferma la chat, vecchie «Come vuoi che proceda?» chiuse come superate. Tocca `android/` | commit 217767af, **da unire dalla Revisione** quando la chat finisce. **Rivisto da c-93 (23/10, sola lettura, in una copia staccata):** TypeScript pulito; 8 file di test, 285 verdi (sono-bloccato, gesti-a-mano, scheda-domanda, domanda-strutturata, server, decisione, rete-sicurezza, domanda-chiara). Caso vero del 22/10 in un test (`eVecchiaBloccato`, chiusa come superata anche nel servizio). Passa dallo stesso controllo (`validaDomanda`, `scartaSeNonVa`, `domandaDaNonFare`). Niente dati privati, nessuna funzione tolta (le tre scelte vecchie sostituite da tre equivalenti eseguite dal programma). Kotlin: `Modelli.kt` 594 righe, `SchedaDomandaVista.kt` 253. **Lieve, da sapere:** la conseguenza sotto i tasti è provata nella scheda comune e nell'app (`SceltaSpiegataTest`), ma non c'è un test che la veda disegnata nel renderer del PC e nella pagina; il codice c'è (`SchedaDomandaVista.tsx`, `client-pagina.ts`). La riga del diario dell'ultima strada porta i numeri delle chat (come le altre righe del diario); nella conversazione passa da `senzaSigle` |
| c-96 | collaudo del Punto: righe «ferma» provate nel servizio; 4 difetti con `it.fails` (D1 sigle nella Panoramica, D2 chi aspetta una sorella non è «ferma», D3 frasi rotte da `senzaSigle`, D4 note senza Panoramica) | da unire (5f92b4d3); difetti da correggere prima della release |

## Prova di 2 ore senza fermate

**Partita il 22/10 alle 23:47:50 UTC** (c-93), sul codice di main 4d12934f
(c-87…c-91 dentro). È la prova della 0.84.1 (`creaServer` vero, orologi veri,
guardiano ogni minuto, riavvio del servizio a metà), con queste differenze:
porta 47683, dati in una cartella temporanea della chat con `SIERRADECK_PROVA`
e APPDATA di prova, freno spento come nel servizio vero (`frenoPiano: false`),
4 chat simulate con seme fisso (62% lavorano 2-11 min, 18% mute, 8% morte,
12% ferme al prompt). Mai il servizio vero, mai «Installa».

Cosa misura, ogni 15 secondi:
- minuti con l'autopilota «al lavoro», criteri rossi e nessuna chat che lavora
  (il tratto più lungo e quanti oltre 15 minuti);
- per ogni chat muta, quanto resta muta prima di essere ripresa, anche con le
  sorelle al lavoro (D1: deve stare sotto 15 minuti + un giro);
- i motivi scritti dai giri da soli, e se un giro dice «apro» senza aprire;
- riprese, sostituzioni, messe da parte, doppioni, «finito» con chat aperte.

**Primo giro, fermato a 18 minuti per un motivo falso.** Fino lì nessun tratto
fermo; c-2, muta mentre le sorelle lavoravano, è stata ripresa a 15,0 minuti
(D1 ok, riga «ferma» scritta). Ma il giro scriveva «giro da solo per le chat
messe da parte», e c-2 non era messa da parte (succede a 60 minuti). Corretto
in `mai-fermo.ts` con un test rosso prima e verde dopo (commit `1169047a`): il
giro dice «messe da parte», «riprese che non hanno risposto» o «ferme da più di
15 minuti mentre le altre lavorano».

**Prova rilanciata alle 2026-10-23T00:11:16Z** sul codice corretto, stesso metodo.
Numeri: in arrivo alla fine (2 ore dopo).
