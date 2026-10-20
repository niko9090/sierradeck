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
- **Ferma**: messa da parte (0.80.1), nessun segno da 15 min (`segniChat`,
  aggiunto in memoria da `GET /autopiloti`, non salvato), mai partita
  (cicli 0, nessun segno, aperta da ≥10 min), autopilota non in lavoro.
- **«Hai risposto: …»**: `conversazione()` in `chat-autopilota.ts`; sotto,
  `esitoRisposta` cerca nelle decisioni da 5 s prima a 30 min dopo la risposta
  (pubblica / non pubblica / «risposta tardiva (c-N): …» → chi l'ha ricevuta).
  Se non trova niente lo dice («Ricevuta: la porto alla chat…»), non tace.

- **Muta senza segni**: i segni stanno solo in memoria nel servizio. Il servizio
  manda `segniDal` (il suo avvio): senza segni una chat è muta da
  max(`segniDal`, `dal`), e nei primi 10 min dopo un riavvio non si giudica.
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
