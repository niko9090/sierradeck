---
titolo: "Rapporto 0.85.0"
quando: 2026-10-23T17:30:00+02:00
tag: ["0.85.0", "rapporto", "release", "c-133"]
---

# Rapporto 0.85.0

**Stato:** **pubblicata completa il 23/10** (c-133): release `v0.85.0` creata
alle 15:10 UTC, file caricati entro le 15:30 UTC. Tag su `121f4e93`, uguale a `main`
su GitHub. Non in bozza, «Latest». **Non installata**: l'installazione la
avvia solo Nicholas.

La 0.84.4 è uscita completa il 23/10 alle 13:37 UTC (`rapporto-0-84-4.md`).
La 0.85.0 è una minor, con il sì di Nicholas del 23/10.

## Cosa c'è dentro

| Voce | Chat | Stato |
|---|---|---|
| Ogni richiesta di Nicholas diventa da sola un obiettivo (data, testo, criterio mai vuoto, in coda), in cima al «Punto» su PC, pagina e app; una domanda non diventa obiettivo. Test col caso del 23/10 | c-127 | **unito** in `main` (`e9170ae4`, unioni `caeffbbe`, `0ffdea8a`) |
| Riscontro con la prova a richiesta chiusa: riga in conversazione con cosa, commit, test, versione; stessa riga nella lista dei lavori | c-128 | **unito** (`82634eab`, unione `e01cb2d9`) |
| Velocità misurata dalla richiesta alla versione e tempo perso fra i passi, nel «Punto» e in `velocita-richieste.md` | c-129 | **unito** (`6e4f94e8`, unioni `0de3a3a4`, `4d8ad826`) |
| Indicatore a colpo d'occhio in cima all'autopilota (prossima versione, fine del lavoro, va/lento/fermo da segnali veri). Test coi casi veri della chat muta 21 min e della notte ferma | c-132 | **unito** (`15174fd5`, unione `a11c1fa7`); scheda `indicatore-autopilota-0-85-0.md` |
| Revisione e piano di unione | c-130 | `piano-unione-0-85-0.md`, unito |
| Release | c-133 | **pubblicata** (sotto) |

## Release (c-133)

Commit `1e92807e` sul ramo `ap/ap-f1e631f5/c-133`:
- `git fetch`: `origin/main` = `ee1e0d5e` (release 0.84.4); `main` locale 21 commit avanti, nessuna divergenza. Nessun altro PC ha fatto il bump.
- `package.json` 0.85.0; app **2.85.0, versionCode 144**.
- **APK nuovo**: `git diff --stat v0.84.4 -- android/` = `PuntoAutopilota.kt` e `PuntoAutopilotaTest.kt` (richieste e velocità nel Punto dell'app).
- Voce 0.85.0 in `src/shared/novita.ts` (sono anche le note della release e di `app-android.json`). Manca la riga dell'indicatore: si aggiunge quando c-132 è unito.

## Come è andata

1. `git fetch`: nessun altro PC aveva fatto il bump. Unito `main` (con c-132) nel ramo c-133, aggiunta la riga dell'indicatore alle novità (`121f4e93`).
2. Misure su `121f4e93`:
   - TypeScript senza errori;
   - principale 1951 verdi (2 saltati);
   - condivisi 1677 verdi;
   - servizio, renderer e pty 1580 verdi;
   - Android `testDebugUnitTest assembleDebug` riuscito;
   - Kotlin sotto 800 righe;
   - guardia delle cancellazioni pulita.
3. `git push origin HEAD:main`, tag annotato `v0.85.0`, push del tag, poi `gh release create v0.85.0 --verify-tag` con le note di `novita.ts`: tutto **prima** di pubblicare.
   - Il primo tentativo è stato interrotto da un riavvio del programma dopo il push del tag, prima della release.
   - Alla ripresa: release assente, ricreata. Nessun doppione (una sola release `v0.85.0`).
4. `GH_TOKEN=$(gh auth token) npm run pubblica` dalla copia c-133, ferma esattamente sul tag.
   - `google-oauth.json` copiato solo per la build e tolto subito dopo.
   - Caricati exe, blockmap e `latest.yml`, senza 422.
5. `latest.yml` letto da `releases/latest`:
   - versione 0.85.0, size 115408873;
   - sha512 `WZgq3K/z…PguhGg==`, uguale all'exe ricalcolato.
6. `npm run allega-apk`: APK release firmato «CN=Nicholas Ferrari, O=Ferrari Consulenze, C=IT», non debug. Caricati `SierraDeck-2.85.0.apk` e `app-android.json` (versione 2.85.0, programma 0.85.0).

**Controllo finale** (`gh release view v0.85.0`): `isDraft: false`, 5 file «uploaded»:
- installer `.exe`;
- `.exe.blockmap`;
- `latest.yml`;
- `SierraDeck-2.85.0.apk`;
- `app-android.json`.

`refs/heads/main` e `v0.85.0^{}` su GitHub sono lo stesso commit, `121f4e93`.

## Rami

| Ramo | Scelta |
|---|---|
| c-127, c-128, c-129, c-130 | uniti in `main` dopo la Revisione |
| c-131 | verifica della 0.84.4, nessun commit suo (ramo uguale a `main`) |
| c-132 | unito in `main` (`a11c1fa7`) |
| c-133 | questa release, unito in `main` (`1dba2519`, `42130269`) |
| c-134, c-135, c-136 | **chiuse senza unire: doppie** dell'indicatore, già in `main` con `a11c1fa7`; lavoravano nella cartella principale, nessun ramo loro |
| c-143 | ripresa del 23/10 sera: nessun codice, solo note nel quaderno (`trappola-giro-senza-fine-chat-finita-0-85-0.md`) e queste righe; si unisce dopo la Revisione |
| c-11, c-11-velocita | del 21/10 (0.83.0), fuori da questo lavoro: **già in main**, `git diff main...<ramo>` vuoto; restano solo come rami vecchi |
| `wip/domande-altri-pc-c628` | **chiuso senza unirlo: superato.** Lavoro a metà del 22/10, «non provato» (`collaudo-coordinazione-0-84-0.md`); le domande dagli altri PC sono arrivate rifatte da c-74 nella 0.84.1 (voce 5d della lista), con D1 e D4 corretti da c-88 nella 0.84.3 |
| `rilascio/0.82.1` | **chiuso senza unirlo: già in main.** Le stesse correzioni sono entrate con c-53 (`5553df14`, `d1a26901`); il ramo resta solo come fonte del tag `v0.82.1` (già scritto in `rapporto-0-84-0.md`) |
| c-143 (aggiornamento) | ora contiene anche la correzione 0u (`af387167`, guardiano «installa solo Nicholas»), per la 0.85.1: da unire dopo la Revisione |

Ricontrollo finale (c-143, 23/10 sera): nessun altro ramo `ap/ap-f1e631f5/*` ha commit fuori da `main` (`git rev-list --count main..<ramo>` = 0). Fuori da `ap/ap-f1e631f5/*` restano solo i due rami chiusi qui sopra.
