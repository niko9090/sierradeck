---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-15T21:24:51.790Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

0.75.0: parlare all'autopilota con il microfono, nella sua scheda e nel campo «Scrivi tu» delle Domande, su PC (dettatura di Windows), pagina (riconoscimento del browser) e app (riconoscimento di Android). Il testo compare nel campo e lo invia sempre Nicholas; niente audio salvato. Una sola release 0.75.0, mai installata da noi; rapporto in italiano. Restano le protezioni della 0.72.0 e la migrazione della 0.74.1. Proprietario: Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ Tasto microfono nella scheda dell'autopilota e in «Scrivi tu» delle Domande, su PC, pagina e app; testo dettato in italiano nel campo, mai inviato da solo
- ⬜ App Android: SpeechRecognizer it-IT, offline se possibile, permesso al primo uso, risultati parziali; test della logica di stato
- ⬜ Pagina: Web Speech API it-IT con risultati parziali; se non c'è, il tasto lo dice
- ⬜ PC: dettatura di Windows aperta dal tasto, provata dal vero su Windows 11; se manca, messaggio chiaro con «?»; nessun download o installazione
- ⬜ Versione 0.75.0 pubblicata con APK, latest.yml e app-android.json, non bozza, mai installata; rapporto in italiano
- ✅ I test del programma passano
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano

## Le mosse che contano

- **2026-10-15 19:32** — su tua richiesta: Bene: la 0.73.0 risulta installata su questo PC alle 21:27. La chat fa adesso un controllo completo sulla versione installata, cercando altri difetti. Lo fa in sola lettura sulle tue chat e sui tuoi progetti veri; le prove le fa solo su copie e chat di prova. Ogni difetto trovato lo corregge con un 
- **2026-10-15 19:32** — ripreso su tua richiesta («Riprendi»)
- **2026-10-15 19:34** — su tua richiesta: Va bene, procedo. Prendo il tuo «esatto» così, e se ho capito male me lo dici:
- le chat normali restano possibili con «+ Nuova chat», ma il modo normale di lavorare diventa l'autopilota;
- il modo nuovo (il workspace è l'ambiente del suo autopilota) vale per i workspace nuovi; quelli di oggi li tra
- **2026-10-15 19:35** — la chat lavora e un messaggio aspettava da 2 min: glieli scrivo adesso, durante il turno
- **2026-10-15 19:37** — su tua richiesta: Va bene: trasformo **tutti** i workspace, anche quelli di oggi. Hai ragione a chiedere prudenza, quindi la trasformazione segue queste regole:

1. **Non tocca niente che lavora.** Le chat aperte restano aperte e vive: entrano nella vista nuova del loro workspace così come sono. Nessuna viene chiusa,
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

## In numeri

- interventi: 120
- cartella: `~\Documents\SierraDeck`
