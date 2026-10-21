---
titolo: "Il menu dei workspace: dalla tendina della 0.27.0 al menu con ricerca, gruppi e «⋯» (0.82.0)"
quando: 2026-10-21T03:00:00+02:00
tag: ["ui", "workspace", "fascia", "menu", "0.82.0", "pagina", "android", "c-36"]
---

Nicholas (15/09): «quando sono tanti vedo solo dei puntini praticamente.
metti un menu a tendina o qualcosa di figo». Le linguette `.ws__voce` hanno
`max-width: 120px` e con dieci workspace si leggeva «Prede…», «W…», «H…».

- `src/renderer/menu-workspace.ts` (puro, provato): `LINGUETTE_MAX = 6`,
  `serveIlMenu`, `filtraWorkspace` (senza accenti/maiuscole, ordine
  conservato), `contaChatPerWorkspace` da `workspace.dove()` (sessione →
  workspace).
- `src/renderer/components/MenuWorkspace.tsx`: il tasto con il nome intero
  di dove sei, il numero dei workspace e il pallino se altrove qualcuno
  chiama; la tendina (`.ws-menu__tendina`, velo trasparente per chiudere
  cliccando fuori, Esc) con tutti i nomi per esteso, ✓ sull'attivo, ● su
  chi chiama, «N chat»; casella di ricerca oltre gli 8 (Invio = il primo);
  in fondo «Crea, rinomina o elimina…» (il pannello di sempre).
- `Console.tsx`: fino a 6 workspace le linguette come prima; oltre, il
  menu. Il cambio passa da `cambiaWorkspace` (stesso salvataggio del layout).

## 16/09 — la tendina si vedeva a metà: solo la casella (0.27.0 → 0.28.0)

Nicholas: «mi fa vedere solo il cerca e non mi serve, voglio l'elenco».
Causa: `.sezione--cede` e `.sezione .ws` hanno `overflow-x: auto` (la fascia
dei workspace scorre in orizzontale), e un `overflow-x` diverso da `visible`
forza anche `overflow-y` a tagliare: la tendina, figlia della fascia in
`position: absolute`, veniva tagliata al bordo della fascia e restava la
prima riga. Rimedio: la tendina va in un **portale** su `document.body`,
`position: fixed`, posizionata sotto il tasto con `getBoundingClientRect`
(ricalcolata al resize). Regola generale: **niente menu a tendina figli della
fascia**, sempre portale.

Tolta la casella di ricerca: frecce ↑↓ e Invio per scegliere, scrivendo un
pezzo del nome si filtra (riga «Cerchi «xy»», Backspace cancella). Aperto o
chiuso lo decide la Console (`menuWsAperto`), così lo apre anche la
scorciatoia Ctrl+Shift+W (vedi `scorciatoie-da-tastiera.md`).

## 21/10 — rifatto su PC, pagina e app (0.82.0, ramo c-36)

**Com'è adesso.** In cima la ricerca per nome (senza accenti e maiuscole);
sotto i gruppi **«Recenti»** (dove sei, poi gli ultimi dove sei andato, al
massimo 5, e solo se i workspace sono più di 5), **«Questo PC»** con gli altri
nell'ordine di sempre, e **un gruppo per ogni altro PC** (solo i suoi workspace
che qui non ci sono; gruppi vuoti tolti). Ogni riga: tocco = ci vai (altro PC:
apre «⋯»); **«⋯»** = apri / rinomina / Apri cartella / Sposta su un altro PC
(solo PC: è il trasloco, `ModaleSposta`) / Elimina (con conferma e recupero
30 gg). Altro PC: Apri (dal vivo) e Porta qui. Il piede «Crea, rinomina o
elimina…» resta. Nessuna funzione tolta: le vecchie righe rinomina/elimina/«Apri
cartella» del solo attivo sono diventate il «⋯» di ogni riga.

**Dove stanno le regole.** Tutte in `src/shared/menu-workspace.ts`
(`gruppiMenuWorkspace`, `azioniMenuWorkspace`, `postoTendina`), autosufficienti
perché la pagina le cuce con `fn.toString()`; l'app le ha in `MenuWorkspace.kt`,
confrontate coi casi `android/app/src/test/resources/menu-workspace/menu-0.82.json`
(si riscrive con `AGGIORNA=1 npx vitest run tests/shared/menu-workspace-app.test.ts`).
I recenti stanno in `workspaces-recenti.json` accanto a `workspaces.json`
(`src/main/workspace-recenti-file.ts`); li tocca solo un cambio voluto (causa
`nicholas` o `telefono` in `cambio-schermo.ts`), non i cambi automatici.

**Dentro lo schermo.** `postoTendina`: àncora tenuta nella finestra, altezza
massima = spazio disponibile meno 8 px, scorrimento interno; si apre sopra solo
se sotto c'è meno di min(serve, 240) px e sopra c'è più spazio. Il «⋯» usa la
stessa funzione (allineato a destra). Foto dalla copia di prova (30 workspace
finti, `note/prova-c36/foto/`, fuori da git): **prima**, a 560×380 la tendina
finiva a 384 px (fuori di 4) e a 480×300 tagliata; **dopo**, a 800×500,
560×380 e 480×300 finisce a H−8 e l'elenco scorre; il «⋯» dell'ultima riga si
apre sopra. Sulla pagina il riquadro Workspace passa da 982 a 698 px (elenco
con `max-height: 60vh` e scorrimento).

**Trappole.**
- **Rinominare faceva tornare il nome vecchio al riavvio**: `riparaListaAllAvvio`
  ritrovava il vecchio nome nelle copie «migrazione-elenco-…» e lo rimetteva.
  Ora la rinomina chiama `annotaRinominato` (come un'eliminazione) in
  `workspace-ritrova.ts`.
- Pagina: `pannello(s)` non ridisegna se `impronta(s)` non cambia → lo stato
  del menu (`wsAperto`, `wsRinomina`, `wsFiltro`) **deve** stare nell'impronta,
  se no «⋯» non si apre. La ricerca invece riscrive solo `#ws-lista`, così la
  casella non perde il fuoco.
- Dentro il template della pagina gli apici JS vanno scritti `\'`; gli heredoc
  Python/Bash li mangiano: correggere con l'editor.
- Nelle foto via CDP `foto w h` ridimensiona la finestra: il ridimensionamento
  chiude «⋯» (voluto), quindi le foto del «⋯» si fanno senza misure.
- Le funzioni della pagina chiamate fra loro vanno chiamate come
  `window.wsApriAzioni(...)`: definite come `window.x = function`, non esistono
  come nomi liberi.
