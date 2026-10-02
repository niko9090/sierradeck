---
titolo: "Domande mai tagliate; per gli autopiloti la linguetta, non la colonna (0.39.1)"
quando: 2026-10-02T12:00:00+02:00
tag: ["domande", "autopilota", "colonna", "linguetta", "finestra-pannello", "telefono", "android", "decisione-nicholas"]
---

# La segnalazione (Nicholas, 02/10)

«le domande sono tutte tagliate e quando c'è l'autopilota non deve aprirsi la parte domande a destra ma visualizzarsi nel tab domande sotto ma la devo vedere tutta la domanda»

# 1. Il taglio: la causa (trovata sui dati veri)

- Negli autopiloti veri (`%APPDATA%/SierraDeck/autopiloti/*.json`) gli `obiettivo` sono lunghi **815 e 1015 caratteri**.
- Il servizio (`src/autopilot-host/server.ts`) componeva la domanda con `domandaChiara()`, nell'ordine: chi chiede, **l'obiettivo intero**, la domanda. Poi la tagliava con `.slice(0, MOTIVO_MAX)`, cioè 500 caratteri.
  - Il taglio finiva **prima** della domanda: nelle Domande arrivava mezzo obiettivo e nessuna domanda.
  - Vale per `chiediUtente` (lo Stop) e per la domanda che nasce dalla notifica.
- Anche `motivoSospensione` era tagliato a 500. Da lì il servizio riapre la domanda della preparazione dopo un riavvio (`riapriDomandaIntervista`), quindi anche quella tornava a metà.
- La grafica del PC era già a posto (`.domande-ap__testo` pre-wrap, pannello che scorre). La pagina, invece, nella schermata «TI STA CHIEDENDO» usava `.grande` senza pre-wrap, quindi gli a capo si perdevano.
- Le chat (non autopiloti) ferme su una scelta: `contestoScelta` teneva solo **8 righe** sopra le opzioni, e la coda di schermo (`CODA_RIGHE` in `ultime-righe.ts`) era di 14.

# Cosa è cambiato

- **Servizio**:
  - niente più `.slice` sul testo delle domande né su `motivoSospensione` delle domande;
  - `domandaChiara` mette ora la **domanda prima** dell'obiettivo.
- **Trappola collegata**, `domandaGemella` (T5, chat sorelle di una flotta): confrontava i testi con la cornice. L'obiettivo, uguale per tutte, faceva sembrare gemelle due domande diverse; tagliate a 500, erano addirittura identiche. Ora confronta la domanda grezza (`contesto.grezza`).
- **Chat**:
  - `contestoScelta` risale dalla «1.» fino al bordo del riquadro (una riga di sola cornice, almeno 10 tratti) e tiene **tutto**;
  - `CODA_RIGHE` passa a 60;
  - `ultimeRighe` (chat che ha solo finito il turno) tiene 20 righe: è uno sguardo, non una domanda.
- **Pagina**: `.domanda-ap` ha pre-wrap, overflow-wrap e `max-height: 60vh` con scorrimento, nelle due viste della domanda.
- **App Android 2.43.1**: la linguetta Domande può crescere fino a 420 dp (prima 260), poi scorre (`altezzaLinguetta`).
- **Regola**: i titoli brevi (nome della chat o dell'autopilota) possono restare con i puntini; il testo della domanda no.

# 2. Autopilota: la linguetta, non la colonna

- `decidiColonnaDomande` (`src/shared/domande-conversazioni.ts`):
  - la colonna si apre da sola (`apri`) **solo per le chat**;
  - per gli autopiloti restituisce `linguette` (gli id): le domande nuove e, all'avvio, tutte quelle in attesa, anche già viste. Così nessuna domanda resta invisibile.
- `azioneTastoDomande`: se ad aspettare sono **solo** autopiloti, il tasto «Domande» porta alla linguetta del primo. Il numerino conta sempre tutto (`quanteAspettano`).
- **Dove si mostra** lo decide il main, perché le finestre di chat sono più d'una e ognuna sonda `/api/domande`. La regola è `doveMostrareDomande` in `src/shared/finestra-pannello.ts`:
  1. linguetta staccata → `portaAvantiPannello`;
  2. una finestra di chat ha la scheda → `domande:mostra` a quella finestra;
  3. nessuna delle due → `apriPannello(id, 'domande', { inattiva })`.
- **Chi ha la scheda**: ogni `DiarioAutopilota` si segna con `segnaSchedaInVista` (`src/renderer/schede-in-vista.ts`), che manda `pannello:inVista` al main.
- **Automatico ≠ clic**:
  - quando la domanda arriva da sola, niente fuoco rubato: `showInactive` + `moveTop` + `flashFrame`;
  - il main la fa una volta sola ogni 10 s per autopilota (tutte le finestre la chiedono insieme), e aspetta 3 s perché all'avvio le schede si segnano dopo la prima lettura delle domande.
- `DiarioAutopilota`: una domanda nuova fa `setAperto(true)`, quindi la scheda si apre anche se era ridotta alla striscia.
- `apriDomandeAutopilota` (colonna, rimando) ora passa dal main. Prima, senza la scheda in quella finestra, apriva il pannello degli autopiloti, dove la domanda non c'era.

# Test

- `tests/main/domande-intere.test.ts`:
  - una domanda di 3000 caratteri su 30 righe, con un obiettivo di oltre 800, passa dal servizio vero a `/api/domande` e a `/api/autopilota` uguale carattere per carattere;
  - controlli che il servizio non tagli più e che il CSS non tronchi (PC, colonna, pagina).
- `tests/shared/domande-dove.test.ts`:
  - domanda di un autopilota → colonna non aperta, linguetta;
  - domanda di una chat → colonna aperta;
  - avvio, tasto, `doveMostrareDomande`.
- `tests/shared/domande-telefono.test.ts`: domanda di 40 righe intera, bordo del riquadro.
- Kotlin, `DomandeIntereTest`: 3000 caratteri multi-riga intatti in `AutopilotaDettaglio.domandeScheda`, `Domande.voci` e `conversazioni`.

# Limite noto

Per una chat che ha solo finito il turno (non una domanda), dal telefono si vedono le ultime 20 righe dello schermo, non tutto il messaggio. Per il messaggio intero servirebbe leggerlo dalla trascrizione (`anteprima`).
