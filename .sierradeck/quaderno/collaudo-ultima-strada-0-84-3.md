---
titolo: "Collaudo 0.84.3: l'ultima strada prima di «sono bloccato» (c-99)"
quando: 2026-10-23T02:45:00+02:00
tag: ["collaudo", "0.84.3", "ultima-strada", "sono-bloccato", "flotta", "difetti"]
---

Collaudo di c-99, 23/10, sul codice di c-95 (ultima strada con una chat nuova, domanda che non ferma). Come funziona: `sono-bloccato-e-ultima-strada-0-84-3.md`.

**Il ramo c-95 non era in main.** Per collaudarlo c-99 lo ha unito nel suo ramo (`8430e214`): unire c-99 porta in main anche c-95. Se la Revisione di c-95 vuole guardarlo prima, va fatta su quel ramo prima di unire c-99.

Test: `tests/autopilot-host/collaudo-ultima-strada-0-84-3.test.ts`, 11 casi, dal servizio vero (hook `Stop` via HTTP, supervisore che non risponde come nella notte vera). Niente prova con chat vere: per arrivare a «strade finite» servono 8+ turni rossi di fila, ore di lavoro. I test lo fanno con la storia già scritta.

## Cosa regge (9 casi)

- **Prima l'ultima strada, poi la domanda.** La chat bloccata va nel recupero, una chat nuova sullo stesso ramo parte, nessuna domanda. Solo quando si blocca anche lei arriva la domanda; nella storia la riga «ultima strada — …» viene prima. Provato con la sequenza vera, senza riscrivere la storia a mano.
- **Niente doppioni:** due hook `Stop` insieme della stessa chat → una chat sola. Un hook tardivo della chat vecchia (già nel recupero) → né chat né domanda. Dopo un riavvio del servizio la chat dell'ultima strada chiede e non ne apre una terza (`ultimaStrada` si salva). Con una chat sola l'ultima strada non si ripete dopo un riavvio (la riga nella storia basta). Una seconda fermata sullo stesso controllo aspetta sulla domanda già aperta.
- **La chat che ha chiesto non resta ferma:** riceve «Mentre aspetti… non restare ferma» e resta `lavoro`. Alla seconda fermata aspetta, ma l'autopilota resta `lavoro`. Un altro autopilota non si accorge della domanda.

## Difetti (con `it.fails`: quando uno è corretto il segno va tolto)

**D2 (grave) — a domanda aperta, la sorella che lavora a un ALTRO compito si ferma.** Passi: flotta con c-2 (ultima strada) e c-3 («Scrivi il rapporto della release»), criterio rosso da 8 giri. c-2 chiude il turno → domanda, continua. c-3 chiude il turno col criterio ancora rosso → presa per bloccata anche lei: va nel recupero e il compito passa a c-4 (ultima strada). Al turno dopo c-4 si aggancia alla domanda di c-2 («la sua domanda è uguale a una già aperta, aspetta la stessa risposta») e resta `bloccata`. Il rapporto non va più avanti finché Nicholas non risponde.
Causa: i giri in cerchio si contano su tutta la storia dell'autopilota, non per chat (`ripetizioniFinali(a.decisioni, …)`, `src/autopilot-host/decisione.ts:198`), e l'ultima strada scatta per qualunque chat (`src/autopilot-host/server.ts:3502`, `serveUltimaStrada` guarda solo il segno della chat). Nelle flotte i criteri sono dell'autopilota e restano rossi finché tutto non è finito: succede a ogni sorella. Il conteggio per autopilota c'era già prima di c-95 (la sorella finiva ferma sulla stessa domanda); c-95 aggiunge la sostituzione.
Atteso: la sorella continua col suo compito (risposta `block` con le istruzioni normali), niente recupero, niente attesa sulla domanda.

**D1 (lieve) — la chat dell'ultima strada sostituita dal «mai fermo» rifà l'ultima strada.** Passi: c-1 bloccata → c-2 (ultima strada). c-2 resta muta, il «mai fermo» la sostituisce con c-3. c-3 si blocca → apre una seconda ultima strada (c-4) invece di chiedere. Causa: `chatCheSostituisce` (`src/autopilot-host/mai-fermo.ts:263`) non copia `ultimaStrada`.

## Trappola per chi scrive test qui

Un test che controlla solo `stato !== 'bloccata'` della sorella passa anche col difetto D2: la sorella è `finita` (nel recupero). Controllare anche che non ci sia una chat con `sostituisce` uguale al suo id.

## Correzioni (c-101, 23/10)

- **D1:** `chatCheSostituisce` copia `ultimaStrada`: l'ultima strada è del compito, non della sessione.
- **D2:** in `server.ts`, prima dell'ultima strada: se un'altra chat ha già una domanda «sono bloccato» aperta che tocca gli stessi controlli (`contesto.bloccato.criteri`), questa chat riceve `block` con «non è un blocco tuo, continua con il tuo compito», scrive la traccia e resta `lavoro`.
- **Resta aperto (non corretto):** il cerchio si conta ancora su tutta la storia dell'autopilota, non per chat (le tracce `proseguito:` non dicono di quale chat sono). Senza una domanda già aperta, la prima sorella che chiude il turno dopo 8 giri rossi fa lei l'ultima strada. Per contarlo per chat serve un campo `chat` nelle decisioni (e in `normalizza`, `shared/autopilota.ts`): da fare se il caso si vede davvero.
