---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-07T15:01:23.164Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

Difetto segnalato da Nicholas il 07/10 sull'app 2.52.1: scegliendo un altro PC l'app va in errore e dice che si sta collegando a quello già collegato.
- Trovare la causa vera nel codice dell'app.
- Correggere: collegamento solo al pcId scelto con i suoi indirizzi, il precedente staccato, nome e animazione del PC scelto, nessuna azione sul PC già collegato, fallimento spiegato e nessun ripiego.
- Aggiunta di Nicholas: al cambio di PC una schermata intera e dettagliata dei passi (stato, indirizzo, tempo, motivo e cosa fare per ogni errore), con «Riprova», «Torna al PC di prima», «Annulla» e «Copia i dettagli»; a buon fine un ✓ e la chiusura.
- Test Kotlin sulla selezione e sui passi dettagliati, e vitest se la pagina condivide la logica.
Patch 0.52.2 dopo git fetch, voce in novita.ts, scheda nel quaderno con la causa, APK alzato. Commit in italiano, push e pubblicazione fatti dall'autopilota con la procedura del quaderno. Niente dati privati nel codice e nei test. Non toccare l'appId; il proprietario è Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ Causa trovata e scritta nel quaderno; il cambio di PC sull'app si collega solo al PC scelto con i suoi indirizzi, stacca il precedente, non fa niente sul PC già collegato, non torna in silenzio su un altro PC; test Kotlin sui quattro casi (lo giudica il supervisore)
- ⬜ Schermata intera del cambio di PC sull'app: passi con stato, indirizzo, tempo, motivo e cosa fare; «Riprova», «Torna al PC di prima», «Annulla», «Copia i dettagli»; ✓ e chiusura a buon fine; test Kotlin sui passi dettagliati (lo giudica il supervisore)
- ✅ La versione è 0.52.2 o successiva, con la sua voce nelle novità
- ✅ La versione corrente è pubblicata con latest.yml, l'APK e app-android.json, non è una bozza e il corpo della release non è vuoto
- ✅ I test del programma passano
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano
- ✅ Tutto è in commit e mandato su origin

## Le mosse che contano

- **2026-10-06 11:00** — supervisore → prosegui: Il pacchetto è a metà (installer pronto, APK in compilazione); la release e il push mancano ancora, e sono due criteri che falliscono.
- **2026-10-06 11:06** — supervisore → finito: La v0.50.0 è pubblicata e non è una bozza: ha i 5 allegati e l'APK 2.50.0, e origin è allineato. Ci sono il share target, «Allega» e «Scegli file», il salvataggio nel progetto escluso da git, il PIN e i test di rifiuto in vitest e Kotlin. I limiti sono annotati nel quaderno; manca solo la prova dal vivo con Nicholas.
- **2026-10-07 08:00** — su tua richiesta: Va bene, è la prossima cosa che faccio, come **0.51.0** con l'app nuova. Ecco cosa cambia:

**Collegamento più solido**
- **Riconnessione veloce e da sola.** Se la strada cade, riprova subito e poi sempre più distanziato, senza mai arrendersi in silenzio. Appena l'altro PC risponde, si rimette in pi
- **2026-10-07 08:26** — supervisore → finito: Ho verificato: la v0.51.0 è pubblicata e non è una bozza, con 5 allegati e l'APK 2.51.0. Ci sono collegamento.ts, Linea.kt e i test delle cadute simulate, e origin è allineato. Manca solo la prova dal vivo con Nicholas (wifi staccato e riattaccato), che è annotata nel quaderno.
- **2026-10-07 13:29** — su tua richiesta: Sì, ho capito. Sono due cose.

**1. Indicatore di qualità in alto, accanto al PC selezionato.** Oggi le tacche si vedono solo dentro il riquadro della chat remota. Le metto anche in alto, dove scegli il PC: icona della strada, tacche e ritardo, sempre visibili. Se la linea cade lo vedi lì subito, e 
- **2026-10-07 13:31** — su tua richiesta: Hai ragione. Ho controllato: le tacche e la scritta «Passo da X a Y» della 0.51 compaiono solo **dentro il riquadro di una chat remota**, quando cambia la **strada** (per esempio da Tailscale a rete di casa). Quando cambi **PC** dal selettore in alto, invece, non c'è niente: nessuna animazione e nes
- **2026-10-07 13:58** — supervisore → prosegui: Nella 0.52.0 manca l'animazione al cambio di PC dal telefono che Nicholas ha chiesto in modo esplicito (nessun «Mi collego a» nel codice), quindi il primo criterio non è soddisfatto.
- **2026-10-07 14:17** — supervisore → finito: Ho controllato la v0.52.1: è pubblicata, non è una bozza, ha 5 allegati e l'APK 2.52.1. «Mi collego a…» c'è nell'app (Tentativi.kt, App.kt), sul PC e nella pagina; l'ospite delle chat è uscito nella 0.52.0; origin è allineato. Resta da fare la prova dal vivo con Nicholas.
- **2026-10-07 14:29** — su tua richiesta: Ricevuto, è un difetto della 0.52.1 sul telefono e lo correggo subito, come **0.52.2**.

Da quello che descrivi, quando scegli un altro PC l'app parte con il nome nuovo ma poi continua a usare i dati del PC di prima. Le due cause più probabili sono queste:
- l'animazione prende il PC che era selezio
- **2026-10-07 14:33** — su tua richiesta: Va bene, la metto nella stessa correzione, la **0.52.2**. Quando cambi PC dal telefono, l'animazione occupa **tutto lo schermo** e ti racconta passo per passo cosa succede:

- **In alto**, grande: «Mi collego a NOME-PC», con l'ora dell'ultimo segno di vita di quel PC e la sua versione.
- **Al centro
- **2026-10-07 14:45** — supervisore → prosegui: Nella 0.52.2 manca la schermata intera e dettagliata che Nicholas ha chiesto: non ci sono «Copia i dettagli» né «Torna al PC di prima», quindi il secondo criterio non è soddisfatto.
- **2026-10-07 15:01** — supervisore → finito: Ho verificato: la v0.52.3 è pubblicata e non in bozza, con 5 allegati e l'APK 2.52.3. Nell'app ci sono la schermata intera (SchermataViaggio.kt, Viaggio.kt) e «Copia i dettagli», con i test SelezioneTest e ViaggioTest. Origin è allineato e la causa è scritta nel quaderno. Restano solo le prove dal vivo con Nicholas.

## In numeri

- interventi: 41
- cartella: la cartella del progetto SierraDeck
