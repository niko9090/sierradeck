---
titolo: "Vista progetti/chat/workspace (0.67.0): proposta UI/UX e scelte fatte"
quando: 2026-10-12T19:30:00+02:00
tag: ["ui", "workspace", "progetti", "pannello-drive", "0.67.0"]
---

## Il problema (Nicholas, 12/10)
«Non vedo le chat! Fionda non lo trovo più, solo sul cellulare; la visualizzazione
dei workspace fa cagare.» Il progetto «fionda apl» vive su DESKTOP, ha 5 chat, ma
**nessun workspace**: sul PC compariva solo come numero («5 chat») nel pannello
Progetti, senza un modo di aprire le chat. «Riprendi» elenca solo le sessioni di
questo PC. Il telefono lo vedeva perché la scheda Chat di un altro PC elenca tutto.

## La proposta del revisore UI/UX (agente, solo lettura del codice)
- **P1.1** nel pannello Progetti ogni progetto si apre e mostra le sue chat, con
  «Apri» o «Apri su <PC>» (chat che vive altrove → riquadro remoto dal vivo).
- **P1.2** lo stesso sulla pagina e nell'app.
- **P1.3** nella tendina dei workspace una sezione «Progetti senza workspace».
- **P2** gerarchia del pannello (elenco in cima, attività/spazio sotto e chiusi),
  raggruppare per PC, 4 stati della chat (lavora / aspetta te / ferma / PC spento),
  «Su altri PC» con tasti uguale su PC, pagina e app.
- **P3** contatore «+N progetti fuori» nella barra, «Nuova chat su <PC>», righe
  corte con il resto dietro «?», una vista unica «Workspace e progetti».

## Cosa è stato fatto nella 0.67.0
- **Ogni progetto ha il suo workspace** (al posto di P1.3): sul PC residente si
  crea da solo con le chat con nome, senza cambiare lo schermo
  (`workspaceDaCreare` in `workspace-riparazioni.ts`, giro in `giroCasa` ogni
  10 min, copia `workspaces.prima-dei-progetti.json` prima di scrivere). Non si
  crea se esiste già (maiuscole a parte), se Nicholas l'aveva eliminato, e una
  chat già in un altro workspace resta lì. Così il progetto compare negli altri
  PC sotto «Su altri PC» e si apre con **Apri** (`workspace:apriDaAltroPc`:
  riquadri remoti dal vivo, le chat restano sul residente).
- **«Su altri PC» sempre nella barra**: prima stava solo nella tendina, che c'è
  solo con tanti workspace; con 2-3 workspace (linguette) era invisibile.
  Componente `SuAltriPc.tsx`. Se l'altro PC non risponde, il messaggio si vede
  nella tendina (prima il clic non faceva niente).
- **P1.1 + P3.3**: nel pannello il **nome del progetto** apre/chiude l'elenco
  delle sue chat; riga corta «vive su X · N chat · usato …», il resto dietro «?».
  Le chat si contano su tutti gli id del gruppo (`chatDelProgetto`), non solo sul
  primo (c'era il bug segnalato dal revisore).
- **P1.2**: pagina (`pdApriChat`) e app (`PannelloDrive.kt`, `Api.apriChatProgetto`)
  hanno lo stesso elenco con «Apri»/«Apri su X»; `/api/sessioni/riprendi` accetta
  `pc` e apre dal vivo.

## Non fatto (da proporre a Nicholas)
P2 intero (gerarchia, per PC, 4 stati), P2.4 tasti su pagina/app per «Su altri
PC», P3.1, P3.2, P3.4.

## Trappole
- La griglia `.ws-menu__voce` ha 4 colonne: righe con un numero diverso di celle
  stringono il nome a 16 px («fi…»). Le righe «Su altri PC» usano
  `.ws-menu__voce--altrove`.
- Dentro `.riordina__testo` un `<button>` diventa una barra larga quanto la riga:
  per il nome cliccabile si usa uno `span role="button"`.
- IPC `casa:di` esisteva già: il nuovo si chiama `casa:pcDi` (registrare due
  volte lo stesso canale fa cadere l'avvio).
- Nella copia di prova il pannello mostra «0 chat» per il PC d'esempio: con la
  cassaforte chiusa i suoi `locali` non arrivano al pannello. Non è un difetto
  della vista; le chat vere si vedono sul PC vero.
