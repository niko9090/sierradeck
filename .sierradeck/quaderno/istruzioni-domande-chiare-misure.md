---
titolo: "Linguetta Istruzioni, domande in cinque parti, parte destra ridimensionabile (0.41.0)"
quando: 2026-10-02T15:00:00+02:00
tag: ["autopilota", "consegne", "domande", "interfaccia", "android", "pagina", "decisione-nicholas"]
---

# Le richieste (Nicholas, 02/10)

- «Quello che scrive l'autopilota in chat vorrei vederlo in un tab qui sotto, … visto che nella chat adesso vedo solo: Leggi ed esegui le istruzioni in .sierradeck/consegne/c-5.md».
- «Le domande che fa l'autopilota spesso non si capisce cosa stia chiedendo».
- «Permetti di modificare le dimensioni di visualizzazione di tutta la parte qui di destra».

Nota sulle versioni: era prevista come «tappa 0 = 0.40.0», ma la 0.40.0 (WebRTC) era già uscita. Le versioni seguono l'ordine di pubblicazione, quindi questa è la 0.41.0 e «una chat, una casa» sarà la 0.42.0.

# Istruzioni

- **Dove si salvano.** Il servizio autopilota le scrive in `istruzioni/<id>.json`, accanto ai file degli autopiloti (`src/autopilot-host/istruzioni.ts`).
  - Sono **fuori** dal file dell'autopilota: lo stato si riscrive a ogni ciclo partendo da una copia letta prima, e un campo lì dentro perderebbe le istruzioni scritte nel frattempo.
  - Il testo intero si salva **quando l'autopilota decide**, attraverso l'osservatore di `creaConsegne({ messa, confermata, persa })`. I file `.sierradeck/consegne/c-N.md` si puliscono dopo 7 giorni.
- **Il perché.** È l'ultima decisione annotata nei 3 minuti precedenti (`percheRecente`, nel wrapper `avviaLavoro` del server).
  - Primo compito e ripresa hanno un perché fisso, scritto in `nel-mosaico.ts`.
  - Il campo `perche` della `Consegna` non arriva nella chat.
- **Gli esiti:** in coda, consegnata, partita, non partita, persa.
  - «consegnata» quando il PC conferma la consegna; «persa» dopo i 5 tentativi della coda.
  - «partita» e «non partita» si leggono dai passi che il PC scrive nel registro (`consegna c-5: partita`, con `esitoDaPasso` in `log:info` del main), poi `POST /consegne/esito`.
  - Un esito non torna indietro, tranne «non partita» → «partita».
  - L'id `c-N` si ripete dopo un riavvio del servizio: l'esito va all'istruzione più recente con quell'id.
- **Le rotte:**
  - servizio: `GET /istruzioni?ap=`;
  - PC: IPC `autopilota:istruzioni`;
  - telefono: `POST /api/autopilota/istruzioni` e `POST /api/autopilota/correggi` (`{autopilota, istruzione, nota}`). La nota si compone sul PC con `notaCorreggi` e va nel dialogo.
- **Il Markdown:**
  - PC: `ResaMarkdown` del quaderno, esportato da `PannelloQuaderno.tsx`;
  - pagina: `mdSicuro`, che passa ogni riga da `esc()` e poi aggiunge solo tag nostri, senza regex (nel template della pagina le barre si perdono);
  - app: `righeMarkdown` e `inRigaMd` in `Istruzioni.kt`, solo stili Compose.

# Domande chiare

- **Le parti.** Sono in `src/shared/domanda-strutturata.ts`: `staFacendo`, `domanda` (una frase, con `?`, al massimo 400 caratteri), `perche`, `scelte` (almeno 2, ognuna con la sua `conseguenza`), `seNonRispondi`.
- **I prompt.** Supervisore, risposta autonoma e intervista usano tutti `REGOLE_DOMANDA` e `FORMA_DOMANDA`.
  - `"domanda"` è un oggetto. Una stringa sola si legge ancora, come «solo la domanda».
- **Il controllo.** `domandaControllata` funziona così:
  - se mancano parti, chiede **una** riscrittura nella sessione di chi l'ha scritta: il supervisore della chat, oppure la sessione dell'intervista;
  - tiene la versione migliore delle due;
  - se resta incompleta, la fa passare con un'avvertenza («⚠ Domanda incompleta…»), annotata nel diario.
- **Le domande scritte dal programma** sono complete per costruzione: `partiBloccato`, `partiNonMisurati`, `partiPubblica`.
  - Si riconoscono da `dalProgramma: true` sulla `Decisione`, e non si fanno riscrivere.
  - `partiPubblica` tiene le scelte «sì, pubblica» e «no, lascia così», così `eUnSi` continua a funzionare.
- **Dove viaggiano.** `DomandaAperta` porta `parti` e `avvertenza`, e il testo le contiene già tutte in ordine (`testoDomanda`).
  - Il PC le disegna sezione per sezione (`sezioniDomanda`), con le scelte come tasti.
  - Pagina, app e Telegram mostrano il testo, che è già ordinato.

# Parte destra ridimensionabile

- **Le regole pure** sono in `src/shared/misure-pannelli.ts` (`MISURE`, `limita`, `massimoColonna`, `larghezzaTrascinata`, `larghezzaEffettiva`, `divisioneTrascinata`, `passoFreccia`, `suggerimentoBarra`).
  - `MOSAICO_MINIMO_PX` = 520 vive qui; `colonne-laterali.ts` lo riesporta.
- **Le misure** stanno nelle preferenze:
  - `larghezzaDomande` e `larghezzaConsumi` in pixel;
  - `larghezzaAutopilota` in % del riquadro;
  - `divisioneAutopilota`, nuova: % della scheda che prende la chat con l'autopilota, da 20 a 80, predefinita 55.
- **Il comportamento.** Le colonne disegnano `larghezzaEffettiva`, che si restringe con la finestra senza toccare la misura salvata, più un `max-width` CSS come ultima difesa.
  - Tutte le barre hanno doppio clic (misura iniziale), frecce e `title` che spiega.
  - Le finestre pannello staccate si ridimensionano già da sole.

# Prove

- **vitest:** `tests/shared/istruzioni-autopilota.test.ts`, `domanda-strutturata.test.ts` e `misure-pannelli.test.ts`; aggiornati `domanda-della-chat` e `intervista`.
- **Kotlin:** `IstruzioniTest`.
