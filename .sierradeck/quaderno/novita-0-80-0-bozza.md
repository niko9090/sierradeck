---
titolo: "Novità della 0.80.0 (bozza)"
quando: 2026-10-19T12:40:00.000Z
tag: ["release", "0.80.0", "bozza"]
---

Bozza per Nicholas, scritta dai commit `v0.79.0..main` del 19/10. Non sono contati i commit che toccano solo il quaderno o solo i test.

## Velocità

- La pagina del telefono si prepara una volta sola e arriva compressa; i dati grandi si comprimono senza bloccare il programma. `e244ef9`
- La vista dei Progetti non aspetta più il Drive a ogni minuto; le date delle chat si leggono tutte insieme. `225636e`
- Il salvataggio sul Drive controlla i file sedici alla volta invece che uno alla volta. `469634b`
- Registro dei progetti e dati del PC tenuti in memoria finché il file non cambia. `f27dd81`
- Le richieste di rileggere l'elenco delle chat che arrivano insieme diventano una sola. `1fe22c4`
- Trascinando un divisore, la disposizione si salva quando lasci il mouse, non a ogni pixel. `2897a8d`
- I riquadri controllano il PIN ogni 30 s; ogni 3 s solo quelli protetti e aperti. `6bec053`

## Workspace e chat

- Il workspace sullo schermo cambia solo quando lo scegli tu: le consegne degli autopiloti per un altro workspace lavorano in sottofondo. Ogni cambio è scritto nel registro con la sua causa. `0c9d839`
- Un progetto che vive su un altro PC non crea più una cartella vuota qui. `aa3579b`
- Il primo messaggio scritto a un autopilota non diventa più il nome di un workspace. `c28e4a9`
- Un elenco di workspace o di chat letto male per un istante non viene più riscritto vuoto. `7680168`

## Grafica

- Un workspace senza autopilota lo dice e offre «Crea l'autopilota», con il suo «?». `2c00b19`
- «Prossimo passo» compare anche sul PC per i passi che non hanno un tasto. `8be2b61`
- «Fermo» è rosso su PC, pagina e app; «quieto» è grigio anche nell'app. `06d90db`
- La striscia «si è fermato» ha la luce rossa, non l'ambra di «aspetta te». `1a904c2`
- Una chat a fine turno è «ferma» anche su pagina e app, non «aspetta te». `395744d`
- Le chat di un autopilota fermo non contano più come «al lavoro». `df0e094`
- La pagina dice «linea ottima» invece di «collegamento ottima». `cd208ae`

## Autopilota

- Le chat finite si chiudono anche quando il loro ramo è già unito o non esiste più (prima restavano aperte per sempre). `12f85e0`, `4e1a0f3`, `aafccdb`
- Con il ramo che non c'è più, il diario non scrive «unito nel ramo principale». `9f44b27`
- Gli errori e gli avvisi del programma finiscono anche nel registro. `6bdf5e9`

## App e pagina

- Nell'app i controlli delle schermate si fermano quando l'app è dietro; lo schermo della chat si calcola una volta sola. `d18a2e7`
- Per la pagina, vedi anche Velocità (`e244ef9`) e Grafica (`395744d`, `06d90db`, `cd208ae`, `df0e094`).

## Ancora da fare prima della release

- **Analisi con i numeri «dopo»:** il rapporto `analisi-0-80-0.md` ha i numeri «prima» (`6c38f66`, `b561cfb`). Mancano le stesse misure dopo le correzioni (`misura-080.mjs`).
- **Grafica uguale fra PC, pagina e app, con le foto:** ci sono le foto «prima» (`note/foto-0-80-0`) e la scheda delle differenze (`6de3406`), più le correzioni elencate sopra. Mancano le foto «dopo» nella copia di prova e il confronto nel rapporto.
- **Notifiche solo utili, raggruppate e scritte nel registro:** c'è solo la mappa di sola lettura (`e299130`). Mancano la correzione su PC, pagina e app, la prova nella copia con un autopilota al lavoro e i numeri nel rapporto.
- **Workspace che cambia da solo:** la correzione c'è (`0c9d839`) ed è unita. Va solo verificato che ogni strada abbia il suo test, come chiede il criterio.
- **«Elimina workspace» chiaro, con «?» e recupero di 30 giorni:** non ho trovato nessun commit in `v0.79.0..main`. Va controllato o fatto.
- **I due workspace sbagliati del 19/10:** non ancora tolti. La chat VisitaFacile di qui non è vuota (`fcdf041`), quindi c'è una domanda aperta per Nicholas (`75f8d74`). Il visitafacile vero su DESKTOP non si tocca.
- **Chat della 0.79.0 rimaste aperte:** la correzione di `chiudiChat` c'è. Vale per il servizio vero solo dopo che Nicholas installa la 0.80.0; prima vanno chiuse dall'autopilota, senza chiedergli niente.
- **Criterio dei test nel servizio:** con `--maxWorkers=2` supera il tetto di 600 s (`13bfcc5`). La scelta del comando è una domanda aperta per Nicholas. Il rimedio interno, un solo giro dei test alla volta per progetto, è di c-11.
- **Release:** versione 0.80.0, APK con `latest.yml` e `app-android.json`, non bozza, mai installata da noi. Quando arriva la consegna.
