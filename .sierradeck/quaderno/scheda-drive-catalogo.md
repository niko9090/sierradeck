---
titolo: "La scheda «Drive»: il catalogo, «Porta qui» e il riavvio automatico (0.21.0)"
quando: 2026-09-09T18:00:00+02:00
tag: ["drive", "catalogo", "progetti", "chat", "workspace", "riavvio", "ui"]
---

# Perché

Nicholas (2026-09-09): «vorrei che si riavviasse in automatico dopo la
fusione… non mi ha aggiunto né chiesto se aggiungere i workspace e le chat
trovate in più nel Drive… non c'è una vera sezione dove posso navigare sui
progetti presenti nel Drive e importarli o gestirli da questo PC. Tutta la
dinamica non è comoda e chiara.» Confermato il disegno: catalogo per
progetto (PC d'origine come etichetta), atterraggio in
`Documenti\Progetti SierraDeck\<nome>`.

# Com'è fatto

- `src/main/cassaforte/catalogo.ts` (puro, provato): `costruisciCatalogo`
  legge manifesto del Drive, firme locali, workspace di qua e di là, indice
  delle conversazioni e i due registri → `Catalogo { progetti[], totali,
  workspaceSoloDrive }`. Le chat si raggruppano per cartella (cwd
  dall'indice, poi dai workspace, poi dallo slug); una cartella dentro un
  progetto del registro (percorsi di qualunque PC o `origini`) prende id e
  nome del progetto. Stato per voce (`statoDi`): uguale / indietro / avanti
  / soloDrive / soloQui; per progetto: allineato / daPortare / daAggiornare /
  soloQui / misto. `scelteDiPortaQui(g)` = chat soloDrive|indietro +
  file `progetto-<id>` soloDrive|indietro → tutte `scarica`.
- `sincronia.catalogo()` (non prende il lavoro; con cassaforte diversa
  risponde `cassaforteDiversa: true`) e `sincronia.portaQui(chiave)`: se il
  progetto è nato altrove e non ha cartella qui, `mkdir
  <cartellaProgetti>/<nome>` + `adottaOrigine` nel registro (`origini:
  [cwdOrigine]`), poi `eseguiFusione({ voci, workspace: unione })`; il Core
  chiama `rimappaChat()` dopo (IPC `sync:portaQui`), e `rimappaCwd` ora
  guarda anche `origini` → le chat vengono rimappate sulla cartella di qui e
  le trascrizioni copiate sotto il nuovo slug.
- `ProgettoDrive.origini?: string[]` (registro, `parseRegistro`,
  `fondiRegistri` le unisce).
- Riavvio: `EsitoLavoro.riavvioConsigliato` (fusione con `scaricati > 0`,
  ripristino con `scritti > 0`); `App.tsx` striscia con conto alla rovescia
  di 10 s, «Riavvia ora» / «Più tardi» (rinvio per quell'esito); IPC
  `sistema:riavvia` = `attendiQuiete` (come l'aggiornamento) → `app.relaunch()`
  + `app.quit()`; se le chat non si fermano, lo dice e non riavvia.
- UI: `PannelloDrive.tsx` (tasto «☁ Drive» in `Console`, `PannelloAperto`
  'drive'): spiegazione in testa, quadro del lavoro in corso, riassunto con
  totali, filtro, elenco progetti (nome, chat, cartella sul Drive, ultimo
  tocco, origine, percorso qui o d'arrivo, stato colorato, «Porta qui (N)»),
  chat espandibili con stato; «Fondi con il Drive…» apre il piano completo.

# Da sapere

- Il catalogo si rilegge da solo quando un lavoro finisce (`onLavoro`).
- Le chat scaricate stanno sotto lo slug d'origine finché `rimappaChat` non
  le copia sotto quello di qui: il test lo verifica al livello sincronia,
  la rimappatura la fa il Core dopo l'IPC.
- Limite noto che resta: la stessa conversazione può esistere una volta per
  PC sul Drive (slug diversi): il catalogo la mostra due volte, in due
  progetti-cartella diversi.

# 0.22.0 — le azioni per voce e la stessa chat sotto due cartelle

- `ChatCatalogo.altroveQui`: una chat «solo sul Drive» il cui `sessionUuid`
  esiste qui sotto un'altra cartella diventa `uguale` con `altroveQui` =
  quella cartella; `scelteDiPortaQui` la salta, i conti la contano fra le
  uguali. È la risposta al limite «chat duplicate per slug»: sul Drive
  restano due copie (non si può cancellarne una senza il ping-pong con
  l'altro PC, vedi `manifesto-locale-cancellava-le-chat.md`), ma il catalogo
  ne mostra una.
- «Apri» → IPC `chat:riprendi(cwd, sessione)` = la strada della ripresa dal
  telefono (`finestraPerRipresa`, `client:apri` con `workspace`); la cwd è
  `altroveQui ?? cartellaQui ?? cartellaOrigine`.
- «Aggiorna qui» è lo stesso tasto di «Porta qui» quando lo stato è
  `daAggiornare`. «Togli la cartella dal Drive» → `progetti.rimuovi(id)` con
  `ModaleConferma`; solo per progetti registrati con file sul Drive. Togliere
  le CHAT dal Drive non ha senso nel modello: qualunque chat locale risale
  al salvataggio dopo.

# 0.23.0 — «Per workspace» (Nicholas: «non vedo come importare un workspace con le sue chat»)

- `Catalogo.workspace: WorkspaceCatalogo[]` (nome, `quiEsiste`, `chat` con
  `progetto`/`chiaveProgetto`, `progetti` toccati, `daPortare`, `quiUguali`)
  costruito dai workspace di `archivioDrive` incrociati con le chat dei
  gruppi (per `sessionUuid`).
- `sincronia.portaQuiWorkspace(nome)`: per ogni progetto toccato
  `preparaCartella` (la stessa di «Porta qui», ora condivisa), voci =
  `scelteDiPortaQui(g, …, soloChat = le chat del workspace)`, poi
  `eseguiFusione` con workspace «unione» → il workspace del Drive entra qui
  con le sue chat (anche se qui non esisteva). IPC `sync:portaQuiWorkspace`.
- UI: due viste con tasti «Per progetto (cartella)» / «Per workspace», la
  frase che spiega la differenza, e per workspace «Porta qui il workspace
  (N)» o «Crea qui il workspace» quando le chat ci sono già.

# 0.24.0 — il Drive dal telefono (pagina + app 2.27.0)

Rotte (`client-rotte.ts`, deps opzionali → `disponibile: false` con un PC
vecchio): `/api/drive/catalogo` (GET), POST `/api/drive/porta {progetto}`,
`/api/drive/portaWorkspace {workspace}`, `/api/drive/lavoro` (GET, lo
`StatoLavoro`), POST `/api/drive/annulla`, POST `/api/drive/riavvia`
(`attendiQuiete` + relaunch, come l'IPC). In `index.ts` le deps chiamano
`sincronia.catalogo/portaQui/portaQuiWorkspace` + `rimappaChat()`.
Pagina: tasto «Drive» nel tab Computer, `vistaDrive` con viste per
progetto/workspace, barra del lavoro (poll ogni 2 s finché aperto, rilettura
a lavoro finito), «Riavvia il computer ora» se `riavvioConsigliato`. App:
`Drive.kt` `SezioneDrive(api)` in `Computer.kt` (stessa logica), modelli
`Catalogo`/`StatoLavoro`/`RispostaCatalogo`/`EsitoPorta` in `Modelli.kt`.
Il riavvio automatico del PC lo fa il renderer: se la finestra del PC è
chiusa (icona nell'area di notifica) non parte, e il telefono lo dice e
offre il tasto.
