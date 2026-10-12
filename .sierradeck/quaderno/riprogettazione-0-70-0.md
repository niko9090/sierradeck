---
titolo: "Riprogettazione 0.70.0: il progetto di ogni schermata (revisioni UI/UX)"
quando: 2026-10-13T01:30:00+02:00
tag: ["0.70.0", "interfaccia", "riprogettazione"]
---

Nicholas, 13/10 di notte: «migliora tutto il programma riprogettando per bene come hai fatto per i progetti». Prima del codice, tre agenti UI/UX hanno rivisto le dieci schermate dalle foto «prima» (`note/foto-0-70/prima-*.png`, fuori da git perché mostrano percorsi della macchina). Qui c'è cosa hanno deciso, schermata per schermata.

## Regole comuni
- **Stato** = `{ id, parola, colore, ragione? }`, con i colori verde, ambra, rosso, blu e «quieto» (grigio). Il tipo sta in `src/shared/stato-vista.ts`.
- **Lo calcola il PC**; la pagina e l'app lo disegnano soltanto.
- Testi corti, la spiegazione dietro il «?». Le cose rare vanno in «Strumenti ▾». **Nessuna funzione tolta: si sposta.**

## (a) Schermata principale
- Testata del riquadro: pallino + nome + **stato in una parola** (aspetta te › errore › al lavoro › autopilota › ferma › dorme) + ⏸ ⋯ ×. Nel «⋯» con il testo: Sposta in…, Dove vive (ospite), PIN, Rinomina.
- Nomi uguali nello stesso workspace: «Nome #2», solo da mostrare.
- **Linguette dei workspace con il loro stato peggiore**, un pallino e un numero.
- La spia dell'aggiornamento è una parola: nuova, pronta, errore. Niente striscia.
- **Modello e cose rare in «Strumenti ▾»**: Riprendi, usate da altri PC, modello, workspace, nuova finestra, negozio.
- Rischio: non toccare la logica di xterm e del fit; la testata resta della stessa altezza.

## (b) Autopiloti
- Vista a tutta pagina, con una tabella: Autopilota · Dove · Chat · Criteri (0/1) · Ultima azione · Da · Stato.
- **Stato**: guasto (rosso, vince su «al lavoro») › aspetta te › senza segni › al lavoro › pronto › fermo › finito.
- In riga un solo verbo, secondo lo stato: Rispondi, Riprendi o Ferma. Il resto nel «⋯»; «Togli» è rosso e chiede conferma.
- Un PC che non risponde è una riga sola: «non risponde», con il «?».

## (c) Domande
- **Filtro predefinito «Aspettano te»**; le chat che hanno finito il turno si vedono solo in «Tutte».
- **Tipi**: permesso (rosso) › scelta › domanda (ambra) › autopilota (blu) › finito.
- Nella domanda aperta: la riga della domanda, poi le opzioni grandi (tasti 1–9), poi il testo libero. Lo «schermo» e le risposte di prima stanno chiusi.

## (d) Salute e Altri computer
- **Una sola regola per lo stato di un PC** (`statoComputer`): acceso, lento (solo Drive), indietro, spento, isolato, installa. Prima tre fonti si contraddicevano.
- **Gruppi**: Da sistemare · Computer · Drive · Errori · Tutto.
- **Tabella dei computer** con strada, versione, ultimo segno, chat, CPU, RAM, Drive al minuto.
- La mappa va in «Strumenti ▾».

## (e) Impostazioni
- Navigazione a sinistra con lo stato di ogni sezione, e in cima quattro riquadri: Versione · Drive · Cassaforte · Telefoni.
- **«Torna ai valori di fabbrica» va in «Strumenti ▾»**.
- Porte e «fuori dalla rete» stanno sotto «Avanzate ▸».

## (f) File
- Con un solo lato, a tutta larghezza.
- **Colonna «Stato» del confronto**: uguale, nuovo, vecchio, diverso, solo.
- Una barra della coda in fondo che unisce server e telefono.
- Le azioni rare vanno in «Strumenti ▾».

## (g) Negozio
- **Gruppi**: In uso · Da sistemare · Catalogo · Questa cartella.
- **Parola**: Guasto › Approva › Accedi › Aggiorna › In corso › Attivo › Spento › Disponibile.
- **Dettaglio a destra con le azioni**; niente tasti ripetuti su 3.000 righe.
- In «Strumenti ▾»: Fonti, Ricarica, nuova skill, nuovo MCP.

## (h) Consumi
- In cima «5 ore» e «Settimana», ognuna con %, una parola (Libero <80, Attento <95, Pieno; Vecchia, Attesa) e «si azzera fra…».
- Le chat con il contesto: Libera <70, Piena <90, Riassumi.
- **Corretto il testo «0 in entrata0 in uscita» attaccato.**

## (i) Quaderno
- Tre colonne: progetti con il conto delle schede · elenco con ricerca, tag e ordine · scheda letta.
- **Il quaderno personale è anche qui («🔒 Personale»)**, con lo stato Protetta o Condivisa.

## (j) Account e Drive
- **Catena di quattro riquadri**: Account → Drive → Cassaforte → Salvataggio. Il Drive dice anche «Scade», per il limite dei 7 giorni.
- **Un tasto «Prossimo passo»** dice cosa fare dopo.
- In «Strumenti ▾» le azioni rare: cambia passphrase, blocca, cambia Drive, Fondi, Ripristina, Scollega, Esci.

L'esito, schermata per schermata (le foto dopo, le azioni di prima e dove sono finite), sta nel rapporto `rapporto-notte-0-70-0.md`.
