---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-07T16:53:05.248Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

Difetto segnalato da Nicholas il 07/10: nell'app e altrove si vede il nome tecnico del PC (hostname) invece del nome che gli ha dato lui.
- Trovare dove sta il nome scelto dall'utente; se manca il campo, crearlo modificabile e propagarlo nel battito.
- Usare ovunque il nome scelto, con l'hostname solo come sottotitolo: intestazione dell'app, schermata del cambio PC, «SU PC», elenchi, Domande, Salute e mappa, «Dove vive ogni chat», pagina.
- Funzione pura nomeDaMostrare, con la copia in Kotlin, e test vitest e Kotlin.
Patch 0.52.4 dopo git fetch, voce in novita.ts, scheda nel quaderno, APK alzato. Commit in italiano, push e pubblicazione fatti dall'autopilota con la procedura del quaderno. Niente dati privati nel codice e nei test. Non toccare l'appId; il proprietario è Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ Il nome scelto dall'utente per ogni PC compare ovunque al posto dell'hostname (hostname solo come sottotitolo), su PC, app e pagina; nome modificabile e propagato; funzione nomeDaMostrare con i test vitest e Kotlin (lo giudica il supervisore)
- ✅ La versione è 0.52.4 o successiva, con la sua voce nelle novità
- ✅ La versione corrente è pubblicata con latest.yml, l'APK e app-android.json, non è una bozza e il corpo della release non è vuoto
- ✅ I test del programma passano
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano
- ✅ Tutto è in commit e mandato su origin

## Le mosse che contano

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
- **2026-10-07 16:25** — su tua richiesta: **Il nome in alto.** Hai ragione, è un difetto. Nell'app, sia in alto sia nella schermata del cambio PC, compare il nome tecnico di Windows (tipo «DESKTOP-…») invece del nome che gli hai dato tu. Lo correggo subito come **0.52.4**: dappertutto (in alto, nella schermata «Mi collego a…», nelle chat re
- **2026-10-07 16:53** — supervisore → finito: Ho controllato la v0.52.4: è pubblicata, non è una bozza e ha 5 allegati, tra cui l'APK 2.52.4. Ci sono nome-pc.ts, NomePc.kt e i test vitest e Kotlin, e origin è allineato. La causa è scritta nel quaderno. Resta la prova dal vivo con Nicholas.

## In numeri

- interventi: 42
