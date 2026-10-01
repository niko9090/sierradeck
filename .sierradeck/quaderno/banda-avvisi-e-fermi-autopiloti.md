---
titolo: "Banda degli avvisi: fermi degli autopiloti chiudibili, «Archivia» (0.37.0)"
quando: 2026-10-01T16:00:00+02:00
tag: ["avvisi", "autopilota", "notifiche", "telefono"]
---

# Il difetto

In `src/renderer/avvisi.ts` l'avviso `fermi` restava finché un autopilota era sospeso o fallito, con il solo «Vedi». Un autopilota che non doveva ripartire restava nella banda per sempre (Nicholas, 01/10). Lo stesso valeva per `preparazione` (programmi mancanti).

Sul telefono c'era un secondo difetto. Con il servizio degli autopiloti giù, `/api/stato` mandava `autopiloti: []`. L'app «potava» le chiavi `s:` già annunciate e, al ritorno del servizio, **riannunciava** tutti i fermi. Nella pagina la chiave `f-<id><stato>` non si toglieva mai, quindi un fermo nuovo dello stesso autopilota non si annunciava più.

# La correzione

- **Chiave del fermo** = `chiaveFermo(a)` in `shared/autopilota.ts`: `id|stato|fermatoIl|motivo`.
  - `fermatoIl` (nuovo campo) lo scrive il servizio in `salva` → `conMomentoDelFermo`: si mette entrando in sospeso/fallito, resta finché è fermo, sparisce alla ripartenza insieme a `archiviato`.
  - I file senza `fermatoIl` (precedenti alla 0.37.0) usano il motivo finché il servizio non li riscrive.
- **«Chiudi»** nella banda: le chiavi vanno nelle preferenze `avvisiChiusi`, al massimo 200 (`ricordaChiusi`), quindi valgono dopo un riavvio. `componiAvvisi({ chiusi })` scarta i fermi chiusi; un fermo nuovo ha una chiave nuova e torna. I programmi mancanti usano `chiavePreparazione(lista)`.
- **«Riprendi»** chiama `autopilota.riprendi`. **«Archivia»** è una rotta nuova `POST /autopiloti/:id/archivia {archivia}`, solo per un autopilota fermo (altrimenti 409), con IPC `autopilota:archivia`.
  - Un archiviato non compare nella banda e non manda notifiche.
  - Nel pannello Autopiloti c'è «Archivia» / «Archiviato · togli».
- **`/api/stato`** manda per ogni autopilota fermo `fermo` (la chiave) e `archiviato`, più `autopilotiLetti: false` quando il servizio non ha risposto.
  - **App** (`Avvisi.kt`): chiave `s:<fermo>`; con `autopilotiLetti=false` non pota le famiglie degli autopiloti.
  - **Pagina** (`avvisaSeServe`): chiave `f-<fermo>`; salta il giro se non letti; tace sugli archiviati.

**Test:** `tests/renderer/avvisi-chiusi.test.ts` (chiuso → non torna, anche dopo il passaggio dalle preferenze; fermo nuovo → torna; archiviato; preparazione; notifiche della pagina), `server.test.ts` («Archivia» e il momento del fermo), `AvvisiTest.kt` (servizio giù e su, archiviato).
