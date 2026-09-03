---
titolo: "Aggiornare da qualunque versione: cosa si legge, cosa si copia, cosa si riprende"
quando: 2026-09-03T14:30:00+02:00
tag: ["aggiornamenti", "migrazione", "formati", "istantanee", "sync", "autopilota", "perdita-dati", "audit"]
---

# La richiesta (3 settembre 2026)

«Con il prossimo aggiornamento tutti devono essere allineati a prescindere
dalla versione di provenienza.» Dopo [[salvataggi-vecchi-svuotano-i-workspace]]
(un campo rinominato, un lettore che non guardava più il nome vecchio) la
domanda giusta era: **quanti altri ce ne sono?** È stato fatto un audit
sistematico della storia di git (219 commit, tutti i tag da v0.2.0 a
v0.12.49) di ogni file scritto nella cartella dei dati, confrontando **ogni
chiave mai scritta** con quello che il lettore di oggi accetta.

# Il risultato dell'audit

**Sani, da qualunque versione** (nessuna chiave mai rinominata senza ripiego,
nessun numero di versione mai alzato): `workspaces.json`, `impostazioni.json`,
`etichette.json`, `provider.json`, `dispositivi.json`, `chiavi.json`,
`destinazioni.json`, `negozio-scope.json`, `accesso-supabase.json`, i gettoni
Google, `cassaforte.json`, `sync-stato.json`, gli autopiloti
(`autopiloti/*.json`, schema solo cresciuto), `pausa-aggiornamento.json`, il
quaderno.

**Buchi trovati e chiusi nella 0.12.50:**

1. **Backup Drive a blocco unico (0.9.50 → 0.9.64) invisibile.** Dalla 0.9.65
   la sync è incrementale (manifesto + un blob per file); `ripristina()`
   cercava solo il manifesto e, non trovandolo, diceva «niente sul Drive» con
   il backup intatto a un metro. Ora, senza manifesto, prova il blocco vecchio
   (`sierradeck.cassaforte`) con `applicaBlocco`; il salvataggio dopo lo
   riscrive nella forma nuova. È l'unico buco che perdeva **dati** veri.
2. **Pausa per aggiornamento cancellata a metà turno.** `conservaCambiUtente`
   riportava dal disco solo obiettivo/compiti/criteri/chat/cicli/decisioni:
   `fermatoPerAggiornamento` scritto da `POST /pausa-aggiornamento` durante un
   turno lungo veniva riscritto con la fotografia di inizio turno. Proprio la
   chat a cui la pausa serviva riceveva il compito dopo e veniva uccisa a metà
   azione. Ora dal disco anche `fermatoPerAggiornamento`, `riprendiAlRiavvio`,
   `tettoChat`, `limiti` — **tutto ciò che scrive qualcun altro durante il turno**.
3. **Pausa rimasta appesa** se l'app moriva fra la pausa e l'installazione: il
   servizio sopravvive al Gestore e l'unica cosa che toglieva il segno era la
   sua ripartenza. Ora `POST /gestore-avviato` toglie il segno a tutti.
4. **Domande degli autopiloti perse al riavvio del servizio.** Vivono in
   memoria (`domande.ts`); un autopilota in `attesa` restava fermo per sempre,
   saltato apposta da `daRiprendere` e dal guardiano. Ora
   `riprendiLavori({ servizioAppenaPartito: true })` rimette al lavoro chi era
   in attesa (`riportaChiAspettava`, con una riga nel diario): il turno dopo
   rifà la domanda.
5. **`finestre.json` di prima della 0.12.48 letto per posizione.** Era un
   ricordo per monitor (il più recente davanti), non una fotografia: la prima
   finestra finiva sull'ultimo monitor chiuso. Ora senza `slot` vale solo la
   prima voce (giusta per chi ha una finestra), dalla seconda in poi il ripiego
   per monitor.
6. **`istantanee.json` senza specchio `perMonitor`**: un downgrade sotto la
   0.12.45 rileggeva i salvataggi vuoti. Ora lo store scrive `perMonitor` =
   `perSlot`, come fa già `workspaces.json` (`perDisco`).
7. **`pausa-aggiornamento.json` cancellato prima che una finestra esistesse**:
   un avvio caduto a metà perdeva l'avviso di ripresa. Ora resta finché
   l'ultima chat non è stata ripresa (scade comunque dopo 6h).
8. Il manifesto locale della sync (`sync-manifesto.json`) letto con un cast
   cieco: una forma sbagliata faceva cadere «Salva ora» con un `TypeError`.
   Ora vale come «non so cosa c'è sul Drive».

**Non toccato, da sapere:** `migraChiaviMonitor` ordina alfabeticamente tutte
le chiavi-geometria mai scritte, comprese quelle di monitor spariti: da un
archivio ≤0.12.44 con chiavi vecchie, le chat del monitor sinistro possono
finire nella finestra destra. Solo posizionamento, si corregge al primo
salvataggio. Nessuna chat si perde.

# La rete sotto tutto: `copie-di-versione`

Le migrazioni alla lettura sono la cura; ma la prossima rinomina la farà
qualcuno che non ha letto questa scheda. Quindi **al primo avvio di ogni
versione nuova**, prima di aprire qualunque archivio, `mettiAlSicuroLoStato`
(`src/main/copie-di-versione.ts`) copia tutti i `.json` della cartella dati e
`autopiloti/` in `copie-di-versione/<versione-da-cui-si-viene>-<data-ora>/`,
tiene le ultime 3, scrive lo stampo `versione-installata.json` e lo racconta
nel registro (`[versione] prima volta con la X (venivo dalla Y): N file…`).
Qualunque cosa sbagli la versione nuova, com'erano i file un istante prima è
sul disco, col nome della versione che li aveva scritti.

Insieme a: `workspaces.prima-dell-aggiornamento.json` (prima di riavviare per
aggiornarsi, dalla 0.12.29) e `workspaces.prima-del-ripristino.json` (prima
di ogni ripresa di un salvataggio, dalla 0.12.49).

# E la ripresa di un salvataggio non cancella più

`workspaceDopoRipristino` sostituiva per intero ogni workspace nominato dal
salvataggio: le chat aperte lì **dopo** il salvataggio sparivano dal disco
senza che nessun rifiuto potesse fermarlo. Ora una ripresa **aggiunge e
riposiziona, non toglie**: la disposizione è quella salvata, ciò che
l'archivio ha in più resta nel suo slot (`conLeChatDiAdesso`). Chiudere una
chat resta un gesto di chi la chiude.

# Le regole che ne escono

- **Rinominare un campo su disco = `grep` del nome vecchio in TUTTI i
  lettori**, e ripiego `nuovo ?? vecchio` in ognuno. Il lettore che trova il
  campo assente lo dice (`scartati`), non restituisce un contenitore vuoto.
- **Chi scrive uno stato condiviso durante un turno lungo** (pausa,
  interruttori dell'utente) deve essere riportato dal disco nel merge di fine
  turno: `conservaCambiUtente` è l'elenco, e va allungato a ogni campo nuovo
  scritto da fuori.
- **Ciò che vive solo in memoria nel servizio muore con l'aggiornamento**: o
  si scrive su disco, o alla ripartenza si rimette in uno stato da cui si
  riparte da soli.
- **Ogni scrittore dell'archivio che non passa dal rifiuto dei congedi**
  (ripristino istantanee, `workspace:cambia`, sync `ripristina`) è un punto
  dove una perdita non viene fermata: ora il ripristino non cancella e ha la
  copia; `workspace:cambia` e la sync `ripristina` restano da guardare.
- **`appId` (`it.glos.sierradeck`) non si tocca**: cambiarlo farebbe
  installare un secondo programma invece di aggiornare — vedi la nota sulla
  proprietà del prodotto.
