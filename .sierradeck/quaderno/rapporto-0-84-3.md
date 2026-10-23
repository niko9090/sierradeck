---
titolo: "Rapporto 0.84.3 (bozza finché non è pubblicata)"
quando: 2026-10-23T12:00:00+02:00
tag: ["0.84.3", "rapporto", "release", "c-93"]
---

# Rapporto 0.84.3

**Stato (23/10, c-93):** NON ancora pubblicata. Tutte le voci sono nel ramo c-93 e
in main: `package.json` 0.84.3, app 2.84.3 (versionCode 142), novità in
`src/shared/novita.ts`. Si pubblica a prova di 2 ore pulita. Mai installata da
noi: l'installazione la avvia solo Nicholas.

## Cosa c'è dentro

| Voce | Chi | Stato |
|---|---|---|
| Mai fermo: D1 (chat muta dall'avvio abbandonata finché una sorella lavora) e D2 (consegna del servizio presa come risposta); il giro da solo dice cosa apre davvero | c-87 | in main (93573507), rivisto da c-92 |
| Domande fra PC: D1 opzioni oltre 200 caratteri, D2 verifica col tempo vero (entro 9 s), D3 «Presa» nell'app, D4 spiegazioni delle scelte nel battito | c-88 | in main (83f59d7d), rivisto. Tocca `android/` |
| Mai gesti a mano, «lo giudico io» al secondo rifiuto, chiusura da sola con criterio non misurabile, domande vecchie chiuse come superate | c-89 | in main (73ed147d), rivisto |
| «Punto» in cima alla conversazione dell'autopilota su PC, pagina e app; righe per chat partita, finita, bloccata, unita, ferma da 15 minuti | c-90 | in main (9af91d61), rivisto da c-93; difetti del collaudo c-96 corretti. Tocca `android/` |
| Aggiornamento senza tempi morti: 5 minuti dopo «Installa», poi commit delle chat e si installa; fasi col tempo; riepilogo alla ripresa; «Aggiorna adesso» nell'app | c-91 | in main (b8fa6802), rivisto da c-93. Tocca `android/` |
| Domande scritte dal programma che si capiscono da sole; ultima strada con una chat nuova prima di «sono bloccato», lavoro che continua mentre si aspetta | c-95, c-99, c-101 | in main tramite il ramo c-93, rivisto |
| Collaudo delle domande fra PC dopo le correzioni | c-94 | verde; il caso limite dell'emoji corretto da c-93 (23b0d540) |

## Ogni criterio, il test che lo prova e il commit

Tutti i test sono verdi sul ramo c-93 (dopo l'unione di c-101) e nessuno ha più
`it.fails`. I test Kotlin girano con `gradle testDebugUnitTest`.

| Criterio della 0.84.3 | Test che lo prova (file › nome) | Commit |
|---|---|---|
| Mai fermo, collaudo c-81 D1: la chat muta dall'avvio non resta abbandonata finché una sorella lavora | `tests/autopilot-host/mai-fermo-0-84-1.test.ts` › «0.84.3 (il Punto): una chat zitta da più di 15 minuti mentre la sorella lavora si riprende…» e «le altre lavorano, ma quella già ripresa non ha risposto in 10 minuti…» | 4c96c46c |
| Mai fermo, collaudo c-81 D2: la consegna del servizio non vale come risposta della chat | `mai-fermo-0-84-1.test.ts` › «0.84.3 (D2): una consegna del servizio dopo la ripresa non vale come risposta della chat» | 4c96c46c |
| Il giro da solo dice cosa apre davvero, e il motivo vero | `mai-fermo-0-84-1.test.ts` › «0.84.3: la riga dice cosa apre davvero, e se niente perché», «…senza nessun compito e il PC pieno, non dice «apro una chat»»; il motivo «ferme»/«riprese-mute»/«messe da parte» negli stessi test | 4c96c46c, 1169047a |
| Chi aspetta una sorella che lavora non è ferma; se tace anche la sorella si riprendono tutte e due (c-96 D2) | `tests/shared/collaudo-punto-0-84-3.test.ts` › «D2: chi aspetta una sorella al lavoro non è «ferma»…»; `mai-fermo-0-84-1.test.ts` › «0.84.3 (collaudo c-96 D2): … se tace anche la sorella, si riprendono tutte e due» | 3654498a |
| Domande fra PC, collaudo c-82 D1: un'opzione oltre 200 caratteri si preme da un altro PC | `tests/main/collaudo-domande-risposte-0-84-1.test.ts` › «D1: un'opzione più lunga di 200 caratteri si può premere da un altro PC»; `tests/main/risposta-verificata.test.ts` › «dovEOpzione: uguale, oppure l'inizio tagliato di una sola opzione…» | a95e8654 |
| …e anche con un emoji a cavallo del 200° carattere (caso limite di c-94), su PC, pagina e app | `tests/main/opzione-emoji-tagliata.test.ts`; `android/…/CaratteriInteriTest.kt` | 23b0d540 |
| Domande fra PC D2: la verifica finisce entro l'attesa del ponte | `collaudo-domande-risposte-0-84-1.test.ts` › «D2: la verifica finisce entro l'attesa del ponte (14 s)…»; `risposta-verificata.test.ts` › «una lettura lenta che si mangia il tempo…» | a95e8654 |
| Domande fra PC D3: «Presa» nell'app | `collaudo-domande-risposte-0-84-1.test.ts` › «D3: l'app legge la frase dell'esito dopo un tocco»; `android/…/EsitoRispostaTest.kt` | a95e8654 |
| Domande fra PC D4: le spiegazioni delle scelte arrivano anche dagli altri PC | `collaudo-domande-risposte-0-84-1.test.ts` › «D4: la scheda di una domanda di un altro PC ha «Le scelte, spiegate»…» | a95e8654 |
| Mai gesti a mano nelle domande; le vecchie chiuse come superate | `tests/autopilot-host/gesti-a-mano.test.ts` › «22/10: la domanda con il gesto a mano non si apre; la chat riparte con la strada», «la domanda già aperta del 22/10 si chiude come superata…» | a44735a1 |
| «Lo giudico io» al secondo rifiuto, chiusura da sola con un criterio che non si misura | `tests/autopilot-host/criteri-giudicati.test.ts` › «due correzioni rifiutate, poi «lo giudico io»: il lavoro si chiude senza domande a Nicholas», «a lavoro finito, un criterio che non parte non diventa una domanda…» | a44735a1 |
| «Sono bloccato» si capisce da sola: il lavoro, il controllo che non passa, niente sigle; scelte eseguite dal programma | `tests/autopilot-host/sono-bloccato-0-84-3.test.ts` › «la frase in vista dice il lavoro e il controllo che non passa…», «le scelte: ognuna dice cosa succede, nessuna chiede a Nicholas un lavoro a mano», «22/10: la vecchia «Come vuoi che proceda?» aperta si chiude come superata…» | 217767af |
| La conseguenza disegnata sotto ogni scelta, su PC, pagina e app | `tests/renderer/conseguenza-sotto-le-scelte.test.tsx` › «sul PC: una riga per scelta…», «sulla pagina del telefono: lo stesso, con la funzione vera della pagina» (**nuovo**, era il punto aperto della Revisione di c-95); `android/…/SceltaSpiegataTest.kt` | 217767af (codice), test in questo turno |
| Ultima strada: una chat nuova prima di chiedere, una sola anche con hook doppi, tardivi e riavvio | `tests/autopilot-host/collaudo-ultima-strada-0-84-3.test.ts` › «la chat bloccata: prima la chat nuova parte…», «due hook Stop insieme…», «un hook tardivo…», «dopo un riavvio del servizio…» | 217767af, a11bdb8b |
| La domanda non ferma il lavoro; la sostituta eredita l'ultima strada; la sorella su un altro compito continua (c-99 D1, D2) | `collaudo-ultima-strada-0-84-3.test.ts` › «la chat che ha chiesto non resta ferma…», «la chat dell'ultima strada sostituita dal «mai fermo»: la sostituta che si blocca chiede…», «la sorella che lavora a un altro compito chiude il turno: continua…» | a97eb8c7 |
| L'autopilota unico interlocutore: il «Punto» in cima su PC, pagina e app | `tests/shared/punto-autopilota.test.ts` › «passo in corso, una riga per chat col compito in parole semplici e il segnale coi colori del PC»; `tests/renderer/punto-autopilota.test.tsx`; `tests/main/punto-pagina.test.ts`; `android/…/PuntoAutopilotaTest.kt` | 9af91d61 |
| Le righe nella conversazione per ogni chat ferma, con l'azione presa | `tests/autopilot-host/collaudo-punto-0-84-3.test.ts` › «la sorella lavora, l'altra tace: a 15-16 minuti una riga «ferma» con l'azione…»; `mai-fermo-0-84-1.test.ts` › «0.84.3 (il Punto, revisione c-93): ogni chat rimessa al lavoro dal giro ha la sua riga «ferma»…» | 9af91d61, 97f3aa43 |
| Senza sigle e in italiano corretto (c-96 D1, D3, D4) | `collaudo-punto-0-84-3.test.ts` (shared) › «D1…», «D3…»; `tests/renderer/adesso-panoramica.test.tsx` › «0.84.3 (collaudo c-96 D1)…»; `collaudo-punto-0-84-3.test.ts` (servizio) › «D4: le note che si leggono senza la Panoramica non hanno sigle né i 60 minuti di prima»; `tests/shared/nomi-delle-chat.test.ts` | c796c493, 72c47068, 97aa542a |
| Aggiornamento senza tempi morti: al massimo 5 minuti dopo «Installa», commit delle chat, fasi col tempo | `tests/main/aggiornamento-senza-tempi-morti.test.ts` › «il caso vero del 22/10: tre chat che non finiscono mai il turno non tengono fermo l'aggiornamento due ore», «un salvataggio che non riesce non blocca l'installazione»; `tests/shared/fasi-aggiornamento.test.ts` | b8fa6802 |
| L'autopilota mai fermo con il lavoro da finire, dal vivo | la prova di 2 ore qui sotto (`scripts/prova-mai-fermo.ts`, quarto giro) | 01fb57d6 |
| Nessun file Kotlin oltre 800 righe | conto delle righe: `App.kt` 772, `Api.kt` 754 | — |
| Guardia delle cancellazioni | `git grep` della consegna: vuoto | — |

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
| c-94 | ricollaudo delle domande fra PC: verde; caso limite lieve (emoji tagliata al 200° carattere dall'app, 409) | unito nel ramo c-93 (solo quaderno, 9e0d0a25); il caso limite l'ha corretto c-93 sul suo ramo (23b0d540: `tagliaIntero` nel battito, `dovEOpzione` a 199, `senzaMezziCaratteri` nell'app, test TS e Kotlin) |
| c-95 | «sono bloccato» in parole semplici, conseguenza sotto ogni scelta su PC, pagina e app, scelte eseguite dal programma, ultima strada con una chat nuova prima di chiedere, domanda che non ferma la chat, vecchie «Come vuoi che proceda?» chiuse come superate. Tocca `android/` | **unito tramite il ramo c-93** (dentro c-101, unione 7588f794). Rivisto da c-93: TypeScript pulito, test verdi, caso vero del 22/10 in un test, stesso controllo delle altre domande, niente dati privati. Le tre scelte vecchie trasformate senza perdere niente: «rivedi i criteri» → «Lascia stare quel controllo e vai avanti» (lo giudica l'autopilota, nessun lavoro a mano), «ti dico io la strada» → «Ti scrivo io cosa provare», «fermati» → «Sospendi l'autopilota». Kotlin sotto le 800 righe. Il test del disegno su PC e pagina, che mancava, l'ha scritto c-93: `tests/renderer/conseguenza-sotto-le-scelte.test.tsx` |
| c-96 | collaudo del Punto: righe «ferma» provate nel servizio; 4 difetti con `it.fails` (D1 sigle nella Panoramica, D2 chi aspetta una sorella non è «ferma», D3 frasi rotte da `senzaSigle`, D4 note senza Panoramica) | unito nel ramo c-93 (f8fddde2) e da lì in main; i 4 difetti corretti da c-93 uno per commit (D3 c796c493, D1 72c47068, D2 3654498a con il test «se tace anche la sorella si riprendono tutte e due», D4 97aa542a), nessun `it.fails` rimasto |
| c-99 | collaudo dell'ultima strada: 9 casi che reggono (una sola chat nuova anche con hook doppi, hook tardivi e riavvio; la chat che chiede continua; a domanda aperta le altre vanno avanti) e 2 difetti con `it.fails` (D1 la sostituta del «mai fermo» rifaceva l'ultima strada, D2 una sorella al lavoro su un altro compito presa per bloccata) | **unito tramite il ramo c-93** (dentro c-101). I 2 test verdi senza `.fails` |
| c-101 | correzione dei 2 difetti di c-99: la sostituta eredita `ultimaStrada` e chiede; se un'altra chat ha già chiesto sugli stessi controlli, la sorella continua col suo compito (niente ultima strada, niente recupero, niente attesa) | **unito nel ramo c-93** (7588f794, conflitto solo in `lista-lavori.md`, tenute tutte e due le parti), poi in main con il ramo c-93. Rivisto da c-93: niente dati privati, nessuna funzione tolta, test verdi |
| c-97, c-102, c-104, c-106 | chat di rilascio o di sviluppo aperte due volte sullo stesso lavoro | **chiuse senza unire perché doppie** (il rilascio resta a c-93; c-97 senza commit propri) |

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

**Secondo giro (00:11 UTC), fermato a 54 minuti perché il codice è cambiato.**
Pulito fino lì: 0 minuti fermi con lavoro da finire, nessun tratto oltre 15
minuti, la chat muta più a lungo 15,0 minuti (sempre ripresa al giro), 4 giri
da soli tutti col motivo vero («ferme da più di 15 minuti mentre le altre
lavorano»), nessun giro che dice «apro» senza aprire, 2 chat passate a una chat
nuova. Fermato perché la correzione D2 del collaudo del «Punto» tocca
`mai-fermo.ts` (chi aspetta una sorella che lavora non è ferma).

**Terzo giro (01:05 UTC, sul codice `97aa542a`), fermato a 7 minuti** perché
è arrivato il ramo dell'ultima strada (c-101, che tocca `mai-fermo.ts` e
`server.ts`). Fino lì pulito: 0 minuti fermi, chat muta più a lungo 4,4 minuti,
nessun giro.

**Quarto giro, quello che vale: partito alle 2026-10-23T01:13:34Z** sul commit `7588f794` (il
ramo c-93 con dentro tutte le voci della 0.84.3, c-101 compreso). Stesso metodo.
Prima del giro: TypeScript pulito, programma principale 1941 test verdi (2
saltati), servizio, renderer, condivisi e pty 3145 verdi, app Android compila e
i test unitari passano, Kotlin al massimo 772 righe (`App.kt`), guardia delle
cancellazioni pulita, nessun `it.fails` rimasto.
Numeri: in arrivo alla fine (2 ore dopo).
