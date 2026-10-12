---
titolo: "Progetti a piena pagina (0.69.0): stato in una parola, gruppi, dettaglio a destra"
quando: 2026-10-13T00:30:00+02:00
tag: ["progetti", "interfaccia", "0.69.0", "pagina", "app"]
---

Nicholas, 12/10: «rifai il menu Progetti!! non si capisce nulla. Sfrutta la larghezza della pagina e sistema tutto per bene».

## Cosa c'era che non andava (revisione UI/UX prima del codice)

- C'era una finestra stretta da 820 px con sei tasti e quattro sezioni prima dei progetti, che cominciavano a metà.
- Due file di filtri uguali (Chat/Progetti, Tutti/Sbagliati/…) senza etichetta.
- «residente» in verde su ogni riga: è una parola tecnica, non uno stato.
- Un tasto diverso per ogni riga, senza intestazione.
- Il dettaglio aperto quasi vuoto.
- «Salvataggio e arrivo» e «Il contenuto del Drive» comparivano due volte.

## Come è adesso

- **PC** (`src/renderer/components/VistaProgetti.tsx`; la vecchia `ModalePannelloDrive.tsx` è tolta):
  - vista a tutta finestra, con una tabella: Progetto · Dove vive · Copie · Chat (totali · al lavoro) · Spazio Drive · Stato;
  - in alto i gruppi con i conti (Su questo PC · Su altri PC · Da sistemare · Tutti; «Da sistemare» non compare quando è a zero), la ricerca e l'ordinamento cliccando le colonne;
  - clic su una riga: il dettaglio a destra (420 px; sotto i 1280 px si appoggia sopra la tabella, sotto i 960 px prende tutto).
  - Nel dettaglio, prima di tutto le **azioni sempre in vista**: Apri (piena), Lavora su questo PC, Togli da questo PC (rossa, con conferma e «Annulla» già scelto), ognuna con il suo «?».
  - Poi: da sistemare, spostamento, chat con il pallino blu se lavora e Apri / Guarda su PC, cartelle, spazio, storia.
  - Gli strumenti rari stanno in «Strumenti ▾». Tasti: ↑↓, Invio = Apri, «/» = cerca, Esc chiude prima il dettaglio, poi la ricerca, poi la vista.
- **Pagina e app**: un elenco con lo stato a destra; sotto, il motivo in ambra quando è «da sistemare», altrimenti dove vive · chat · spazio. Gruppi come chip, ricerca, ordine ⇅. Il tocco apre il dettaglio a tutto schermo con «‹ Progetti». Gli strumenti stanno in fondo.

## La regola dello stato (`src/shared/progetti-vista.ts`)

Vince la prima che vale:
1. **spostamento in corso** (blu): un trasloco che gira («passo N di 5»), «Rendi residente» in analisi o in unione, una rimozione in corso, oppure un «porta qui» automatico;
2. **da sistemare** (ambra, rosso per un PC sconosciuto): un trasloco fermo, una conferma che ti aspetta, o un problema. Il motivo in breve è quello del problema più grave, con «+N» se ce ne sono altri;
3. **al lavoro** (blu): almeno una chat con nome lavora adesso. Lo dicono i battiti (`aspetta: false`) e le chat di qui (`alLavoroQui`);
4. **a posto** (verde).

Il PC calcola `vista` su ogni riga (`conVista` in `pannelloCompleto`); la pagina e l'app la disegnano e basta. Da un PC più vecchio la ricavano al minimo (problemi = da sistemare).

## Trappole

- **Impronta della pagina.** `impronta()` in `client-pagina.ts` non guardava il pannello Progetti: la pagina restava su «Leggo…» o non apriva il dettaglio finché non cambiava altro. Ora ci sono `pdDati` e le scelte; c'è un test.
- **La ricerca della pagina** nasconde le righe senza ridisegnare (`data-pd-cerca`): il ridisegno salta mentre si scrive in un campo, e il cursore non si perde.
- **`coloreStato`** esiste già nell'app: nel pannello si chiama `coloreVista`.
- Le foto prima e dopo sono in `note/foto-0-69/` (fuori da git). Nessun emulatore su questo PC: l'app è provata solo con i test (`ProgettiVistaTest` sulla risposta vera di un PC 0.69).
