---
titolo: "Aggiornare senza uccidere il lavoro in corso"
quando: 2026-08-30T21:00:00Z
tag: ["aggiornamenti", "autopilota", "chat", "cicli-di-vita", "telefono"]
---

# Un aggiornamento non è una chiusura per fine lavori

Requisito esplicito di Nicholas. Prima della **0.12.42**, premere «Installa»
chiudeva il PTY host e con lui ogni `claude.exe` dovunque fosse arrivato: a
metà di una risposta, di una compilazione, di una pubblicazione.

Il danno vero non era il testo perduto — le trascrizioni sono su disco e si
riprendono — ma **l'azione lasciata a metà nel mondo**, che nessun riavvio
rimette a posto.

## Il punto d'appoggio è la fine del turno, non la fine del mandato

Distinzione che è costata un giro di ragionamento sbagliato: «il mandato è
finito» e «non c'è niente in volo» sono lontanissime. Un mandato dura ore, un
turno minuti. Aspettare il mandato vorrebbe dire non aggiornare mai proprio le
macchine che lavorano di più. Si aspetta il **turno**, che arriva di continuo.

## La sequenza, e perché è in quest'ordine

1. `POST /pausa-aggiornamento` al servizio: marca ogni autopilota `lavoro` con
   `fermatoPerAggiornamento`. **Prima** di avvisare le chat: avvisando per
   prime, una chat chiuderebbe il turno e l'autopilota le darebbe subito il
   compito dopo — si ricomincerebbe ad aspettare da capo, all'infinito.
2. Si scrive `AVVISO_PAUSA` dentro ogni chat che sta lavorando, **una volta
   sola**: «finisci quello che hai in mano, salva, annota dove sei arrivato,
   poi fermati». Annotare è la parte che il programma non può fare al posto
   suo.
3. Si aspetta la quiete **guardando** (`inVolo`: terminale acceso e non in
   attesa di te), non contando il tempo. Fase `attendo` con `chatOccupate`.
4. Si annota su disco chi era a metà (`pausa-aggiornamento.json`), poi si
   installa.
5. Al ritorno: gli autopiloti li riprende il servizio; alle chat non governate
   si scrive `AVVISO_RIPRESA` quando il loro riquadro si riannuncia.

Se la quiete non arriva entro `ATTESA_QUIETE_MS` (10 min) **non si installa** e
si disfa la pausa. Lasciare gli autopiloti fermi ad aspettare un riavvio che non
arriva è il peggiore dei due errori.

## Le trappole, tutte pagate almeno una volta in questo progetto

- **`fermatoPerAggiornamento` non è `sospeso`.** `daRiprendere` salta i sospesi
  di proposito, perché dietro c'è la decisione di qualcuno. Se la pausa li
  marcasse così, si sveglierebbero fermi per sempre. Per lo stesso motivo il
  guardiano del silenzio deve **saltarli**: tacciono perché gliel'abbiamo
  chiesto noi.
- **Scavalca `riprendiAlRiavvio: false`.** Quell'interruttore serve a non far
  resuscitare un autopilota dopo un riavvio del PC, non a lasciare per strada
  un lavoro che abbiamo interrotto noi.
- **Il segno si toglie quando si riparte, non prima**: altrimenti la fine del
  primo turno ripreso lo rimette a dormire.
- **L'elenco di chi era a metà va su disco.** In memoria muore con il processo,
  ed è proprio il processo che sta per morire. Ha una scadenza (6h): trovarlo
  tre giorni dopo e scrivere «riprendi» in chat che hanno fatto altro sarebbe
  peggio che tacere.
- **`viva` ≠ `aspetta`.** Un riquadro ibernato non aspetta te *e* non sta
  lavorando: senza distinguerli, ogni installazione resterebbe appesa a un
  terminale che non finirà mai niente perché non è mai cominciato.

## I due lati del telefono

Entrambi vanno aggiornati insieme, sempre — vedi [[app-android-nativa]].

- Pagina servita (`client-pagina.ts`): testo della fase `attendo` e tasto
  disabilitato «Aspetto le chat…».
- App Android: `Aggiornamento.chatOccupate` in `Modelli.kt`, la fase in
  `Computer.kt`, e — importante — in `App.kt` la schermata d'installazione va
  **disdetta** se lo stato torna `attendo` o `pronto` con errore. Il telefono
  segna l'installazione al tocco per non giocarsela a testa o croce contro un
  computer che sta chiudendo; adesso che l'installazione può non partire,
  resterebbe uno schermo che dice «sto installando» per dieci minuti.

## Cosa resta fuori portata

Un processo lasciato acceso in background da una chat (`npm run dev`) muore
comunque: per Claude quel turno è chiuso, e noi guardiamo i turni.
