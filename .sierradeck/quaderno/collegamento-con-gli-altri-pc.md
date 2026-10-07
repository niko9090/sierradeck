---
titolo: "Il collegamento con gli altri PC (0.51.0, app 2.51.0): macchina degli stati, riconnessione, coda senza doppioni, grafica"
quando: 2026-10-07T10:30:00+02:00
tag: ["collegamento", "pc-remoto", "ponte", "telefono", "salute"]
---

# Richiesta di Nicholas (07/10)

«Miglioriamo la connessione ai pc con anche la visualizzazione grafica del
cambio e anche la visualizzazione della riconnessione e tutta quella parte lì
la dobbiamo migliorare».

# Dove sta cosa

- **Regole pure**: `src/shared/collegamento.ts`. Copie: la pagina servita
  (`passoLinea`, `qualitaLinea`… in `client-pagina.ts`, confrontata con
  l'originale su 800 eventi simulati in `tests/main/linea-pagina.test.ts`) e
  l'app (`Linea.kt`, `LineaTest.kt` con gli stessi scenari e le attese lette
  dal file TS). **Se cambi una regola, cambiala in tutti e tre**: i test lo
  dicono.
- **Macchina**: `cerco` → `collegato` ↔ `ricollego`. Un errore *della
  strada* (`erroreDiStrada`: tutto tranne `chat`, `pin`, `lento`) fa cadere;
  il primo successo fa tornare. Attese 1, 2, 5, 10, 30 s, poi sempre 30: mai
  una resa. «Riprova adesso» = prossimo tentativo subito.
- **Keepalive**: il giro di lettura (ogni 2 s) è anche il keepalive, con un
  tetto di 6 s (90 s se la strada è il Drive): oltre, la linea è caduta.
- **Qualità**: mediana del ritardo delle ultime 12 chiamate → 4 tacche sotto
  150 ms, 3 sotto 400, 2 sotto 1 s, 1 oltre; −1 se c'è una perdita, −1 se
  oltre il 25%.
- **Niente doppioni**: chi scrive mette un `idMessaggio` (8–64 caratteri);
  `/api/scrivi` lo ricorda per chat (`creaMemoriaInvii`, 500 id, un'ora) e
  a un id già consegnato risponde `{fatto, doppio}` senza scrivere. Si segna
  **solo dopo** la consegna riuscita: un tentativo fallito verso un altro PC
  si può rimandare.
- **Ponte**: la risposta di `/api/ponte` (se è un oggetto) porta in più
  `ponte: { strada, ritardoMs }` — strada fra PC accoppiato e l'altro PC,
  tempo del giro. Le app vecchie lo ignorano.
- **Mappa**: `Salute.mappa` (da `componiSalute` con `io`), coordinate 0–100,
  questo PC al centro; colori `COLORI_MAPPA` uguali ovunque.
- **Schermi**: PC `RiquadroRemoto.tsx` + `LineaRemota.tsx` (indicatore,
  fascia, coda) + `MappaPc.tsx`; pagina `lineaHtml`/`mappaHtml`; app
  `ChatSuAltroPc` (loop con `Linea.eOra`), `FasciaSuPc(linea)`, `FasciaLinea`,
  `CodaLinea`, `MappaPcVista`.

# Trappole

- Nel riquadro remoto l'invio della coda è un `useEffect` su `[linea.fase,
  coda, chatId]`; nell'app è **un solo loop** `LaunchedEffect(chat.id)`: con la
  coda come chiave, segnare «in invio» riavviava l'effetto e cancellava
  l'invio in corso.
- La pagina non ridisegna se l'impronta dello stato non cambia: per la fascia
  che conta i secondi c'è `ridisegnaLinea()` con `firmaLinea()`.
- La strada «migliore» la sceglie già `pc-remoto` (ribussa ogni 30 s quando è
  su WebRTC o Drive); la macchina vede il cambio dal campo `strada` delle
  risposte e lo annuncia.

# «Mi collego a NOME-PC…» (0.52.1, app 2.52.1)

Nicholas (07/10), dal telefono: «Ho cambiato pc e non si vede nessuna animazione e lo stato della connessione». Le tacche c'erano solo nel riquadro remoto; al cambio del computer in alto non c'era niente.

- **Funzione pura** `passiCollegamento(nome, eventi)`: dagli eventi `provo`, `fallita`, `salta`, `riuscita` e `fallito` ricava i quattro passi nell'ordine rete di casa, Tailscale, WebRTC / ponte e Drive. Dà anche il titolo («Mi collego a…», «Collegato a…», «Non riesco a collegarmi a…») e la riga sotto.
  - **Copie:** `Tentativi.passi` (app) e la pagina servita; `tests/shared/tentativi.test.ts` confronta la pagina con l'originale, `TentativiTest.kt` ripete gli scenari.
- **Chi vede le strade singole e chi no:**
  - l'**app**, al cambio di postazione (`LaunchedEffect(indirizzo, giroTent)` in `App.kt`), prova davvero l'indirizzo scelto e gli altri indirizzi salvati con lo stesso nome e una chiave. Li raggruppa con `Linea.stradaDiIndirizzo` (solo intervalli standard) e chiama `ciao()` con un tetto di 5 s. Se risponde un altro indirizzo ci passa; WebRTC e Drive dal telefono diretto sono «saltate», con il perché;
  - il **riquadro remoto del PC**, il **ponte del telefono** e la **pagina** non vedono le strade singole: gli eventi si ricavano dalla macchina con `eventiDaLinea` / `Tentativi.daLinea`. Il primo tentativo è la rete di casa; `collegando` vuol dire che casa e Tailscale sono fallite e si apre WebRTC; il primo `collegato` / `tornato` dà la strada buona.
- **A linea caduta:** `rovescia(l, adesso)` restituisce «riprovo fra N s», ambra fino al 2° tentativo e rosso dopo. Lo usano l'indicatore del PC, l'app e la pagina.
- Il ciclo di lettura dell'app ora segue `Linea.eOra`: a linea su ogni 2 s, giù con le attese crescenti. È quello che conta il conto alla rovescia.
- **Impostazioni → Info** nell'app: `BuildConfig.VERSION_NAME` e `VERSION_CODE`.

# Difetto della 2.52.1: «prova a collegarsi a quello già collegato» (corretto nella 0.52.2, app 2.52.2)

Nicholas (07/10): «Io seleziono un altro pc e il programma va sempre in errore e mi dice che sta provando a connettersi a quello che è già connesso».

**Cause, nel codice dell'app:**
1. **Stato vecchio.** In `Principale` sono `remember {}` **senza chiave sull'indirizzo** `stato`, `connesso`, `giriFalliti` e `rifiuti`. Al cambio di postazione:
   - `stato` restava quello del PC di prima finché il nuovo non rispondeva;
   - il nome in alto (`stato?.computer?.nome` prima di tutto) e il titolo «Mi collego a …» (stessa precedenza) dicevano il PC **già collegato**, con le sue chat sotto;
   - se il nuovo non rispondeva, si leggeva «Non riesco a collegarmi a <il PC di prima>».
2. **Indirizzi mischiati per nome.** La 2.52.1 provava anche «gli altri indirizzi salvati dello stesso computer», cercandoli per **nome** della postazione, che non è un'identità: poteva provare un'altra postazione e passarci da sola con `onVaiA`.
3. Inoltre `withTimeout` non interrompe una chiamata OkHttp bloccante in `withContext(IO)`: il tetto di 5 s vale solo quando la chiamata torna. È un limite, non la causa.

**Correzione:**
- `key(indirizzo) { Principale(…) }` in `App`: al cambio tutto lo stato e tutti i `LaunchedEffect` del PC di prima se ne vanno, così il collegamento precedente si stacca.
- **Funzione pura `Selezione`** (`Selezione.kt`, `SelezioneTest.kt`):
  - il tocco sul PC già scelto non fa niente (`Niente`);
  - ogni tocco nuovo porta un `gen`, e gli esiti con un `gen` vecchio non contano;
  - `indirizziDi` restituisce **solo** l'indirizzo della postazione scelta;
  - un fallimento resta sul PC scelto e «Riprova» va verso lo stesso.
- Il nome nell'animazione viene dalla postazione scelta.
- Il ripiego per nome è tolto.
- Sul PC, `RiquadroRemoto` ha `key` uguale a pcId|sessione: se un riquadro passa a un altro PC riparte da zero.
- Il ponte (scheda Computer → altri PC) era già a posto: `ChatSuAltroPc` e la fascia sono chiavati su `su.pcId` e usano `su.nome`.

# Da fare

- Prova dal vivo con Nicholas: staccare il wifi del portatile con un riquadro
  remoto aperto, scrivere, riattaccare (deve arrivare una volta sola).
