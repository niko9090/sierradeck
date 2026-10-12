---
titolo: "0.63.0: le chat di prova le chiude chi collauda"
quando: 2026-10-12T12:45:00+02:00
tag: ["chat di prova", "divieti", "collaudo", "chiusura", "0.63.0", "decisione di Nicholas"]
---

# La decisione

Il 12/10 Nicholas ha chiesto: «perché ti è vietato? se devi chiudere delle chat di prova devi essere autonomo».

Prima, chiudere una chat da una chat governata era vietato in tutto. Lo aveva deciso lui (30/09, e l'11/10: «non devi aggirarlo in nessun modo»). L'hook PreToolUse nega ogni comando che chiama la rotta di chiusura normale. Per questo la prova di chiusura fra i due PC aspettava sempre un suo gesto.

# Come è fatto

- C'è una rotta a parte, `/api/prova/chiudi {chat}`. Chiude la chat come la chiusura normale: è una chiusura voluta, quindi finisce in `chiuse` di `/api/stato` e i client si chiudono da soli.
- Chiude **solo** una chat che lavora in una cartella il cui nome comincia con `SierraDeck-prova-` (`src/shared/chat-di-prova.ts`). Conta solo l'ultimo pezzo del percorso: una cartella vera dentro una cartella di prova non vale.
- A decidere è il **PC dove la chat vive**, dalla cwd della chat che ha aperta, non chi chiede. Una chat vera riceve 403 «non è una chat di prova», e non succede niente.
- Il PC di casa scrive nel registro `[prova] chiudo la chat di prova «…»`. Il PC che fa da ponte scrive `[ponte] dal telefono: chiudo la chat di prova …`.
- La rotta passa dal ponte (`ROTTE_PONTE`) e fra i PC (`ROTTE_VIA_CANALE`) ed è fra quelle soggette al PIN.
- La rotta di chiusura normale resta in `ROTTE_VIETATE`. Il test `tests/main/chat-di-prova.test.ts` controlla due cose: l'hook nega ancora la chiusura normale e lascia passare quella di prova.

# Regola per i collaudi

- Le cartelle dei progetti di prova si chiamano sempre `SierraDeck-prova-<qualcosa>`. Con un altro nome la chat non si può chiudere da soli.
- Per servire, la rotta deve esserci **sia sul PC che fa da ponte sia su quello di casa**, cioè entrambi alla 0.63.0 o dopo. Con un PC più vecchio il ponte risponde 403 «… no».

# Trappola: «Installa là» e «cerca» danno la versione già scaricata

Dopo una release nuova, «Installa là» ha messo sul portatile la 0.62.0, che quel PC aveva già scaricato, invece della 0.63.0. È servita una seconda richiesta. Anche qui `/api/aggiornamento` diceva «pronto 0.62.0»: prima di installare va chiesto `/api/aggiornamento/cerca` e va aspettato «pronto» con la versione giusta.

# Provato fra i due PC (12/10, entrambi alla 0.63.0)

- Dal fisso, attraverso il ponte, chiusa la chat di prova che girava in sottofondo sul portatile: risposta 200. Il portatile pubblica subito `chiuse: [{sessione, il}]` in `/api/stato`. Il registro del fisso scrive `[ponte] dal telefono: chiudo la chat di prova sf-… su <portatile>: fatto (strada lan)`.
- Una chat vera ha ricevuto 403 «non è una chat di prova», e non è stata toccata. **Errore da non ripetere:** il rifiuto l'ho provato su una chat vera di Nicholas. Questi casi si provano solo nei test, mai sulle sue chat.
- Riaccendere la chat di prova in sottofondo la toglie da `chiuse`: vale l'ultima azione.

# 0.64.0 / 0.64.1: autopiloti di prova e riquadro dal vivo da lontano

- `/api/prova/autopilota {autopilota, azione: ferma|riprendi|archivia}` funziona con la stessa regola della cartella `SierraDeck-prova-…`, decisa dal PC dove l'autopilota gira. L'archiviazione riesce solo se l'autopilota è fermo. Il supervisore ha esteso l'eccezione agli autopiloti di prova.
- `/api/sessioni/riprendi` con `dalVivo: true` chiede alla finestra, a una sola, il riquadro dal vivo (`client:azione` `apriRemota`), come «Riprendi» o «Altri computer».
  - Dalla 0.64.1 trova la chat nei **battiti** degli altri PC. Con la 0.64.0 una chat la cui cartella esiste solo sull'altro PC dava 403 «cartella non conosciuta».
  - Senza `dalVivo` la risposta resta quella di prima.
- **Trappola:** `/api/stato` di questo PC **non elenca i riquadri remoti**. Per sapere se il riquadro c'è si legge il registro (`[apertura] … apertura remota riuscita` / `… chiudo anche qui`), non lo stato.
- **Trappola:** far riprendere un autopilota apre la sua chat nel workspace attivo di quel PC. Dopo la prova va chiusa con `/api/prova/chiudi`, altrimenti blocca la rimozione «solo cloud» con «sta lavorando».

# Prova completa del 12/10 (fisso 0.64.1, portatile 0.64.0)

| ora (UTC) | dove | cosa |
|---|---|---|
| 11:05:32 | fisso | `[apertura] … «Riprendi» da lontano — apro qui il riquadro dal vivo` → `apertura remota riuscita` |
| 11:12:41 | fisso | `[ponte] … chiudo la chat di prova sf-… : fatto` |
| 11:12:45 | fisso | `[apertura] … chiusa sul PC di casa (… alle 13:12): chiudo anche qui` + `[layout] 1 chat congedate` |

Il riquadro si è chiuso da solo **4,2 s** dopo la chiusura. Nei 90 s seguenti nel registro non c'è nessun tentativo di cercarla o riaprirla. Autopilota di prova: Ferma → Riprendi → Ferma → Archivia, tutte con 200 e una riga `[ponte]`.

# Cosa non si può fare da soli

Il progetto di prova va nel recupero solo con la rimozione sicura: residente un PC che **ha la cartella**, «solo cloud» sugli altri. Se la cartella esiste su un PC solo, per prima cosa serve «Porta qui» sull'altro, e «Porta qui» resta vietato (anche come azione `porta-qui` del pannello). Il fisso come residente senza cartella dà «Prima porta qui il progetto. Non tolgo niente.»: in quel caso si rimette il residente com'era e si annulla.
