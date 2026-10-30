# Errori arrivati (lotto 20261030221404, richiesta r-5)

## Gruppo 1: «[pty-host] spegnimento (richiesta del Core): chiudo i terminali aperti»
Non corretto, non c'era nulla da correggere. Non è un difetto: è la riga di log dello spegnimento voluto (src/pty-host/host.ts). Già corretto in 0.88.2: il client la racconta invece di metterla fra gli errori. Visto solo su 0.88.1. Aggiunto solo un test che prova che quella riga non finisce fra gli errori.

## Gruppo 2: «Error: AttachConsole failed» (node-pty, conpty_console_list_agent.js:13)
Corretto nella versione 0.88.5. È l'agente figlio di node-pty usato da kill() su Windows: fallisce se la shell è già morta, ed è atteso e innocuo (pty-manager ignora già le eccezioni di proc.kill()). Il suo stderr arrivava al client e finiva in console.error, quindi fra gli errori. Ora `leggiStderrAtteso` (src/main/pty-host-client.ts) lo riconosce e lo racconta in una riga («console già chiusa (node-pty): ignorato»); ogni altro stderr resta errore. Test in tests/main/pty-host-client.test.ts, gruppo «stderr dell host». Il bump di versione lo fa la chat della release.
