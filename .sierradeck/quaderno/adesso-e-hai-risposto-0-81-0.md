---
titolo: "Riquadro «Adesso» e «Hai risposto» (0.81.0)"
quando: 2026-10-20T11:30:00Z
tag: ["autopilota", "partecipe", "0.81.0", "pc", "pagina", "app"]
---

# Perché
Nicholas, 20/10: «non mi sento partecipe». c-14 e c-15 erano ferme da 844 min
mentre risultavano «al lavoro», e le sue risposte sparivano senza un esito.

# Come funziona
- **«Adesso»** è calcolato dai dati dell'autopilota (`src/shared/adesso.ts`,
  `adessoDi`), NON dalle schede delle finestre come «Al lavoro» della
  Panoramica: così vede anche le chat mai comparse in una finestra.
  Lo calcola il PC; la pagina (`/api/autopilota` → `adesso`) e l'app
  (`AutopilotaDettaglio.adesso`, `AdessoVista` in `Lavori.kt`) mostrano le
  righe come sono. I colori seguono `COLORE_ADESSO` / `coloreAdesso`.
- **Da quanto**: ogni chat ha `dal`, timbrato in `salva()` del servizio con
  `conStatiDatati` (nuova chat o stato cambiato → adesso). Le chat nate prima
  della 0.81.0 non hanno `dal`: niente durata, non si inventa.
- **Ferma**: messa da parte (0.80.1), nessun segno da 5 min (`segniChat`,
  aggiunto in memoria da `GET /autopiloti`, non salvato), mai partita
  (cicli 0, nessun segno, aperta da ≥5 min), autopilota non in lavoro.
- **Soglie a 5 min, non 15/10 (c-16, 20/10).** Devono essere uguali alla riga che
  la conversazione scrive a Nicholas (`SILENZIO_DA_DIRE_MS`, c-10). Nella prova
  del 20/10 con 15 min la stessa chat era «non dà segnali da 5 minuti» nella
  conversazione e verde «al lavoro da 11 min» in «Adesso» per dieci minuti.
  Chi cambia una delle due soglie cambia anche l'altra (test «PROVA DEL 20/10»
  in `tests/shared/partecipe.test.ts`).
- **«Hai risposto: …»**: `conversazione()` in `chat-autopilota.ts`; sotto,
  `esitoRisposta` cerca nelle decisioni da 5 s prima a 30 min dopo la risposta
  (pubblica / non pubblica / «risposta tardiva (c-N): …» → chi l'ha ricevuta).
  Se non trova niente lo dice («Ricevuta: la porto alla chat…»), non tace.

- **Muta senza segni**: i segni stanno solo in memoria nel servizio. Il servizio
  manda `segniDal` (il suo avvio): senza segni una chat è muta da
  max(`segniDal`, `dal`), e nei primi 5 min dopo un riavvio non si giudica.
- **Nella Panoramica** le righe stanno nella sezione «Adesso» del centro (che
  prima guardava solo le finestre e diceva «Nessuna chat al lavoro» mentre c-14
  era ferma): tutte se nessuna finestra lavora, solo le ferme sotto le schede.
  Nella conversazione della Panoramica il riquadro non si ripete.

# Prova nella copia (20/10)
Autopilota finto con flotta (c-14 cicli 0 aperta da 14 h, c-3 al lavoro, c-5
finita) in `dati/SierraDeck/autopiloti/`, con `workspace: "Predefinito"` per
vederlo nella Panoramica. Visto dal vero su PC e pagina: dopo 10 min dal riavvio
c-14 «non è ancora partita», dopo 15 min c-3 «nessun segno da 15 min».

# Trappole
- Il servizio scrive «risposta tardiva (c-3): …» con la chat fra parentesi:
  il diario riconosce con `startsWith('risposta tardiva')`.
- Copia di prova: un autopilota **senza criteri** viene sospeso subito dal
  servizio; dagliene uno. La «×» della finestra la nasconde: da nascosta
  `Page.captureScreenshot` resta appeso e un `location.reload()` non riparte
  (radice vuota). Rimetterla su con `ShowWindow`, o riavviare la copia.
- Divisione del lavoro 20/10: c-13 nessuna domanda ripetuta e solo italiano,
  c-10 righe brevi sugli eventi e avviso entro 5 min per chat mai partita.

# 0.83.0: anche le risposte scritte a mano (c-52, 21/10)
Prima «Hai risposto» compariva solo per «Vai» e per le domande del registro
(`/api/rispondi`). Scritto nella casella, anche a «gli dai il via?», era un
messaggio qualunque e la domanda spariva. Ora `/autopiloti/:id/dialogo`:
- **domanda del registro aperta** (la piu' vecchia, non in intervista): il testo
  e' la sua risposta, con `rispondiAllaDomanda` (la stessa funzione di
  `/domande/:id/risposta`); niente supervisore;
- **sua ultima battuta con «?», o stato `pronto`**: la battuta `tu` porta
  `risponde` con la domanda intera (`domandaInSospeso`), **senza** `traccia`,
  cosi' il supervisore la elabora e «sta pensando» resta vero;
- `conversazione()` mette la domanda sopra (se non e' gia' la battuta prima) e
  «Hai risposto: …» sotto. PC, pagina e app ricevono la stessa conversazione.
Test: `tests/autopilot-host/hai-risposto-a-mano-0-83-0.test.ts`.
Trappole: `ScambioDialogo` passa da `parseScambio` (un campo nuovo va letto
anche li', o sparisce alla prima rilettura); il file su disco ha `versione`, per
provare la rilettura usare l'archivio vero, non `parseAutopilota` sull'oggetto.
