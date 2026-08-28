---
titolo: "Il negozio sul telefono era vuoto: un oggetto travestito da elenco"
quando: 2026-08-28T15:35:00+02:00
tag: ["negozio", "telefono", "client", "difetto", "tipi"]
---

## Il sintomo
Dal telefono la scheda **Negozio** era sempre vuota, e diceva: «Questo computer
non sa ancora aprire il negozio da qui: aggiornalo» — a un computer che era già
all'ultima versione. Il messaggio ha mandato a cercare nel posto sbagliato per
settimane.

## La causa
In `src/main/index.ts`, la dipendenza `negozio` del Client:

```ts
const [plugin, ...] = await Promise.all([ elencoPlugin().catch(() => []), ... ])
return { plugin: plugin as unknown[], ... }
```

`elencoPlugin()` **non torna un elenco**: torna `{ plugin, errore? }`. È voluto —
il CLI di Claude Code può fallire, e il modulo lo dice invece di fingere un
negozio vuoto (c'è pure un commento che lo spiega). Quell'oggetto finiva intero
nel campo `plugin`, e l'`as unknown[]` **spegneva l'unico controllo** che
l'avrebbe visto.

Dall'altra parte, `kotlinx.serialization` si aspetta `List<PluginVoce>`, trova un
oggetto, e solleva. La conversione salta **tutta insieme**: non solo i plugin —
skill, agenti e MCP sparivano con loro, perché la risposta si decodifica in un
colpo solo. L'eccezione finiva nel `catch` che diceva «aggiornalo».

## Le tre lezioni

**1. Un `as` è un permesso di sbagliare in silenzio.** `plugin as unknown[]` non
converte niente: dice al compilatore di smettere di guardare. Ogni cast su un
confine — IPC, HTTP, file — va giustificato, e se serve a far compilare qualcosa
che «dovrebbe» andare, quasi sempre è lì il difetto.

**2. Un confine fra due linguaggi ha bisogno di un test sulla *forma*.** C'erano
test sul contenuto delle rotte del negozio e nessuno che chiedesse
`Array.isArray(corpo.plugin)`. Adesso c'è: due righe, e avrebbero risparmiato
tutto.

**3. Un messaggio d'errore che *indovina* la causa fa più danno del silenzio.**
«Aggiornalo» era una supposizione scritta come un fatto, e ha spostato la ricerca
di settimane. Ora l'app distingue un computer davvero vecchio (404 sulla rotta)
da una risposta che non riesce a leggere, e nel secondo caso dice cosa è successo
invece di dare la colpa a qualcosa.

## Cosa c'è adesso (0.12.22 / app 2.12.0)
- `/api/negozio` manda elenchi veri, più due campi separati: `errore` (il negozio
  non ha potuto rispondere) e `nota` (un vuoto legittimo — «nessuna chat aperta
  sul computer, posso mostrare solo le cose personali, non quelle del progetto»,
  che era un altro vuoto che sembrava un guasto).
- Sul telefono un guasto **con** dei dati è una banda rossa in cima, non uno
  schermo vuoto: se il catalogo dei plugin non parte, skill e agenti restano
  visibili. Nascondere quello che funziona insieme a quello che non funziona è
  la reazione sbagliata a un guasto parziale.

Il pannello sul computer non era toccato: legge `r.plugin` e `r.errore` come si
deve. Era un difetto del solo confine col telefono — cioè del pezzo che nessun
test attraversava.
