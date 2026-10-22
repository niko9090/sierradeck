---
titolo: "Rapporto 0.84.3 (bozza finché non è pubblicata)"
quando: 2026-10-23T12:00:00+02:00
tag: ["0.84.3", "rapporto", "release", "c-93"]
---

# Rapporto 0.84.3

**Stato (23/10, c-93):** NON ancora pubblicata. Mancano le due voci di c-95 (riga
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

## Rami

Da completare alla release (vedi anche `rami-0-84-3.md`).

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

Numeri: in arrivo alla fine della prova (verso le 01:48 UTC del 23/10).
