---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-15T22:06:52.620Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

0.75.1: quando l'app o la pagina non si collegano a nessun PC, dicono il motivo probabile e il rimedio (Tailscale spento sul telefono con «Apri Tailscale», fuori casa, chiave rifiutata, nessuna risposta). Una sola release 0.75.1, mai installata da noi; rapporto in italiano con anche l'esito della migrazione della 0.75.0 su questo PC. Proprietario: Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ App: motivo chiaro quando non si collega (Tailscale spento con «Apri Tailscale», fuori casa, chiave rifiutata, nessuna risposta); test della logica
- ⬜ Pagina: messaggi chiari per chiave rifiutata e nessuna risposta; test
- ⬜ Rapporto in italiano con l'esito della migrazione della 0.75.0 su questo PC (20 workspace, 46 chat, nessun errore)
- ⬜ Versione 0.75.1 pubblicata con APK, latest.yml e app-android.json, non bozza, mai installata
- ✅ I test del programma passano
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano

## Le mosse che contano

- **2026-10-15 20:25** — supervisore → prosegui: La 0.74.0 lascia i workspace esistenti com'erano, mentre Nicholas ha deciso di trasformarli tutti in modo sicuro: i criteri su migrazione, compatibilità e prova con i dati veri non sono ancora soddisfatti.
- **2026-10-15 20:58** — supervisore → finito: Ho verificato: la 0.74.1 è pubblicata (non bozza, con installer, latest.yml, APK e app-android.json), non è installata ed è sincronizzata con origin. La migrazione di tutti i workspace è sicura e reversibile e l'ho provata sui dati veri copiati. Ho verificato la compatibilità con la 0.73 e la 0.69 e i test passano. Il rapporto con la tabella PC per PC è nel quaderno. Ora tocca a Nicholas installare.
- **2026-10-15 21:00** — scheda nel quaderno: Dopo la 0.74.1: cosa controllare quando Nicholas installa
- **2026-10-15 21:04** — su tua richiesta: Bella idea, la aggiungo. Potrai parlarmi a voce **qui nella scheda dell'autopilota**, e anche nel campo «Scrivi tu» delle Domande.

**Come funzionerà:**
- accanto al campo di scrittura c'è un tasto **microfono**;
- lo premi, parli in italiano e il testo compare nel campo mentre parli;
- lo rileggi, 
- **2026-10-15 21:04** — ripreso su tua richiesta («Riprendi»)
- **2026-10-15 21:24** — supervisore → finito: Ho verificato. La 0.75.0 è pubblicata (non bozza, con installer, latest.yml, APK 2.75.0 e app-android.json) e non è installata. Il ramo è allineato con origin e i test passano. Il microfono c'è su PC, pagina e app. Sul PC è provato dal vero fino all'apertura della dettatura; il testo dettato non si è potuto vedere perché qui non c'è un microfono che funzioni: è un punto aperto, con il motivo scritto.
- **2026-10-15 21:24** — scheda nel quaderno: Dopo la 0.75.0: da verificare con Nicholas
- **2026-10-15 21:50** — su tua richiesta: Quasi tutto, ma non tutto. Ti dico onestamente com'è, dopo aver controllato su GitHub e nel codice.

**Fatto e pubblicato.** L'ultima versione è la **0.75.0**, con l'app 2.75.0, e contiene tutto quello delle versioni di ieri sera. Su questo PC c'è ancora la 0.73.0: installa direttamente la 0.75.0.
-
- **2026-10-15 21:52** — su tua richiesta: Ricevuto. Ho controllato subito com'è andata la trasformazione su questo PC, dal registro. Hai installato la 0.75.0 alle 23:50, e la trasformazione è partita da sola ed è andata a buon fine:
- **20 workspace** passati alla vista a elenco;
- **46 chat lasciate come erano**: nessuna chiusa né riavviat
- **2026-10-15 21:52** — ripreso su tua richiesta («Riprendi»)
- **2026-10-15 22:06** — supervisore → finito: Ho verificato: la 0.75.1 è pubblicata (non bozza, con installer, latest.yml, APK 2.75.1 e app-android.json), non è installata ed è allineata con origin. I test passano. Il rapporto riporta l'esito della migrazione su questo PC. Manca solo la prova sul telefono vero, che può fare solo Nicholas.
- **2026-10-15 22:06** — scheda nel quaderno: Dopo la 0.75.1: da provare con Nicholas

## In numeri

- interventi: 121
- cartella: `~\Documents\SierraDeck`
