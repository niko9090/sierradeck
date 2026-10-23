---
titolo: "Riscontro con la prova per ogni richiesta chiusa (0.85.0)"
quando: 2026-10-23T15:00:00+02:00
tag: ["0.85.0", "riscontro", "lista-lavori", "autopilota", "c-128"]
---

# Riscontro con la prova (0.85.0, c-128)

**Cosa fa.** Quando un criterio passa da rosso a verde nella cartella
principale (dopo l'unione del ramo), l'autopilota scrive nella sua
conversazione una riga sola:

`Fatto [0t]: oltre i rifacimenti decide il programma, … — commit 21727a1f · test tests/autopilot-host/oltre-rifacimenti-0-84-4.test.ts · nella 0.84.4`

La stessa riga va in una mossa `riscontro:` del registro (decisioni) e
nella colonna stato della riga `0t` di `lista-lavori.md`, dopo
`**Riscontro:**`. Finché il tag non c'è, dice «nella prossima versione». A
ogni misura dopo (giro o «Ricontrolla i criteri») si guarda
`git tag --contains`, e la riga si corregge al suo posto, senza aggiungerne
un'altra.

**Dove.** `src/autopilot-host/riscontro.ts` contiene le regole e il git.
`riscontra` sta in `server.ts`, chiamato subito dopo la misura dei criteri
nel giro e in `ricontrollaCriteri`. Lavora in sottofondo e salva sul fresco
del disco: `conservaCambiUtente` tiene dialogo e decisioni scritti durante
il turno.

**Identificativo della richiesta.** È il `#` della riga in
`lista-lavori.md` («0t», «6c»), non un registro nuovo. Il criterio lo può
portare fra quadre: «[0t] …». Se non lo porta, si sceglie la riga che
contiene almeno il 60% delle parole del criterio, ma solo con 15 punti di
stacco sulla seconda. Le righe delle release («0.84.4») e quelle di «Già
fatte» (senza `#`) non contano. Quando c-127 porterà il registro delle
richieste, il criterio che crea dovrebbe scrivere «[id]» nel testo: così il
collegamento è sicuro.

**Le prove.** Il commit è l'ultimo che ha toccato il test nominato nel
comando del criterio. Se il comando non ne nomina, è l'ultimo commit che
non sia un'unione, con il suo test (si preferisce quello con la versione
nel nome rispetto a `server.test.ts`). «Cosa» viene dal titolo del commit,
senza `fix(...)` e senza la parentesi finale.

**Trappole.**
- La lista si salva con un commit suo nella cartella principale
  (`git commit --only -- lista-lavori.md`), sotto il turno delle unioni, e
  **solo se prima non era già cambiata a mano**: il lavoro di altri non entra
  mai in un commit del programma. Se il commit fallisce si torna al testo di
  prima.
- Le chat che ritoccano `lista-lavori.md` sul loro ramo possono andare in
  conflitto con questi commit sulla stessa riga. È un conflitto di testo,
  facile da risolvere tenendo tutte e due le parti.
- Nei test serve `user.name`/`user.email` nel repository di prova: su
  questo PC non c'è un'identità git globale, e senza il commit fallisce.
