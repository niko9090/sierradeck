---
titolo: "Il lavoro con il Drive si vede, si annulla e si riprende (0.18.0)"
quando: 2026-09-08T18:30:00+02:00
tag: ["drive", "fusione", "sincronia", "progresso", "annulla", "bug", "dati"]
---

# Il difetto (Nicholas, 2026-09-08)

«Il sync con il Drive sembra avviarsi ma non si capisce perché non c'è
nulla di visualizzabile… ho premuto fuori e non so cosa sia successo… deve
vedersi una barra con percentuale e cosa sta facendo, se minimizzo in alto
come l'aggiornamento, sempre con Annulla; se ci sono operazioni a metà devo
poterle sovrascrivere.» Il pannello di fusione in fase «eseguo» mostrava una
frase fissa: il progresso c'era (`sync:progresso`) ma lo ascoltava solo il
pannello Account.

# Com'è fatto

- `src/main/cassaforte/lavoro-in-corso.ts` (NON `lavoro.ts`, che è
  compressione/cifratura): `creaLavoro()` → `avvia(tipo)` (uno alla volta:
  fusione | ripristino | salvataggio; se occupato solleva) restituisce una
  `Presa { segnale: AbortSignal, aggiorna(p), fine(esito, messaggio) }`;
  `annulla()`, `stato()` `{ inCorso?, ultimo? }`, `onCambio`.
- `sincronia.ts`: dep `lavoro?`; `salva`, `ripristina`, `eseguiFusione`
  prendono il lavoro (`prendiLavoro`), passano `segnale` e il progresso
  (`progressoVerso`: al canale vecchio E alla presa), chiudono con
  `chiudiLavoro`. Il progresso della fusione porta `dettaglio` (le ultime
  due parti del percorso). `StatoFile.ultimaFusione: { quando, esito:
  ok|interrotta|fallita, fatti, totale, scelte? }` esposto da `stato()`.
- `incrementale.ts`/`fusione.ts`: `segnale?: AbortSignal`. **Annullare
  ferma fra una voce e l'altra, mai a metà di una**, e lascia il Drive
  coerente: salva e fusione scrivono comunque il manifesto con ciò che è
  salito davvero (ogni blob caricato ha la sua voce); il ripristino
  annullato NON scrive il manifesto locale (`manifesto: undefined`), perché
  dire «so tutto del Drive» senza avere i file farebbe cancellare dal Drive
  al salvataggio dopo ciò che non è mai arrivato.
- `index.ts`: `lavoro.onCambio` → `sync:lavoro` a tutte le finestre; IPC
  `sync:lavoro`, `sync:annullaLavoro`.
- Renderer: `progresso-sync.ts` `descriviLavoro`; `App.tsx` striscia in
  alto (stesso stile dell'aggiornamento) con titolo, testo, dettaglio,
  barra, «Apri» (impostazioni) e «Annulla»/«Mi fermo…»; finito, resta una
  riga con l'esito (non per i salvataggi automatici) chiudibile con ×.
  `ModaleFusione` in «eseguo»: barra + percentuale + cosa fa, «Chiudi
  (continua da sola)» e «Annulla»; si può chiudere con Esc/clic fuori.
  All'apertura del piano legge `stato().ultimaFusione`: se non è `ok`,
  rimette le scelte di allora sulle voci ancora presenti (quelle fatte
  risultano uguali e non compaiono) e lo dice con una riga ambra.
  `PannelloAccount`: nota ambra se l'ultima fusione è interrotta/fallita.

# BUG GRAVE trovato e chiuso nello stesso giro

Dopo una fusione il manifesto locale veniva scritto = manifesto del Drive,
che contiene anche le voci lasciate «com'è» solo sul Drive. Al salvataggio
successivo `salvaIncrementale` le vedeva come «le avevo e non le ho più»
(`forseCancellati`, prefisso `chat` nostro) e le **cancellava dal Drive**.
Ora `manifestoDiQui()` tiene solo le voci che stanno davvero su disco.
Test: `cassaforte-fusione-interrotta.test.ts` («una chat lasciata com'è
solo sul Drive resta sul Drive anche dopo il salvataggio»).

# Da sapere

- «Annulla» finisce la voce in corso: annullando «a 2 fatte» se ne trovano 3.
- Il totale della fusione conta anche `sierradeck/workspaces.json` e
  `progetti-drive.json`, che salgono sempre.
- Un'operazione interrotta si «sovrascrive» rifacendola: il piano nuovo è
  calcolato dallo stato reale, e le scelte di prima tornano come predefinite.

# 0.19.5 — la fila invece dell'errore

«Fondi adesso» durante il salvataggio automatico dava la fase `errore` con
il messaggio secco della guardia, e «Riprova» rileggeva il piano perdendo le
scelte. Ora `prendiLavoro` solleva un messaggio che inizia con
`LAVORO_IN_CORSO:` (e spiega il perché); `ModaleFusione` lo riconosce →
fase `attesa`: mostra il lavoro in corso con barra (da `sync:lavoro`),
spiega, offre «Annulla il lavoro in corso» e «Torna alle scelte», e un
effetto riparte con `esegui()` appena `lavoro.inCorso` torna `undefined`.
`anteprimaFusione` non prende mai il lavoro: leggere il piano è sempre
possibile.
