---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-02T17:33:52.572Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

Miglioramenti scelti da Nicholas il 02/10, pubblicati a tappe, ognuna appena verde.
A) Criteri degli autopiloti controllati quando vengono scritti; pannello «Salute del sistema» su PC e telefono.
B) Segnali di Claude Code (hook) come fonte primaria, con la lettura dello schermo solo come riserva.
C) «Installa là» per aggiornare gli altri PC da questo.
D) Dal telefono, le chat di tutti i PC dal vivo passando dal PC accoppiato, fatto con cura.
E) PIN delle chat, facoltativo dalle Impostazioni: protezione per chat o per workspace, copertura con lucchetto, richiusura per inattività, valido anche da telefono e PC remoti; impronta del PIN con sale, mai in chiaro; attesa crescente dopo i tentativi sbagliati; azzeramento con la password principale; testo onesto su cosa protegge.
REGOLA DI SICUREZZA: solo i PC dello stesso Drive di SierraDeck (chiave di casa) possono vedersi, comandarsi e aggiornarsi, con test di rifiuto per ogni strada e la regola nel quaderno.
Funzioni pure con i test (vitest e Kotlin). Ogni tappa: versione minore, voce in novita.ts, scheda nel quaderno, APK alzato se cambia android. Commit in italiano, push e pubblicazione fatti dall'autopilota con la procedura del quaderno. Non toccare l'appId; il proprietario è Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ Tappa A: validazione dei comandi dei criteri alla scrittura (casi reali del 01/10 nei test) e pannello Salute su PC e telefono con spiegazioni e azioni (lo giudica il supervisore)
- ⬜ Tappa B: gli hook di Claude Code sono la fonte primaria per stato, domande, permessi, turni ed errori; la lettura dello schermo è solo riserva annotata nel log; test con il JSON vero degli hook (lo giudica il supervisore)
- ⬜ Tappa C: «Installa là» dal pannello Salute, con note, conferma, quiete ed esito, incluso il caso fallito (lo giudica il supervisore)
- ⬜ Tappa D: dal telefono le chat di tutti i PC dal vivo tramite il PC accoppiato, «SU PC» evidente, test di compatibilità (lo giudica il supervisore)
- ⬜ Tappa E: PIN delle chat facoltativo, per chat o per workspace, con copertura, richiusura, validità su telefono e PC remoti, impronta con sale, attesa crescente, azzeramento con la password principale; test (lo giudica il supervisore)
- ⬜ Regola di sicurezza: nessuna strada accetta un PC senza la chiave di casa valida; test di rifiuto su LAN, Tailscale, WebRTC, Drive, telefono e Installa là; regola scritta nel quaderno (lo giudica il supervisore)
- ✅ La versione è 0.48.x o successiva, con la sua voce nelle novità
- ✅ La versione corrente è pubblicata con latest.yml, l'APK e app-android.json, non è una bozza e il corpo della release non è vuoto
- ✅ I test del programma passano
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano
- ✅ Tutto è in commit e mandato su origin

## Le mosse che contano

- **2026-10-02 11:53** — su tua richiesta: Hai ragione su tutte e due le cose. Le metto **prima** del lavoro sul multi-PC, perché ti servono ogni giorno.

**1. Una linguetta «Istruzioni» sotto la chat dell'autopilota.** Nella chat vedi solo «Leggi ed esegui le istruzioni in …c-5.md», che non ti dice niente. Nella linguetta trovi invece il te
- **2026-10-02 12:03** — su tua richiesta: Sì, lo aggiungo alla stessa versione delle linguette Istruzioni e delle domande chiare.

- **Tutta la parte destra si allarga e si stringe.** Prendi il bordo sinistro e lo trascini: la scheda dell'autopilota, la colonna Domande e quella Consumi diventano larghe quanto vuoi tu.
- **Anche dentro si ri
- **2026-10-02 12:29** — supervisore → prosegui: WebRTC è uscita come 0.40.0, quindi mancano ancora la tappa 0 (0.41.0) e la tappa 2 (0.42.0); i criteri sul quaderno e sulla versione 0.42 falliscono.
- **2026-10-02 13:25** — su tua richiesta: Va bene. Intanto ti dico dove siamo: la chat sta pubblicando adesso la **0.42.0**, cioè il riordino delle chat con il Drive come salvataggio. Prima erano uscite la 0.40.0 (collegamento fra PC su reti diverse) e la 0.41.0 (linguetta Istruzioni, domande chiare, parte destra ridimensionabile).

Poi pas
- **2026-10-02 13:30** — supervisore → prosegui: Le tappe 0.40-0.42 sono pubblicate e verificate; manca la 0.43.0 per il telefono, che è il criterio che fallisce.
- **2026-10-02 13:58** — supervisore → finito: Ho verificato tutto: v0.43.0 pubblicata, non in bozza, con i 5 allegati e l'APK 2.46.0; WorkManager in ControlloApp.kt; test CompatibilitaPcTest e AggiornamentiTest presenti; origin allineato. Le tappe 0.40-0.42 erano già state verificate. Restano solo le prove dal vivo con Nicholas e le sue indicazioni sull'aspetto dell'app.
- **2026-10-02 15:23** — su tua richiesta: Bene, allora faccio i punti 3, 4, 5, 6 e 7. Li pubblico uno dopo l'altro, ognuno quando è verde:

1. **Criteri controllati quando vengono scritti** (7) e **pannello «Salute del sistema»** (4). Sono i più veloci e ti proteggono subito: il pannello mostra in una schermata Drive, battiti degli altri PC
- **2026-10-02 15:24** — su tua richiesta: Va bene, lo aggiungo come una tappa a sé. Ecco come lo farei:

- **Si accende dalle Impostazioni**, nella voce «PIN delle chat»: scegli un PIN (da 4 a 8 cifre). Finché non lo attivi non cambia niente.
- **Decidi tu quali chat proteggere.** Con il tasto destro su una chat, o dal suo menu, scegli «Pro
- **2026-10-02 16:47** — supervisore → prosegui: Le tappe A-D e la sicurezza sono pubblicate e verificate (0.44-0.48); manca la tappa E del PIN, che Nicholas ha chiesto.
- **2026-10-02 16:52** — supervisore → prosegui: Il lavoro del PIN è a metà, con file non tracciati e la chat in attesa: va messo al sicuro in un commit e fatto proseguire sulle parti già note.
- **2026-10-02 17:18** — supervisore → prosegui: La v0.49.0 è uscita, ma lascia due buchi che contraddicono il criterio «PIN valido anche da telefono e PC remoti»: lo sblocco condiviso fra tutti i PC e l'input via cassetta che lo aggira.
- **2026-10-02 17:33** — supervisore → finito: Le tappe A-E e la regola di sicurezza sono pubblicate (0.44.0-0.49.1); ho verificato la 0.49.1: 5 allegati, non è una bozza, origin è allineato. Restano solo le prove dal vivo con Nicholas e un campo PIN nelle Domande dell'app, segnato nel quaderno come miglioria facoltativa.

## In numeri

- interventi: 33
- cartella: `E:\Users\nikof\Documents\SierraDeck`
