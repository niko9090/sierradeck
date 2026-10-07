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

# Da fare

- Prova dal vivo con Nicholas: staccare il wifi del portatile con un riquadro
  remoto aperto, scrivere, riattaccare (deve arrivare una volta sola).
