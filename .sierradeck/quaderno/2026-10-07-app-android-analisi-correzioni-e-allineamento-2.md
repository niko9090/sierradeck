---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-07T14:17:54.877Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

Richieste di Nicholas del 07/10, da pubblicare come 0.52.0.
(1) Collegamento visibile in alto, accanto al PC selezionato, su PC e app. Al cambio di PC: animazione «Mi collego a NOME-PC…» con i tentativi visibili, poi strada, tacche e ritardo fissi. In caso di fallimento: messaggio con l'ultimo segno, il motivo e «Riprova». A linea caduta: colore e conto alla rovescia. Funzione pura dei passi dell'animazione con i test.
(2) Ospite di ogni chat scelto da Nicholas: «Ospitata da: PC» per chat e per workspace, schermata «Dove vive ogni chat». Regola dura: sui PC non ospiti claude non parte mai per quella chat, che si apre solo in remoto, e la copia locale va nella cartella di recupero (annullabile, mai cancellata). La causa vera per cui oggi la chat parte su entrambi i PC va trovata con i dati reali e scritta nel quaderno. Test su ogni punto di avvio.
Versione 0.52.0 dopo git fetch, voce in novita.ts, scheda nel quaderno, APK alzato se cambia android. Commit in italiano, push e pubblicazione fatti dall'autopilota con la procedura del quaderno. Resta valida la regola di sicurezza della 0.47. Non toccare l'appId; il proprietario è Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ In alto accanto al PC selezionato, su PC e app: animazione al cambio di PC con i tentativi, poi strada, tacche e ritardo fissi; fallimento spiegato con «Riprova»; colore e conto alla rovescia a linea caduta; test sulla funzione dei passi (lo giudica il supervisore)
- ⬜ Ospite delle chat: scelta per chat e per workspace, schermata «Dove vive ogni chat», nessun avvio locale sui PC non ospiti da nessun punto, copia locale in recupero e annullabile, causa vera scritta nel quaderno, test su ogni punto di avvio (lo giudica il supervisore)
- ✅ La versione è 0.52.x o successiva, con la sua voce nelle novità
- ✅ La versione corrente è pubblicata con latest.yml, l'APK e app-android.json, non è una bozza e il corpo della release non è vuoto
- ✅ I test del programma passano
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano
- ✅ Tutto è in commit e mandato su origin

## Le mosse che contano

- **2026-10-02 17:18** — supervisore → prosegui: La v0.49.0 è uscita, ma lascia due buchi che contraddicono il criterio «PIN valido anche da telefono e PC remoti»: lo sblocco condiviso fra tutti i PC e l'input via cassetta che lo aggira.
- **2026-10-02 17:33** — supervisore → finito: Le tappe A-E e la regola di sicurezza sono pubblicate (0.44.0-0.49.1); ho verificato la 0.49.1: 5 allegati, non è una bozza, origin è allineato. Restano solo le prove dal vivo con Nicholas e un campo PIN nelle Domande dell'app, segnato nel quaderno come miglioria facoltativa.
- **2026-10-06 10:35** — su tua richiesta: Chiaro: dal telefono mandi un file a **una chat precisa** o a **un autopilota**, e il file finisce nel progetto di quella chat, non in una cartella qualsiasi del PC. Lo faccio così, come **0.50.0** con l'app nuova:

- **Da qualunque app del telefono**, che sia Galleria, File, WhatsApp o un PDF: prem
- **2026-10-06 10:58** — supervisore → prosegui: La 0.50.0 è pronta nel codice ma non è ancora pubblicata né spinta su origin: due criteri verificabili falliscono.
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

## In numeri

- interventi: 39
- cartella: `E:\Users\nikof\Documents\SierraDeck`
