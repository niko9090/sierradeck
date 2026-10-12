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

# Cosa resta a mano

Il riquadro remoto su questo PC si apre solo dalla finestra («Riprendi»). Nessuna rotta lo apre, e `/api/sessioni/riprendi` risponde 409 per le chat che vivono altrove. Per vedere nel registro la riga `[apertura] … chiudo anche qui` serve un clic di Nicholas per **aprire**. Il client che si prova da soli è la pagina servita, in Edge senza finestra.
