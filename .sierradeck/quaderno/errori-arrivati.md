# Errori arrivati (lotto 20261030221404, richiesta r-5)

## Gruppo 1: «[pty-host] spegnimento (richiesta del Core): chiudo i terminali aperti»
Non corretto, non c'era nulla da correggere. Non è un difetto: è la riga di log dello spegnimento voluto (src/pty-host/host.ts). Già corretto in 0.88.2: il client la racconta invece di metterla fra gli errori. Visto solo su 0.88.1. Aggiunto solo un test che prova che quella riga non finisce fra gli errori.

## Gruppo 2: «Error: AttachConsole failed» (node-pty, conpty_console_list_agent.js:13)
Corretto nella versione 0.88.5. È l'agente figlio di node-pty usato da kill() su Windows: fallisce se la shell è già morta, ed è atteso e innocuo (pty-manager ignora già le eccezioni di proc.kill()). Il suo stderr arrivava al client e finiva in console.error, quindi fra gli errori. Ora `leggiStderrAtteso` (src/main/pty-host-client.ts) lo riconosce e lo racconta in una riga («console già chiusa (node-pty): ignorato»); ogni altro stderr resta errore. Test in tests/main/pty-host-client.test.ts, gruppo «stderr dell host». Il bump di versione lo fa la chat della release.

# Errori arrivati (lotto 20261030222734, richiesta r-6)

## Gruppi 1 e 5: «[pty-host] spegnimento (richiesta del Core): chiudo i terminali aperti»
Corretto nella versione 0.88.5. La correzione 0.88.2 usava `^` sul pezzo intero di stderr: se la riga dello spegnimento arrivava unita ad altre righe, dopo un a-capo o con spazi davanti, non era riconosciuta e finiva in `console.error('[pty-host]', chunk)`, da cui il titolo col prefisso doppio. Ora `leggiStderrAtteso` (src/main/pty-host-client.ts) lavora riga per riga: le righe di spegnimento sono raccontate, il resto resta errore. Test in tests/main/pty-host-client.test.ts («stderr dell host»).

## Gruppi 2, 3, 4: «non si apre — cartella-sparita» / «Error occurred in handler for 'pty:spawn'… ENOENT»
Corretto nella versione 0.88.5. La correzione 0.88.2 lasciava andare le consegne vecchie solo alla lettura della coda dopo il riavvio; una consegna già in coda (c-6483, c-6495) per una chat con la copia di lavoro tolta veniva riproposta a ogni `ritira` (fino a TENTATIVI_MAX), e ogni volta apriva un riquadro e `pty:spawn` falliva. Ora `ritira` (src/autopilot-host/consegne.ts) lascia andare la consegna una volta, come persa, se la cartella non c'è più (tranne «chiudi», che non apre niente). La validazione del cwd non è toccata. Test in tests/autopilot-host/consegne.test.ts.

## Gruppi 6 e 7: «salvataggio sul Drive alla chiusura interrotta dopo 45 s» / «il lavoro con il Drive non si e' fermato in dieci secondi»
Non corretto qui: già corretto nella 0.88.3 (commit 7e53b0e4), visti solo su 0.88.1 e 0.88.2. Sono avvisi attesi del timeout di chiusura (il lavoro riprende al prossimo avvio, nessun dato perso): `avvisoChiusura` li scrive come informazione, non come errore.
