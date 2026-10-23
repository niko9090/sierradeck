---
titolo: "Rapporto 0.85.0"
quando: 2026-10-23T16:35:00+02:00
tag: ["0.85.0", "rapporto", "release", "c-133"]
---

# Rapporto 0.85.0

**Stato:** **preparata, non pubblicata** (c-133, 23/10 16:30). Si pubblica
solo quando l'indicatore a colpo d'occhio (c-132) è unito in `main`: è un
criterio della 0.85.0. **Mai installata da noi**: l'installazione la avvia
solo Nicholas.

La 0.84.4 è uscita completa il 23/10 alle 13:37 UTC (`rapporto-0-84-4.md`).
La 0.85.0 è una minor, con il sì di Nicholas del 23/10.

## Cosa c'è dentro

| Voce | Chat | Stato |
|---|---|---|
| Ogni richiesta di Nicholas diventa da sola un obiettivo (data, testo, criterio mai vuoto, in coda), in cima al «Punto» su PC, pagina e app; una domanda non diventa obiettivo. Test col caso del 23/10 | c-127 | **unito** in `main` (`e9170ae4`, unioni `caeffbbe`, `0ffdea8a`) |
| Riscontro con la prova a richiesta chiusa: riga in conversazione con cosa, commit, test, versione; stessa riga nella lista dei lavori | c-128 | **unito** (`82634eab`, unione `e01cb2d9`) |
| Velocità misurata dalla richiesta alla versione e tempo perso fra i passi, nel «Punto» e in `velocita-richieste.md` | c-129 | **unito** (`6e4f94e8`, unioni `0de3a3a4`, `4d8ad826`) |
| Indicatore a colpo d'occhio in cima all'autopilota (prossima versione, fine del lavoro, va/lento/fermo da segnali veri) | c-132 | **in corso**, non ancora unito |
| Revisione e piano di unione | c-130 | `piano-unione-0-85-0.md`, unito |
| Release | c-133 | preparata (sotto) |

## Release (c-133)

Commit `1e92807e` sul ramo `ap/ap-f1e631f5/c-133`:
- `git fetch`: `origin/main` = `ee1e0d5e` (release 0.84.4); `main` locale 21 commit avanti, nessuna divergenza. Nessun altro PC ha fatto il bump.
- `package.json` 0.85.0; app **2.85.0, versionCode 144**.
- **APK nuovo**: `git diff --stat v0.84.4 -- android/` = `PuntoAutopilota.kt` e `PuntoAutopilotaTest.kt` (richieste e velocità nel Punto dell'app).
- Voce 0.85.0 in `src/shared/novita.ts` (sono anche le note della release e di `app-android.json`). Manca la riga dell'indicatore: si aggiunge quando c-132 è unito.

## Procedura (quando c-132 è unito)

1. `git fetch`; nessun bump di altri PC.
2. Riga dell'indicatore nelle novità; misure su `main` (typecheck, test principali, gli altri test, Android, Kotlin < 800 righe, guardia delle cancellazioni).
3. Tag `v0.85.0` sul commit di `main` con tutto unito, push del tag, `gh release create v0.85.0` (non bozza) **prima** di `npm run pubblica`.
4. Build da una copia pulita staccata sul tag (come c-122 per la 0.84.4), `GH_TOKEN=$(gh auth token) npm run pubblica`.
5. `latest.yml` controllato su `releases/latest` (versione, size, sha512 dell'exe).
6. `npm run allega-apk` (APK release firmato, mai debug) + `app-android.json`.
7. `gh release view v0.85.0 --json isDraft,assets`: non bozza, 5 file.

## Rami

| Ramo | Scelta |
|---|---|
| c-127, c-128, c-129, c-130 | uniti in `main` dopo la Revisione |
| c-131 | verifica della 0.84.4, nessun commit suo (ramo uguale a `main`) |
| c-132 | in corso (indicatore) |
| c-133 | questa release |
