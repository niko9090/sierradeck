---
titolo: "0.85.0 — Le richieste di Nicholas diventano obiettivi da sole: come funziona il registro"
quando: 2026-10-23T15:20:00+02:00
tag: ["0.85.0", "richieste", "autopilota", "punto", "c-127"]
---

# Le richieste di Nicholas diventano obiettivi da sole (0.85.0, c-127)

**Il difetto.** Il 23/10 alle 07:25 Nicholas ha scritto all'autopilota due richieste in un messaggio solo («…devi trovare una soluzione… le risposte arrivano alle chat ma non vengono prese in carico, controlla anche questo»). Il supervisore ha risposto «lo correggo subito» ma nel JSON del dialogo ha messo solo `perLaChat`: niente criterio, niente compito. Le due correzioni sono entrate in coda alle 09:49, quando se n'è accorto il supervisore stesso. Una richiesta entrava negli obiettivi **solo se il supervisore se ne ricordava**.

**Adesso.** Il registro sta dentro l'autopilota: campo `richieste` (`src/shared/richieste-nicholas.ts`, tipo `RichiestaNicholas`). Il registro è **uno solo**: il riscontro (c-128) e la velocità (c-129) aggiungono i loro campi qui, non ne fanno un altro.

| Campo | Cosa |
|---|---|
| `id` | `r-1`, `r-2`… |
| `quando`, `testo` | data e parole di Nicholas (senza «Hai risposto:») |
| `titolo` | in poche parole, per il Punto |
| `criterio` | descrizione del criterio aggiunto a `a.criteri` — mai vuoto |
| `compiti` | i testi messi in `compitiDaFare` (come `ChatGovernata.compito`) |
| `da` | `supervisore` (l'ha detta lui nel JSON) o `programma` (ripiego) |
| `fattaIl`, `versione`, `commit` | quando il criterio è soddisfatto; la prima release `v*` uscita dopo; il commit (per il riscontro) |

## Il giro

1. Prompt del dialogo (`autopilot-host/dialogo.ts`): nuovo campo `richieste: [{titolo, criterio:{descrizione, comando?}, compiti}]`, `[]` per le domande.
2. `rispondiAlDialogo` (server) chiama `registraRichieste` (`autopilot-host/richieste.ts`):
   - se il supervisore le dice, si usano le sue (un `comando` che non passa `vagliaCriteri` si toglie, il criterio resta e lo giudica il supervisore);
   - se non le dice, **o non risponde affatto**, e il messaggio chiede qualcosa (`sembraRichiesta`: una frase **non** con «?» con un verbo che chiede: correggi, controlla, togli, devi, voglio…), la scrive il programma dalle sue parole;
   - non diventano obiettivi: domande, «sì»/«ok», `comando` ferma/riprendi/rispondi, le tracce della linguetta «Domande», una richiesta uguale a una aperta da meno di 24 h;
   - i compiti che lo stesso dialogo ha già messo con un `cambio` si legano alla richiesta, niente doppioni.
   Una richiesta registrata conta come cambio: un autopilota finito o fermo riparte da solo (`ripartenzaDopoDialogo`).
3. Ad ogni `salva`, `tieniRichieste`: criterio tolto da un cambio → torna; compito che non è in coda né in mano a nessuna chat → torna in coda; criterio soddisfatto → `fattaIl`.
4. Ogni 10 minuti (giro del guardiano) `versioniDelleRichieste` legge i tag `v*` del progetto e `conVersioni` mette la versione alle fatte.

**Stato** (`statoRichiesta`): fatta (data o criterio soddisfatto) → in corso (una chat ha il compito, anche finita) → da fare.

**Il Punto**: `puntoDi` dà `richieste` e `richiesteTotale`, in cima: prima in corso, poi da fare, poi le fatte non pubblicate o pubblicate da meno di un giorno; al più 5. Stessi testi e colori (`COLORE_RICHIESTA`: ambra, blu, verde) su PC (`PuntoAutopilota.tsx`), pagina (`puntoHtml` in `client-pagina.ts`) e app (`PuntoAutopilota.kt`, `RichiestaNelPunto`).

## Trappole

- Il turno di una chat salva con la fotografia di inizio turno: `richieste` va presa dal disco in `conservaCambiUtente` e nella fusione di fine dialogo (fatto). Un campo nuovo dell'autopilota scritto dal dialogo va aggiunto **in tutti e due** i posti, o sparisce.
- `parseAutopilota` rifiuta un oggetto senza `versione`: nei test che leggono dal disco serve `versione: 1`.
- Le richieste vecchie (prima della 0.85.0) non sono nel registro: si parte dalla prima scritta dopo l'installazione.

Test: `tests/autopilot-host/richieste-nicholas-0-85-0.test.ts` (caso vero del 23/10 07:25, il «togli i vincoli» del 22/10 col supervisore guasto, «a che punto siamo?» che non diventa obiettivo), `tests/main/punto-pagina.test.ts`, `PuntoAutopilotaTest.kt`.
