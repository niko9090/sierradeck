---
titolo: "La cartella Documenti spostata su un altro disco: cosa succede alle chat e la regola della 0.28.2"
quando: 2026-09-16T23:10:00+02:00
tag: ["chat", "percorsi", "documenti", "rimappatura", "progetti", "trappola"]
---

Nicholas (16/09/2026 sera): «sto spostando la cartella documenti in E:\ così
ho più spazio … con lo Sposta nelle proprietà della cartella».

## Cosa c'è sotto

- Claude Code salva ogni chat in `~/.claude/projects/<slug del percorso>/`
  (`C--Users-nikof-Documents-Portfolio`) e dentro ogni riga c'è `cwd`. Le
  chat stanno sotto il profilo (`C:\Users\nikof\.claude`), NON dentro
  Documenti: lo spostamento non le tocca e non le perde. Ma per Claude Code
  `E:\…\Portfolio` è un progetto **diverso** da `C:\…\Portfolio`: senza
  rimappatura, `--resume` dalla cartella nuova non le trova.
- SierraDeck, a ogni avvio e dopo ogni arrivo dal Drive, rimappa le chat la
  cui cartella non esiste (`rimappaChatSulDisco` → `risolviSuDisco` →
  `risolviCartellaDiChat`). Fino alla 0.28.1 una cartella sparita di questo
  PC veniva **adottata** in `Progetti SierraDeck\<nome>` (vuota) e la
  trascrizione spostata lì con il `cwd` riscritto: Claude ripartiva senza i
  file. Il registro `progetti-drive.json` ne porta i segni: «Wdeck» adottato
  4 volte da 4 origini diverse.
- Stato trovato il 16/09: `[Environment]::GetFolderPath('MyDocuments')` già
  `E:\Users\nikof\Documents`; `C:\Users\nikof\Documents` ancora piena
  (Portfolio in copia alle 22:41, 105 voci; su E: c'era una vecchia copia di
  aprile con 21 voci → le due si fondono); 11 slug sotto `C--Users-nikof-
  Documents-*`, **Portfolio = 580 chat**, Trading\Trading 2, Wdeck 8 (che ha
  già lo slug su E:). Dentro C:\Documents ci sono anche i collegamenti
  simbolici Immagini/Musica/Video → Pictures/Music/Videos.

## La regola (0.28.2)

`risolviCartellaDiChat` riceve `radiciSpostate: [{ da, a }]`; in `index.ts`
`radiciSpostate()` confronta `join(homedir(), 'Documents')` con
`app.getPath('documents')` e, se differiscono, traduce il percorso vecchio nel
nuovo (`sostituisciPrefisso`) **quando la sottocartella esiste lì**: motivo
`spostata`, prima di ogni altra regola, anche di «altrove» (l'altro PC può
avere ancora lo stesso `C:\Users\nikof\Documents\...`). La trascrizione si
sposta sotto lo slug nuovo con il `cwd` riscritto, come per le altre
rimappature. Test: `tests/main/cartella-di-chat-spostata.test.ts`.

## Accortezze per chi sposta Documenti

1. Lasciar finire lo Sposta di Windows con SierraDeck chiuso o senza chat
   aperte in quelle cartelle: una chat viva scrive nella cartella mentre
   Windows la sposta.
2. Se sulla destinazione esiste già una copia vecchia, Windows le fonde e
   chiede per i file omonimi: rispondere «sostituisci» con la copia più
   recente (quella su C:), altrimenti restano file vecchi accanto ai nuovi.
3. Installare la 0.28.2 **prima** di riaprire le chat di quelle cartelle:
   con la 0.28.1 verrebbero adottate in cartelle vuote. Se è già successo,
   le chat non sono perse: stanno sotto `Progetti SierraDeck\<nome>` con
   l'origine nel registro; si rimettono a posto con «Porta qui» o a mano
   (spostare il `.jsonl` sotto lo slug nuovo e riscrivere `cwd`).
4. Non toccare `C:\Users\nikof\.claude` e `%APPDATA%\sierradeck`: non
   c'entrano con Documenti.
5. I workspace salvati (`workspaces.json`) tengono il `cwd` di ogni riquadro:
   una chat aperta da un workspace passa comunque da `risolviSuDisco`, quindi
   la regola vale anche lì.
