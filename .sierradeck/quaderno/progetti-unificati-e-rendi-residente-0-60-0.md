---
titolo: "0.60.0: stesso nome = stesso progetto, «Rendi residente» con analisi e unione, chat senza nome nascoste (e la causa del «porta qui» sbagliato del 10/10)"
quando: 2026-10-11T01:45:00+02:00
tag: ["progetti", "drive", "residente", "unione", "una-casa", "allinea", "chat senza nome", "decisione di Nicholas", "0.60"]
---

# La causa di «Rendi residente ha ancora problemi» (registro del 10/10, 22:48–22:50 UTC)

**Righe del registro:**
- `[allinea] da portare qui «Wdeck»`, poi `PORTA QUI «Wdeck»: 32 voci da scaricare`;
- `[allinea] da portare qui «SierraDeck», «Wdeck»`, poi `PORTA QUI «SierraDeck»: 661 voci`;
- entrambi `non riuscito — LAVORO_IN_CORSO: sul Drive sta già girando «Salvo sul Drive»`.

**Cosa c'era nel registro dei progetti (`progetti-drive.json`):** 61 voci, molte con lo stesso nome.
- «Wdeck» quattro volte: tre con la stessa cartella di questo PC, una solo con quella del portatile.
- «SierraDeck» registrato **solo** con la cartella del portatile.
- Doppioni anche di «Home assistant» / «HomeAssistant», «Downloads-MORSETTO», «GLOS» e altri.

**Causa.** Nicholas ha reso residente questo PC sull'id che aveva solo la cartella del portatile.
- `pianoAllineamento` ragionava per **id**: quell'id qui non aveva cartella, quindi «porta qui» automatico.
- Il download sarebbe andato in `cartella dei progetti/<nome>`, una cartella **nuova accanto** a quella vera: per SierraDeck, 661 file accanto al repository su cui si lavora.
- Si è fermato solo perché un salvataggio sul Drive era in corso. Poi `portatiQui` lo segnava come «già provato» e non ripartiva più: due difetti in uno.

**Da dove vengono i doppioni.** Ogni PC che mette o adotta una cartella crea un id nuovo. `fondiRegistri` unisce per id, e per origine solo nelle adozioni contemporanee. In più `radiciLocali` faceva salire la stessa cartella una volta per id (tre volte per «Wdeck»).

# Le regole nuove

**Stesso nome = stesso progetto** (`src/shared/progetti-unificati.ts`).
- `nomeNormalizzato`: maiuscole, spazi, `_ - .`, accenti e suffissi «(2)», «[3]», «- copia» non contano. «Game2» resta diverso da «Game»: un numero attaccato fa parte del nome.
- `raggruppaProgetti`: un gruppo per nome. Il principale è quello in cui altri sono uniti, poi quello con la scelta di Nicholas più recente, poi il più vecchio. Il nome da mostrare è quello senza suffisso.
- `gruppoDiCartella`: prima le cartelle registrate (la più profonda, su qualunque PC), poi il nome della cartella o di una che la contiene. Così il SierraDeck di questo PC, mai registrato qui, è «SierraDeck».
- Gli id restano: i file sul Drive stanno sotto `progetto-<id>`. Si unisce la vista; il registro si unisce solo con la conferma di Nicholas (`unitoIn` + `unitoIl`, vince il più recente fra i PC; `unitoIn: ''` = separato di nuovo).
- `radiciLocali`: una cartella sale una volta sola (sotto l'id più vecchio), un id unito non sale più. Una radice tolta non cancella niente dal Drive (`salvaIncrementale` cancella solo sotto prefissi che qui esistono).

**Il piano** (`pianoAllineamento`, per gruppo):
- il progetto è qui se c'è la cartella di **uno qualunque** dei suoi id;
- una cartella di qui con lo stesso nome (`trovate`) ferma l'automatico: «la unisce Unisci qui le copie»;
- `daRiprovare`: un «porta qui» fermato da `LAVORO_IN_CORSO` si riprova al giro dopo.

**Una casa sola** (`armonizzaCase`, a ogni giro in `allineaQui`).
- La scelta di Nicholas per il progetto vale per le chat del gruppo decise dalla regola o dalla nascita, senza casa, o con una scelta di Nicholas più vecchia. Una scelta fatta dopo per una chat sola resta.
- In `decidiCasa`, la regola «la cartella c'è solo su quel PC» non decide più se un altro PC ha una cartella con lo stesso nome (`stessoNome` negli indizi): era il caso di MT5 con le due «Trading».

# «Rendi residente qui» con analisi e unione

Regole in `src/shared/residenza.ts`; disco, Drive, chat e workspace in `src/main/residenza.ts`.

**Avvio.** `residente-qui` da `/api/drive/azione` o `casa:azione` parte in sottofondo: impronte di tutti i file e scaricamenti possono durare minuti. Pannello, pagina e app si rileggono finché la fase è `analisi` o `unisco`.

**Analisi (non tocca niente).**
1. Candidate: le cartelle registrate qui per ogni id del gruppo, più tutte quelle con lo stesso nome trovate dalle chat di qui (`cartelleTrovateQui(…, anche)`). La prova dal vero ha mostrato che senza `anche` una cartella accanto a una registrata restava fuori.
2. Resta (`scegliDestinazione`) quella con la chat più recente, poi una registrata, poi la più piena. Nessuna: si crea `cartella dei progetti/<nome>`.
3. Copie sul Drive: i file `progetto-<id>/…` degli id **senza** una cartella qui, confrontati con l'impronta del manifesto, senza scaricarli. Quelli di un id con cartella qui sono il salvataggio di quella cartella e non contano due volte.
4. `pianoUnione`, per ogni file:
   - uguale (anche spostato) → niente;
   - manca → si aggiunge;
   - più recente → sostituisce, e il vecchio va in `recuperati/…/prima-dell-unione/`;
   - più vecchio o diverso → in `recuperati/…/cartella-<nome>/` o `drive-<id>/`;
   - in una cartella con `.git` la destinazione **non si tocca**: il più recente va nei recuperati;
   - `.git` e `node_modules` non si uniscono mai file per file.
5. Workspace con lo stesso nome: resta quello aperto in una finestra o quello col nome esatto; quelli aperti in una finestra non si toccano, e il riassunto lo dice.

**Conferma.** Nell'ordine, ognuno con `[residente]` nel registro:
1. file;
2. trascrizioni delle chat delle cartelle doppie sotto la cartella che resta (la vecchia va in `.sierradeck/trascrizioni-spostate` della doppia; tiene la più lunga);
3. workspace fusi con `aggiungiPaneA`, cartelle dei riquadri rimappate, lapide sul Drive per i doppi;
4. registro: il principale prende la cartella e il nome pulito, gli altri `unitoIn`;
5. casa di tutte le chat e dei `progetto:<id>` su questo PC (`ospite.scegli`);
6. cartelle doppie nella cartella di recupero (`spostaCartellaInRecupero`, la stessa di «Rendi solo cloud», 30 giorni, «Ripristina»). Quelle in uso restano, e si dice.

**Annulla l'unione** (`<dati>/unioni/<id>.json`, 30 giorni) rimette:
- le cartelle dalla cartella di recupero;
- i file sostituiti; gli aggiunti escono e vanno in `recuperati/annullato-…`, non si cancellano;
- le trascrizioni, i workspace com'erano e il registro (con `unitoIl` nuovo, così vince sugli altri PC).

La casa delle chat **non** torna indietro: si sceglie di nuovo.

**Da un altro PC.** Scegliere come residente un altro PC dal menu resta il cambio di casa veloce, e il testo dice che le copie si uniscono con «Rendi residente qui» su quel PC (anche dal telefono, scegliendo quel PC).

# Chat senza nome

- `eSenzaNome`: nessun titolo di Claude, nessuna domanda, nessuna etichetta. I titoli di ripiego («chat 1a2b3c4d», l'id, «senza titolo») contano come nessun titolo.
- Fuori da «Riprendi» del PC (`ModaleSessioni`), da `/api/sessioni` (che dice `nascoste`; `{ senzaNome: true }` le rimette) e dalla vista chat del pannello. Una casella le mostra.
- Non si cancellano. Restano contate nel loro progetto (`chatSenzaNome`): la chat si attacca al gruppo anche per nome di cartella.

# Prove

- **Test:**
  - `tests/shared/progetti-unificati.test.ts`, con il caso esatto del registro: Wdeck e SierraDeck niente più «porta qui» accanto;
  - `tests/shared/residenza.test.ts`;
  - `tests/main/residenza.test.ts`: giro intero su cartelle temporanee, annullamento compreso;
  - `tests/main/client-rotte.test.ts` (sessioni);
  - fixture `pannello-0.60.json` per `ProgettiUnificatiTest.kt`.
- **Dal vero (11/10)** nella copia `SIERRADECK_PROVA` (porte 47650/47651; il programma vero sulla 47630 non toccato), con progetti **finti**: «Sito» non registrato e «sito (2)» registrato, un secondo id di un PC finto, tre chat finte (una senza nome) e due workspace.
  - Pannello: un progetto «Sito», 2 id, 2 workspace, la chat senza nome nascosta e contata.
  - Riassunto corretto, conferma, unione verificata sul disco, poi «Annulla l'unione»: tutto com'era.
  - La prova ha scoperto due difetti, corretti con un test: la cartella accanto a una registrata e lo stato «Unito» rimasto dopo l'annullamento.
  - Copia fermata e cartelle cancellate.
- **Da fare con Nicholas:** sul PC vero, «Rendi residente qui» su «Wdeck» e «SierraDeck» si ferma al riassunto; si unisce solo se lui conferma. Il Drive collegato aggiunge le copie del portatile.
