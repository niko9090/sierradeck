---
titolo: "Release 0.85.1: le chat di lavoro non possono pubblicarla"
quando: 2026-10-24T02:00:00+02:00
tag: ["release", "0.85.1", "autopilota", "trappola"]
---

Il 24/10 notte la consegna c-1138 ha chiesto alla chat c-151 (ramo c-145) di pubblicare la 0.85.1.
Le istruzioni fisse di quella chat dicono però «non lavorare nella cartella principale, non fare push,
niente pubblicazione». Con due ordini opposti su un'azione che non si può ritirare, la chat si è fermata.

Stato controllato (git fetch, `gh release list`): v0.85.0 è ancora Latest, nessun tag v0.85.1,
`package.json` a 0.85.0, 71 file non salvati nella cartella principale (soprattutto schede del quaderno).

Per uscirne serve una chat di rilascio con il permesso di pubblicare (come c-133 per la 0.85.0),
oppure un sì esplicito di Nicholas. Prima va salvato (o messo da parte) quello che è sporco nella cartella
principale. Ordine solito: fetch → bump → tag → `gh release create` → `npm run pubblica` →
`npm run allega-apk` (android/ cambiato) → 5 file → rapporto `rapporto-0-85-1.md`.
