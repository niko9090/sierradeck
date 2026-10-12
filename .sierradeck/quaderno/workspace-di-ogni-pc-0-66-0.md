---
titolo: "0.66.0: ogni PC ha i suoi workspace; un workspace è un progetto; «visitafacile»"
quando: 2026-10-12T17:30:00+02:00
tag: ["workspace", "fusione", "porta qui", "ripristina", "riquadro remoto", "progetto", "visitafacile", "0.66.0", "difetto di Nicholas"]
---

# I difetti (Nicholas, 12/10)

- «i workspace adesso sono visualizzati da tutti sempre gli stessi e non trovo più quelli che avevo prima nei vari PC»
- «visita facile l'ho creata in un pc e mi dice che è di un altro, e anche nell'altro mi dice che è di un altro pc»
- «dobbiamo anche semplificare le azioni»

# Le cause, nel codice

1. **«Porta qui» fondeva TUTTI i workspace del Drive nella lista del PC.** `sincronia.portaQui` e `portaQuiWorkspace` chiamavano `eseguiFusione` con `{ modo: 'unione', escludi: [] }`. Bastava una «Porta qui» di un progetto qualunque, anche quella automatica dell'allineamento (per esempio «PORTA QUI «DDJ-Dj_Deck»» alle 13:17 UTC del 12/10), perché la lista del PC si riempisse con quella di tutti. Così il PC fisso e il portatile hanno finito per mostrare gli stessi 16 workspace.
2. **«Tieni quelli del Drive»** (`fondiArchivi` con il modo `drive`) e **«Ripristina»** (`sierradeck/workspaces.json` non era fra i file di ogni PC) **sostituivano** la lista del PC con quella del Drive. I workspace che c'erano solo lì sparivano.
3. **Il riquadro che guarda sé stesso.** La fusione portava sul PC anche i riquadri «remoti» degli altri. Un riquadro che su un PC guardava l'altro, una volta arrivato su quell'altro, guardava sé stesso. È il caso di «visitafacile»: qui il riquadro aveva `remoto.pcId` uguale all'id di questo PC.
4. **«visitafacile» non era un progetto.** La sua chat (4556bd96) era nata nella cartella Documenti, non in una cartella di progetto, quindi non compariva nella lista dei progetti. La chat non è mai stata usata: non ha una trascrizione su nessun PC né sul Drive.

# Cosa è cambiato

- `portaQui` porta nella lista solo il workspace con il nome del progetto; `portaQuiWorkspace` porta solo quello chiesto (`tranneQuesti` → `escludi`).
- `fondiArchivi`, per un PC, in modo `drive` tiene i workspace che ha solo il PC. Con `io` i riquadri che guardano il PC stesso tornano locali.
- «Ripristina» tratta `sierradeck/workspaces.json` come un file di ogni PC (`PER_PC`): lo scarica solo se qui manca.
- **All'avvio** (`riparaListaAllAvvio`, prima che nasca una finestra):
  - ritrova i workspace che una copia di sicurezza degli ultimi 14 giorni aveva e adesso mancano (le copie sono `copie-di-versione/*/workspaces*.json` e `workspaces.prima-*.json`);
  - li rimette in fondo alla lista, prendendoli dalla copia più recente che li ha;
  - non riporta quelli che Nicholas ha eliminato: dalla 0.66 ogni eliminazione si annota in `workspaces-eliminati.json`, e un workspace visto per l'ultima volta nella copia «prima dell'eliminazione» resta eliminato;
  - ripara i riquadri che guardano il PC stesso: tornano locali, o guardano la casa vera della chat;
  - prima di scrivere fa una copia, `workspaces.prima-della-riparazione.json`, e scrive ogni passo nel registro come `[workspace] ritrovato «…»`.
- **«Su altri PC»**: il battito porta i nomi dei workspace del PC (`workspace`). Il menu dei workspace, la pagina e l'app mostrano a parte, sotto, quelli degli altri PC che qui non ci sono (`suAltriPc`); «Porta qui» li aggiunge.
- **Creare un workspace crea il progetto** (`progettoPerWorkspaceGlobale`): una cartella con lo stesso nome in `cartellaProgetti`, registrata, con la casa `progetto:<id>` su questo PC. Vale da PC (IPC `workspace:crea`), pagina, app e ponte (`aggiungiWorkspace`). Se il progetto c'è già su un altro PC non si crea niente.
- **Le chat nuove**: la finestra propone «Nel progetto «X»». «Altrove» rifiuta la cartella utente, Documenti e la radice di un disco. Anche `/api/apri` le rifiuta, oppure, se è indicato un workspace, mette la chat nel suo progetto.
- **`/api/workspace/progetto`**: un workspace che esiste già diventa un progetto, e le sue chat mai usate passano nella sua cartella. Se il workspace è a schermo lo fa la finestra. **`/api/workspace/storia`** (sola lettura): la lista, le copie e i ritrovati.
- **Nella lista dei progetti solo tre azioni**: «Apri», «Lavora su questo PC» (il trasloco) e «Togli da questo PC». I selettori «Rendi residente…» sono tolti dalla lista dei progetti; restano per le singole chat.

# Le 10 chat messe nel recupero alle 13:23–13:26 UTC del 12/10

Le ha scelte Nicholas dal secondo PC fisso, con «Rendi residente» dal pannello: sei con casa sul portatile, quattro sul secondo PC fisso. Si riconoscono perché hanno lo stesso `decisaIl` e le voci `progetto:` insieme. Le ho controllate una per una: il PC scelto ha sempre una copia uguale (stessa dimensione) o più recente. Erano tutte giuste e non c'era niente da rimettere.
