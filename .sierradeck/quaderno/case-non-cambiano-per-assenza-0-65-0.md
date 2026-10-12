---
titolo: "0.65.0: la casa di una chat non cambia mai perché un PC è assente"
quando: 2026-10-12T16:15:00+02:00
tag: ["una chat una casa", "casa", "battito", "PC assente", "cassaforte", "portachiavi", "0.65.0", "difetto di Nicholas"]
---

# Il difetto

Nicholas, 12/10: «Ci sono dei workspace che mi dice essere di un PC ed è di un altro solo perché non era più collegato al Drive.»

Ci sono tre PC: questo (PC fisso), il portatile, e un secondo PC fisso. Quest'ultimo è rimasto scollegato dal Drive dal 09/10 al 12/10 con un battito fermo alla 0.56.

# Le cause vere (dal registro e da `case-chat.json`)

1. **La correzione all'apertura (0.58.2–0.64).** `remoto:apertura` correggeva la casa decisa dalla regola quando il PC di casa «non aveva» la chat, e la scriveva con la forza di «Sposta» (`casaCorretta`, `da: 'sposta'`). Il «non l'ha» però veniva dal battito, e il battito di un PC scollegato è vecchio: quello del secondo PC fisso, alla 0.56, non elencava le chat sul disco. Nel registro ci sono due casi, il 10/10 alle 19:51 e l'11/10 alle 17:47, con la riga «casa corretta: <PC fisso 2> → <portatile>».
2. **La migrazione del 02/10.** Le case «della regola» del 02/10 sono 473 in tutto: 308 sul PC fisso e 175 sul secondo, con il motivo «la sua cartella … c'è solo su X». Sul portatile non ce n'è nessuna «per cartella». Il battito del portatile allora era della 0.33–0.38 e non diceva tutte le sue cartelle, e «non lo dice» contava come «non ce l'ha».

# La regola dalla 0.65.0

- **L'apertura non scrive mai una casa** (`decidiAperturaRemota` in `src/shared/apertura-remota.ts`). Decide solo quale PC guarda il riquadro:
  - PC di casa assente (`pcVivo` falso: battito più vecchio di 5 minuti, o nessun battito): `assente`, la casa resta e il riquadro dice «non raggiungibile»;
  - PC di casa presente, la chat là non c'è ma c'è su un altro PC: `guarda-altrove`, la casa resta e il messaggio dice di cambiarla con 🏠;
  - scelta di Nicholas senza copia: resta, come prima.
- **La prima casa** (`decidiCasa`, solo per le chat senza casa): la regola «la cartella c'è solo qui» non vale se un altro PC è `incerto` (battito vecchio o senza `locali`).
- La casa cambia solo con: una scelta di Nicholas («Ospitata da», «Rendi residente»), il trasloco confermato, o l'autopilota di questo PC che governa la chat (`casaPerAutopilota`, invariato).

# La cassaforte del portatile (13:14 UTC del 12/10)

Non era chiusa per un riavvio di Windows. Tutte e sei le righe «risponde ma non riconosce la chiave» del 10, 11 e 12/10 cadono nel minuto in cui il portatile si riavviava per un aggiornamento, e il contatto dopo, 1–2 minuti più tardi, passava. Il portatile riapre la cassaforte dal portachiavi da solo, come questo PC: è lo stesso codice.

Ho trovato e chiuso una trappola vera. Se all'avvio il portachiavi di Windows non era ancora pronto, `maestraRicordata` buttava il file della chiave ricordata, e la cassaforte restava chiusa fino alla passphrase. Adesso il file resta, e `riapriDalPortachiavi` riprova ogni minuto. Se la cassaforte resta chiusa con il Drive collegato, nella banda compare «Cassaforte chiusa: gli altri PC e il telefono non entrano qui» con «Aprila».

# Una trappola nostra

`gradle … -q 2>&1 | tail` restituisce sempre 0: dice il codice di `tail`, non quello di gradle. Per questo `PonteTest` è rimasto rosso dalla 0.63 senza che nessuno se ne accorgesse: mancavano le rotte `/api/prova/*` nell'app. Per controllare l'app si scrive l'uscita in un file e si legge `$?` subito dopo.
