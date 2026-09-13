---
titolo: "Il dialogo con l'autopilota fuori dalla chat (0.27.0): com'è fatto, dove passano i messaggi, cosa non fa"
quando: 2026-09-14T03:30:00+02:00
tag: ["autopilota", "dialogo", "supervisore", "telefono", "0.27.0"]
---

# Perché

Nicholas (2026-09-14): «quando uso gli autopiloti devo poter dialogare con
loro, non nella chat, perché è lui che deve portare a termine il compito».
Fino alla 0.26.0 la casella della scheda era `POST /autopiloti/:id/parla`
(`chiediCambio`): traduceva una frase in un cambio di obiettivo/criteri e
basta. Non rispondeva, e «fermati» diventava un cambio di criteri.

# Com'è fatto

- **Archivio** (`src/shared/autopilota.ts`): due campi nuovi sull'`Autopilota`,
  `dialogo: ScambioDialogo[]` (`{quando, da: 'tu'|'lui', testo, esito?}`,
  tetto `DIALOGO_RICORDATO` = 60) e `daConsegnare: MessaggioPerLaChat[]`
  (`{id, quando, testo, chats: string[]}`: le chiavi delle chat che devono
  ancora riceverlo). `parseAutopilota` li legge con default `[]`: i file di
  prima della 0.27.0 partono vuoti, **senza alzare `VERSIONE_AUTOPILOTA`**.
- **Modulo puro** `src/autopilot-host/dialogo.ts`: `componiPromptDialogo`
  (obiettivo, stato, criteri, compiti, ultime mosse, ultimo detto della chat
  via `deps.ultimoDetto`, domanda aperta, messaggi in coda, dialogo passato),
  `leggiEsitoDialogo` (ultimo JSON bilanciato: `{risposta, perLaChat?,
  cambio?, comando?: ferma|riprendi|rispondi}`; senza `risposta` è
  illeggibile), `conMessaggioPerLaChat`/`prendiMessaggiPer` (per chiave di
  chat: l'id della chat nella flotta, l'id dell'autopilota per la chat
  singola, come `chiaveTurno` in nel-mosaico), `preambolo`/`conPreambolo`.
- **Rotta** `POST /autopiloti/:id/dialogo {testo}` in `server.ts`: scrive la
  battuta `tu`, risponde **202 subito** `{ricevuto, autopilota}`, poi
  `rispondiAlDialogo` in background (una promessa in fila per autopilota,
  `dialoghiInCorso`): interroga il supervisore (`a.sessioneSupervisore`,
  come `chiediCambio`), rilegge l'archivio, applica nell'ordine cambio →
  perLaChat/rispondi → comando, scrive la battuta `lui` con `esito`
  («cambio applicato», «per la chat, a fine turno», «fermato», «ripreso»,
  «risposta alla sua domanda», «senza risposta», «nessun cambio»).
  **Perché asincrona**: il client del Gestore ha un tetto di 3 s per
  chiamata (`autopilot-client.ts`) e il telefono 15 s; il supervisore ci
  mette minuti. Per lo stesso motivo `parla` ora chiama con
  `ATTESA_PENSIERO_MS` (6 min): prima falliva sempre e il cambio veniva
  applicato lo stesso.
- **Consegna al momento giusto**: in `suStop`, dopo `conservaCambiUtente`,
  `tuoi(base)` prende i messaggi per quella chat solo nei rami che scrivono
  nella chat (`prosegui`, `correggiCriterio`, risposta a `chiediUtente`) e
  li mette davanti al `reason` con `conPreambolo`; il supervisore li riceve
  nel quadro (`componiPromptDecisione`, 5° parametro). Con `sospendi` restano
  in coda; con `finito` si tolgono e una decisione lo dice. Alla ripresa
  (`riprendiAutopilota`, usata da `/riprendi` e dal comando) entrano davanti
  a `ripartiDaDove`/`primoCompito`; in `suRispostaTardiva` davanti alla
  risposta. `conservaCambiUtente` porta `dialogo` e `daConsegnare` dal disco.
- **UI**: scheda PC (`SchedaAutopilota.tsx`, «Parla con lui», bolle tu/lui,
  «sta pensando» quando l'ultima battuta è tua, Ctrl+Invio, «Disfa» resta),
  diario (`diario-autopilota.ts`: «Gli hai scritto»/«Ti ha risposto»),
  pagina telefono (`client-pagina.ts`, `vistaAutopilota` + `dialogaAp`, rotta
  `POST /api/autopilota/dialogo`, 409 se il PC è vecchio), app Android
  (`Lavori.kt` + `Api.dialogaAutopilota` + `ScambioDialogo` in `Modelli.kt`).
  **`android/` è cambiato**: alla prossima release l'APK va ricompilato.

# Cosa NON fa

- Non scrive nella chat mentre lavora: il messaggio aspetta la fine del turno.
- Non risponde in tempo reale: la battuta `lui` compare quando il supervisore
  ha finito (la scheda si rilegge ogni 5 s sul PC, 2 s sul telefono).
- Non apre lavori nuovi né chiude chat senza un comando esplicito.
- Se scrivi nella chat governata funziona lo stesso (per la chat i messaggi
  sono uguali) ma il supervisore non lo vede come tuo e non resta nel dialogo.

# Trappole

- La pagina del telefono ridisegna solo se cambia `impronta()`: `apDettaglio`
  e `notaDialogo` (e tutto ciò che si legge apposta) **devono** starci, o la
  risposta non compare finché una chat non scrive qualcosa.
- Il test del server usa `prompt.includes('Ti scrive adesso')` per
  distinguere il prompt del dialogo da quello del turno: se si rinomina la
  sezione, aggiornare `tests/autopilot-host/dialogo.test.ts`.
