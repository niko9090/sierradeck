---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-13T00:57:30.455Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

Dopo la 0.69.0 (pubblicata con il sì di Nicholas, mai installata da noi): 0.70.0 = riprogettazione di tutto il programma con lo stesso metodo del menu Progetti (revisione di un agente UI/UX, larghezza piena, cose importanti in vista, stati in una parola, testi corti con «?»), schermata per schermata su PC, pagina e app, senza togliere funzioni; foto prima e dopo e schede nel quaderno; una sola release 0.70.0 a lavoro finito, mai installata da noi; rapporto in italiano a Nicholas. Niente dati privati nel codice; solo i PC della stessa chiave di casa; sulle chat vere solo lettura. Proprietario: Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ✅ 0.69.0 pubblicata con APK firmato, latest.yml e app-android.json, non bozza, mai installata da noi
- ⬜ Schermata principale (barra, workspace, riquadri chat, Su altri PC, Al lavoro in sottofondo) riprogettata: revisione UI/UX, foto prima/dopo in note/foto-0-70/, scheda nel quaderno, pagina e app allineate, test
- ⬜ Autopiloti, scheda dell'autopilota e Domande riprogettati con lo stesso metodo (revisione UI/UX, foto prima/dopo, pagina e app, test)
- ⬜ Salute/Altri computer, Impostazioni, File/Trasferimenti, Negozio, Consumi, Quaderno/quaderno personale, Account/Drive riprogettati con lo stesso metodo (revisione UI/UX, foto prima/dopo, pagina e app, test)
- ⬜ Nessuna funzione tolta: ogni azione che c'era prima è ancora raggiungibile (elenco nel rapporto)
- ⬜ Rapporto del mattino in italiano nel quaderno: cosa è cambiato in ogni schermata, foto prima e dopo, punti aperti
- ✅ Nessun indirizzo, nome o id vero dei PC di Nicholas nel codice, nei test, nell'app e nelle pagine
- ✅ La versione è 0.70.0 o successiva, con la sua voce nelle novità
- ✅ La versione corrente è pubblicata con latest.yml, l'APK e app-android.json, non è una bozza e il corpo della release non è vuoto
- ✅ L'APK dell'ultima release è firmato con il certificato di rilascio di Ferrari Consulenze
- ✅ I test del programma passano
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano
- ✅ Tutto è in commit e mandato su origin

## Le mosse che contano

- **2026-10-12 20:17** — scheda nel quaderno: Trappola: archivio.elenca() mette da parte il contatore delle consegne
- **2026-10-12 20:19** — su tua richiesta: Capito. Allora gli ordini arrivavano, ma la chat lavorava **in sottofondo**, cioè senza una finestra sullo schermo, e tu non avevi modo di vederlo. Hai ragione: se non si vede, non si capisce se lavora o no.

**Le regole che metto, sempre valide su PC, pagina e app:**
1. **Ogni autopilota mostra il 
- **2026-10-12 20:19** — la chat era ferma da 232 s con 1 messaggi in coda: glieli porto adesso, senza aspettare la fine del turno
- **2026-10-12 20:21** — su tua richiesta: Ricevuto: il menu **Progetti** si rifà da capo, pensato per capirlo al primo sguardo e su tutta la larghezza dello schermo. Adesso è una lista stretta con le righe da aprire una per una, e non si capisce niente.

**Come diventa:**
- **Una tabella larga**, una riga per progetto, con colonne chiare: *
- **2026-10-12 21:30** — supervisore → prosegui: Il lavoro procede (6 commit verificati); mancano lentezza, menu Progetti, completamento Drive e matrice prima dell'unica release, che va chiesta a Nicholas alla fine.
- **2026-10-12 22:11** — supervisore → chiediUtente: Il lavoro è pronto e verificato (12 commit, funzioni presenti nel codice). Pubblicare farebbe installare da sola la versione sui PC alla 0.68.0, contro la regola di Nicholas: solo lui può decidere.
- **2026-10-12 22:36** — risposta tardiva: Le ho spente, pubblica
- **2026-10-12 22:39** — su tua richiesta: Va bene, buonanotte. La 0.69.0 la sta pubblicando adesso la chat: per ora è una bozza e diventa pubblica appena l'APK firmato è caricato. Visto che hai spento «Scarica da solo», non si installa da nessuna parte: la installi tu quando vuoi.

**Stanotte** riprogettiamo tutto il programma con lo stesso
- **2026-10-12 22:46** — la chat lavora e un messaggio aspettava da 8 min: glieli scrivo adesso, durante il turno
- **2026-10-12 22:56** — supervisore → prosegui: Il lavoro notturno è appena partito (0.69.0 pubblicata, foto prima fatte, revisioni in corso); bisogna mettere in git il bump e procedere schermata per schermata senza fermarsi.
- **2026-10-13 00:57** — supervisore → finito: Ho verificato tutto. La 0.70.0 è pubblicata, non è una bozza, e ha installer, latest.yml, APK 2.70.0 firmato e app-android.json; non l'ha installata nessuno di noi. Le dieci schermate sono riprogettate, con un commit per ognuna. Le foto prima/dopo sono 40, in note/foto-0-70/. Il rapporto rapporto-notte-0-70-0.md è nel quaderno, con le tabelle «prima → adesso» e i punti aperti motivati. Tutti i criteri con comando sono verdi; ora tocca a Nicholas guardare e installare.
- **2026-10-13 00:57** — scheda nel quaderno: 0.70.0 pubblicata: cosa resta dopo l'installazione di Nicholas

## In numeri

- interventi: 112
- cartella: `~\Documents\SierraDeck`
