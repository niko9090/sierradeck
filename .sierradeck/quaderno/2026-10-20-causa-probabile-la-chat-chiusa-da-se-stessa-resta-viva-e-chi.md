---
titolo: "Causa probabile: la chat chiusa da sé stessa resta viva e chiama ancora il supervisore (20/10)"
quando: 2026-10-20T08:48:10.952Z
tag: ["autopilota"]
---

Caso vero: c-13 chiusa alle 08:15 UTC con chiudiChat dentro il suo stesso giro, poi più di 9 giri al supervisore fino alle 08:45, tutti con «prosegui» vuoto. Anche c-15 ha fatto lo stesso. Nel codice, src/autopilot-host/server.ts: nei tre rami di chiudiChat (righe 2537, 2552, 2571 circa) quando c.id === chatId si mette solo chiusaQuesta = true, mentre per le altre chat si chiama deps.fermaLavoro(id, c.id). Poi alle righe 2589-2594 si esce con return {}: lo stato della chat è 'finita', ma il suo processo claude non viene fermato. Al turno dopo il suo hook Stop rientra nel giro normale e il supervisore riparte. Dalle letture fatte non risulta un'uscita subito per le chat in stato 'finita'. Da correggere nella 0.81.0: (1) all'inizio dell'hook Stop, se la chat è 'finita' (o la cartella non c'è più), uscire senza giro del supervisore, senza criteri, senza righe nel registro e senza contarla nell'antiloop; (2) fermare il processo della chat che si chiude da sola appena il suo turno finisce, cioè l'equivalente di fermaLavoro rimandato a dopo la risposta all'hook. Test: una chat che chiude se stessa fa 0 giri dopo la chiusura; una chat 'finita' che manda Stop non fa giri; le chat aperte continuano normalmente.
