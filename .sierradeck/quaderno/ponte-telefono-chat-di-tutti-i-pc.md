---
titolo: "Il ponte del telefono: le chat di tutti i PC dal vivo (0.48.0, app 2.48.0)"
quando: 2026-10-02T20:30:00+02:00
tag: ["telefono", "android", "ponte", "pc-remoto", "sicurezza"]
---

# Come funziona

- Il telefono parla solo con il PC accoppiato. Per un altro PC chiede
  `POST /api/ponte {pc, percorso, corpo}`; il PC accoppiato la gira con
  `remoto.chiama` (le strade 0.40 + la firma di casa 0.47) e risponde con il
  corpo e lo stato **di quel PC**, intero (un 409 di `/api/scegli` resta 409).
- Le rotte che passano (`ROTTE_PONTE` in `src/shared/ponte-telefono.ts`, uguali
  a `Ponte.ROTTE` nell'app, un test Kotlin le confronta) sono quelle del
  riquadro remoto del PC: stato, storia, scrivi, scegli, sessioni/riprendi, apri.
  Il resto → 403, e l'app non lo manda nemmeno.
- Un altro PC (dispositivo `pc`) non può usare il ponte: niente catene.
- App: `Api.suPc(pcId)` è lo stesso `Api` che impacchetta; `SuPc.corrente`
  decide se la scheda Chat mostra un altro PC; `FasciaSuPc` (viola «SU …») è in
  cima a elenco e dettaglio. Il tasto sta in Computer → Altri computer, spento
  con la spiegazione se il PC accoppiato è < 0.48.0 (`FunzionePc.PONTE`).
- Su un altro PC niente «+ Nuova»/«Riprendi» (servono `/api/sfoglia` e
  `/api/sessioni`), niente Rinomina/Chiudi, niente ripiego su `/api/dentro`.

# Test

- `tests/main/ponte-telefono.test.ts`: regole, rotta, e il giro intero con due
  Client veri (telefono → fisso → portatile) con la risposta di `/api/stato`
  dei dati di prova 0.42.0.
- `android/.../PonteTest.kt`: impacchettamento, rifiuti senza rete, PC
  accoppiato vecchio (404 «non trovato» → funzione spenta).
- Le app vecchie non usano `/api/ponte`: nessuna rotta esistente è cambiata.

# Non fatto

- La pagina servita dal PC (quella nel browser del telefono) non ha il ponte:
  solo l'app.
