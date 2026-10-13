---
titolo: "Rapporto 0.71.0 per Nicholas: autopilota rifatto, Sposta su, Strumenti che funziona"
quando: 2026-10-13T14:30:00+02:00
tag: ["rapporto", "autopilota", "0.71.0", "per Nicholas"]
---

# In breve

La 0.71.0 (app 2.71.0) è **pubblicata e non installata**: la installi tu. È marcata Latest; ci sono l'installatore, latest.yml, l'APK firmato Ferrari Consulenze (firma verificata) e app-android.json.

1. **«Il tasto Strumenti non funziona»: corretto.** La causa vera: ogni clic vero (non simulato) dentro le schermate a tutta finestra della 0.70.0 le chiudeva. Ora ho provato con clic veri ogni menu, «⋯», «?» e linguetta: 88 su 89 sul PC e 26 su 26 nella pagina. I dettagli sono in `giro-dei-menu-clic-veri-0-71-0.md`.
2. **Le istruzioni dell'autopilota non si perdono più** quando una chat passa dal sottofondo a un riquadro (la c-14 del mattino). Lo stesso vale dopo un riavvio del servizio: la domanda aperta non si rifà più e le istruzioni in coda ripartono.
3. **«Sposta su ▾»** nel dettaglio dei Progetti: da qualsiasi PC a qualsiasi PC, con conferma e avanzamento su tutti i PC. C'è anche su pagina e app (`sposta-su-da-qualsiasi-pc-0-71-0.md`).
4. **Autopilota con agenti specializzati.**
   - Il coordinatore divide il lavoro fra Sviluppo, Interfaccia, Collaudo, Revisione e Rilascio.
   - Un ramo si unisce solo dopo l'ok della Revisione, e quell'ok lo controlla il programma.
   - Le domande sono chiare e arrivano una alla volta, con la scelta consigliata.
   - Il supervisore riceve i fatti verificati e le tue decisioni; c'è un antiloop.
   - I giri sono misurati e più corti.

# Cosa è cambiato, parte per parte

| Parte | Cosa fa adesso | Scheda |
|---|---|---|
| Piano | Rivisto da un agente esperto di sistemi multi-agente prima del codice | `piano-autopilota-0-71-0.md` |
| Agenti specializzati | 5 ruoli con istruzioni proprie; compiti con dipendenze; Revisione in sola lettura; un OK con i criteri rossi non vale; dopo 2 rifacimenti decidi tu; nessuno installa | `agenti-specializzati-0-71-0.md` |
| Più chat insieme | Coda e domande su disco; una fermata, una risposta; tre chat insieme provate | `piu-chat-nessun-ordine-perso-0-71-0.md` |
| Domande chiare | Una alla volta, al massimo 200 caratteri, consigliata segnata, le vaghe respinte, al massimo 6 all'ora, le risposte già date non si richiedono | `domande-chiare-e-supervisore-che-verifica-0-71-0.md` |
| Più intelligente | Fatti verificati (git, criteri, registro) prima di decidere; tue decisioni lette a ogni giro; antiloop; criteri ricontrollati ogni 10 minuti | stessa scheda |
| Più veloce | Criteri in cache sul codice, comandi lunghi a turni alterni, 2 in parallelo; tempi per fase nella scheda | `giri-piu-veloci-0-71-0.md` |

# I numeri: prima e dopo

**Prima** (sul tuo PC, 9–13/10, solo lettura):

| Fase | Mediana | Campioni |
|---|---|---|
| Fine turno → istruzione via consegna | 76 s | 24 |
| Fine turno → risposta dell'hook Stop | 155 s | 23 |
| Supervisore, da solo | 17 s | 88 |

Il resto erano i criteri rimisurati in fila a ogni fermata (npm test, gradle, gh…).

**Dopo** (prova dal vero nella copia, 27 giri misurati dal programma):

| Fase | Mediana |
|---|---|
| Giro intero (fermata → risposta) | 27,5 s (p90 45 s) |
| Supervisore | 26,5 s |
| Criteri | 0,2 s |
| Unione | 0,2 s |
| Giro della Revisione, giudicato dal programma senza supervisore | circa 1 s |

Il progetto di prova era piccolo: non aveva comandi lunghi, quindi qui la cache dei criteri non si vede. Il guadagno vero è sui progetti con npm test o gradle nei criteri, dove prima i criteri pesavano più di 100 s a giro: ora si rimisurano solo se il codice cambia, quelli lunghi ogni 3 turni. Il supervisore è un po' più lento di prima (26 s contro 17 s): adesso il quadro contiene anche i fatti verificati e le tue decisioni. Il numero che conta, fine turno → risposta, passa da 155 s a circa 30 s su questo progetto. Sui tuoi progetti veri lo leggi nella scheda dopo l'installazione («Tempi: …»).

# Prove fatte

- **Test.** Vitest, typecheck e gradle verdi. I test nuovi coprono:
  - le tre chat insieme;
  - il riavvio con la domanda aperta;
  - la coda su disco;
  - la Revisione (percorso completo, OK respinto, rifacimenti, divieti);
  - antiloop, memoria, domande chiare, criteri veloci, tempi;
  - «Sposta su», i menu e i «?» della pagina.
- **Clic veri nella copia di prova**: il giro di tutti i menu su PC e pagina, e «Sposta su ▾».
- **Autopilota di prova «SierraDeck-prova-ruoli»** (copia di prova, progetto git fuori dal repository di SierraDeck). Com'è andata:
  - il coordinatore ha diviso il lavoro in due compiti di Sviluppo, ognuno nel suo worktree e sul suo ramo;
  - le due chat hanno lavorato insieme e, finito il compito, i rami sono passati a due chat di Revisione;
  - una Revisione ha bloccato da sola un comando che scriveva (divieto di ruolo);
  - una Revisione ha rimandato indietro un ramo: l'email vera nei commit e una scheda del quaderno doppia;
  - l'altra ha approvato citando i file;
  - il lavoro è stato rifatto e approvato, poi unito;
  - sul risultato unito i due test passano, e l'autopilota ha chiuso da solo con «finito».
- **Nessuna azione** sulle tue chat e sui tuoi autopiloti veri: lì ho solo letto i tempi.

# Difetti trovati dalla prova dal vero, e corretti

1. Due chat che chiudevano insieme: il ruolo «revisione» di uno dei due compiti si perdeva.
2. Dopo `chiudiChat` della propria chat, le chat appena aperte sparivano sotto un secondo salvataggio. Il difetto c'era già prima della 0.71.
3. **Un commit nel repository di SierraDeck con il messaggio dell'autopilota di prova** (`b13a377`). Il progetto di prova stava dentro `note/`; un worktree mancato ha fatto risalire git al repository di SierraDeck, e lì `salvaLavoro` ha committato il mio lavoro in corso.
   - Il contenuto è giusto: sono le mie modifiche di quel momento. Solo il messaggio è sbagliato.
   - Non ho riscritto la storia.
   - Adesso `salvaLavoro` committa solo su un ramo `ap/…`, e c'è il test.
4. **«'$GIT_DIR' too big».** Con l'id intero dell'autopilota nel nome, il percorso del worktree superava il limite di Windows: le chat finivano tutte nella cartella principale. Adesso il nome è corto (`ap-` più 8 cifre).
5. **La risposta automatica a una domanda della chat salvava la copia di prima.** Così cancellava le approvazioni, i giri e i rifacimenti scritti nel frattempo dalle altre chat. Il difetto c'era già prima della 0.71.
6. **Una chat aperta dal supervisore a metà lavoro nasceva senza ruolo.** Ora ha il suo ruolo.

# Punti aperti

1. **Prova di «Sposta su» via ponte fra due PC veri**, su un progetto «SierraDeck-prova-…», dopo che installi la 0.71.0.
2. **Una chat autrice già approvata che fa altri commit** viene unita alla fine senza una seconda revisione.
3. **Manca un lock per autopilota** su tutta la fermata. Due fermate insieme ora non perdono né ruoli né chat (provato), ma il resto si regge su `conservaCambiUtente`.
4. **La strada più veloce per i giri ovvi** non c'è ancora: per esempio un modello più leggero per il supervisore quando non c'è niente da decidere.
5. **«Strumenti ▾» e «⋯» della pagina** stanno solo dentro le sottoviste, e il giro automatico non ci entra.
6. **Da prima, ancora aperti**: mettere l'OAuth di Google «In produzione»; i progetti di prova da togliere dopo l'installazione.
