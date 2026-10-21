---
titolo: "Rapporto della 0.82.0 (rilascio, c-39)"
quando: 2026-10-21T02:30:00+02:00
tag: ["release", "0.82.0", "rapporto"]
---

## Stato (21/10 02:30) — NON ancora pubblicata

| Pezzo | Ramo | In main |
|---|---|---|
| 1) chat insieme decise dal PC | c-33 | **no** (aspetto) |
| 2) colore fisso per attività | c-35 | sì |
| 3) chi sta lavorando | c-35 | sì |
| 4) domande contro lo stato vero | c-34 | sì |
| 5) menu dei workspace rifatto | c-36 | **no** (aspetto) |
| 6) «Apri cartella» | c-37 | sì |
| 7) grafica meno caotica | c-38 | sì (599852f9) |

Novità, versione e pubblicazione restano ferme finché c-33 e c-36 non sono in
main e le suite sono verdi. La bozza delle novità (7 righe) è pronta.

## Controlli su main 599852f9 (21/10 02:07–02:24)
- Test del programma principale: 191 file, **1824 passati**, 2 saltati, 7 min 25 s.
- Altri test (servizio, renderer, condivisi, pty): 254 file, **2776 passati**, 9 min 9 s.
- `npm run typecheck`: 0 errori. Guardia delle cancellazioni: pulita.
- Nessun test rosso: niente da attribuire a c-35, c-37 o c-38.

## Test che cadeva a PC carico: tests/main/sottofondo.test.ts (21/10)
- Su main d4884af0 (00:35) era caduto «un testo che Claude Code perde torna in
  coda e si riscrive». Era un problema di tempo, non un difetto del codice.
- **Causa:** `digerisci()` aspettava 20 ms fissi che xterm headless finisse di
  scrivere. Sotto carico non bastano: lo schermo letto è quello di prima.
- **Correzione (solo nel test):** il terminale di prova conta le scritture in
  sospeso con il callback di `write`. `digerisci()` aspetta che arrivino a zero.
  I controlli sono rimasti tutti, compreso «mai consegnato senza esserlo».
- **Controprova:** con `digerisci()` che non aspetta niente cadono 7 test su 16,
  compreso questo. Quindi adesso l'attesa è vera, non fortuna.
- **Esiti:** il file da solo 5 volte di fila, 16/16 ogni volta. Poi la suite
  principale (copia c-39, con la correzione) in parallelo all'altra suite
  (cartella principale), alle 02:53–03:05:
  - altra suite: **2816/2816**;
  - suite principale: 1822 passati e 2 caduti per tempo scaduto sotto il carico
    doppio, cioè `cassaforte-pacchetto` (limite 20 s) e `ospite` (legge tutto
    src, limite 60 s).
  - Quei due erano passati con la suite da sola (1824/1824) e non toccano i rami
    della 0.82.0. `sottofondo` è passato (1,5 s).
- Lo stesso `setTimeout(r, 20)` c'è anche in `consegna-durante-il-turno.test.ts`
  e in `consegna-in-sottofondo.test.ts`: se cadono a PC carico, il rimedio è lo
  stesso.

## Da decidere per Nicholas
- **c-38 ha messo Istruzioni, File e «Ha deciso» della scheda dell'autopilota
  dietro «⋯»** (non tolte). La regola dice niente funzioni spostate senza il suo
  sì: lo decide lui, si può rimettere com'era.

## In attesa di Nicholas (dopo l'installazione, che fa solo lui)
- I tre gesti per i workspace del 19/10: «Sposta in…» dell'autopilota
  «Recupero VisitaFacile» → NexoraOS, poi «Elimina» sui due workspace sbagliati.
- «Chat delle prove» sul Drive: da togliere, la conferma lui.
- La cartella prova-c2 sul DESKTOP: da togliere, la conferma lui.

## Note per chi rilascia
- Nella copia di lavoro della chat non c'è `node_modules`: le suite si lanciano
  nella cartella principale (che è su main), come fanno i criteri.
- `android/` è cambiato dalla v0.81.1 → APK 2.82.0 (versionCode 138) con
  `npm run allega-apk`.
