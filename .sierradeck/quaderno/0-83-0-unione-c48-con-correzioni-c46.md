---
titolo: "0.83.0: come si unisce c-48 (velocità) con le correzioni della Revisione di c-46"
quando: 2026-10-21T16:40:00+02:00
tag: ["0.83.0", "android", "unione", "conflitti", "c-48", "c-52"]
---

Prova fatta il 21/10 da c-52 sul ramo `prova-unione-c48`, che parte da c-52 (537e8458). Lì è stato unito `ap/ap-f1e631f5/c-48` a 188824ed: unione 8f225c3e, più 950082d1. Quando c-48 è in main, si rifà la stessa cosa sul ramo c-52 con `git merge main`.

## Conflitti
Uno solo, in **DomandeAdesso.kt**, con due parti. App.kt, Adesso.kt, Lavori.kt e DettaglioAutopilota.kt si uniscono da soli.

1. **Commento di `PolsoDomande`:** si tengono tutti e due i testi. Prima quello della Revisione (il polso sta fuori dalla lista e si ferma dentro un autopilota), poi quello di c-48 (con `firma` rilegge solo quando lo stato cambia).
2. **`domandeInCima`:**
   - c-48 aggiungeva il parametro `firma` e teneva `item(key = "domande-polso") { PolsoDomande(api, d, firma) }` dentro la lista;
   - la Revisione aveva tolto quella riga.

   Scelta: `domandeInCima(api, d, onApri)` senza `firma` e senza polso, perché non legge più niente. In **Adesso.kt** il polso passa la firma: `if (!dettaglio) PolsoDomande(api, domande, DomandeAdesso.firma(stato))`. Così si tengono tutte e due le cose:
   - la velocità di c-48: le domande si rileggono quando lo stato lo dice, più dopo ogni risposta;
   - le correzioni della Revisione: il polso sta fuori dalla lista e si ferma nel dettaglio.

   Nella conversazione aperta resta `PolsoDomande(api, domande)` senza firma, cioè ogni 2 s, come voleva c-48.
3. **DomandeAdessoTest.kt:** due controlli allineati, `domandeInCima(api, domande)` e `if (!dettaglio) PolsoDomande(api, domande, DomandeAdesso.firma(stato))`. Quelli di c-48 in `StatoVeloceTest` (`LaunchedEffect(api, d.giro, firma)`, `break` con la firma) restano veri senza cambiarli.

## Test rosso portato da c-48
`tests/main/copia-incolla.test.ts` cercava `items(messaggi) { b ->` in DettaglioAutopilota.kt. c-48 l'ha cambiato in `itemsIndexed(messaggi, key = …)` per le chiavi stabili, quindi il test era rosso anche su c-48 da solo. Ora cerca `/items(Indexed)?\(messaggi[,)]/` (950082d1). Va portato anche nell'unione vera.

## Da sapere
c-48 accende R8 (`isMinifyEnabled = true`, `isShrinkResources = true`, `proguard-rules.pro`) in `build.gradle.kts`. Si unisce senza conflitti con le versioni 139 e 2.83.0. Va provato con `npm run allega-apk` (assembleRelease) prima di pubblicare.

## Esito sulla prova
- `gradle testDebugUnitTest`: BUILD SUCCESSFUL;
- `npm run typecheck`: 0 errori;
- `tests/main`: 1861 passati e 2 saltati.
