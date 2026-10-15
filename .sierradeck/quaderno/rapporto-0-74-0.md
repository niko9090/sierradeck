---
titolo: "Rapporto 0.74.0 e 0.74.1 per Nicholas: controllo della 0.73.0, notifiche utili, workspace dell'autopilota, trasformazione di tutti i workspace"
quando: 2026-10-15T22:45:00+02:00
tag: ["rapporto", "0.74.0", "0.74.1", "per Nicholas"]
---

# In breve
La 0.74.0 (app 2.74.0) è pubblicata con installer, latest.yml, APK firmato e app-android.json. **Non l'ho installata: la installi tu.** Contiene tre cose, in una release sola:
1. i difetti trovati controllando la 0.73.0 che hai installato;
2. le notifiche dell'app e della pagina, solo quelle utili;
3. il workspace come ambiente dell'autopilota, con la vista a elenco.

Le foto stanno sul PC in `note/prova-073/foto-0731/`, fuori dal repository.

# 0.74.1: tutti i workspace trasformati, senza toccare niente che lavora
La 0.74.1 (app 2.74.1) è pubblicata e **non installata**: la installi tu. Fa quello che hai deciso: **tutti** i workspace di ogni PC passano al modo nuovo da soli, al primo avvio, e ognuno lo fa solo con i suoi (mai con quelli «Su altri PC»).

**Cosa cambia, e cosa no:**
- ogni workspace ha la vista a elenco e il suo autopilota. L'autopilota è **fermo**: senza obiettivo e senza criteri, non lancia niente e non compare fra i «fermi». Nasce davvero solo quando gli scrivi il primo messaggio nella colonna a sinistra; allora si prepara e aspetta il tuo «Vai»;
- le chat aperte (anche quelle di altri PC, in sottofondo o guidate) **restano vive come sono** e diventano le voci dell'elenco. La trasformazione non scrive i file delle chat e non chiude, riavvia o sposta niente;
- prima di cambiare fa una **copia di tutto** in `copie-di-versione`. Se qualcosa va storto torna com'era da sola e lo dice una banda; il programma parte comunque;
- **«Torna come prima»** rimette i workspace esattamente come erano: c'è nella banda, in Impostazioni → Chat e autopiloti, sulla pagina e nell'app. «Trasforma tutti» la rifà.

**Due difetti trovati provando sui dati veri, e corretti:**
1. **Cambiare vista riavviava le chat:** passando da elenco a mosaico, o con «Torna come prima», i processi delle chat ripartivano (PID diversi). Ora no: rifatta la prova con 2 chat vive, gli stessi PID dopo tutti i cambi.
2. **La chat principale di un autopilota si chiudeva quando lui finiva.** Ora si chiudono solo gli specialisti che hanno finito, e mai una chat che sta scrivendo o che ti chiede qualcosa.

**Compatibilità con i PC alla 0.73 e alla 0.69:** provata con i loro battiti veri, resi anonimi, e con le risposte vere delle loro versioni, generate dai tag. Si vedono, si aprono le chat a vicenda e si consegnano i messaggi; le risposte della 0.74.1 contengono tutto quello che leggevano i PC vecchi.

**La prova sui dati veri** (una copia staccata in `note/vero-074`, senza Drive, ponte, chiave di casa, token né dispositivi):
- su tutti e 3 i PC nessuna chat persa (47 su questo PC, 1 e 1 sugli altri due) e i file delle chat identici byte per byte;
- il secondo avvio non rifà niente; il riavvio a metà si completa; un guasto rimette tutto com'era; «Torna come prima» rimette la vista esattamente com'era.
- Poi ho aperto davvero la copia di questo PC: la banda, l'autopilota fermo di ogni workspace, le chat vive come voci dell'elenco, e la pagina con «Torna come prima» (foto in `note/vero-074/foto`).

## La tabella PC per PC
Per gli altri due PC il Drive conosce solo le chat **aperte** nel loro ultimo battito, non tutti i riquadri salvati. Quando la versione nuova parte là, fa lo stesso conto sui loro workspace veri e lo scrive riga per riga nel registro `[migrazione]`.

### Questo PC (sui suoi dati veri): 20 workspace, 47 chat

| Workspace | Chat | Cosa diventa |
|---|---|---|
| DDJ-Dj_Deck | 1 | vista a elenco, la chat resta com'è; autopilota fermo su «DDJ-Dj_Deck» |
| Wdeck | 1 | vista a elenco, la chat resta com'è; autopilota fermo su «Wdeck» |
| HA | 1 | vista a elenco, la chat resta com'è; autopilota fermo su «HomeAssistant» |
| SierraDeck | 1 | vista a elenco, la chat resta com'è; autopilota fermo su «SierraDeck» |
| serverDSM | 2 | vista a elenco, le 2 chat restano com'erano; autopilota fermo su «ServerDSM» |
| flux | 1 | vista a elenco, la chat resta com'è; autopilota fermo su «FLUX» |
| Nas film | 1 | vista a elenco, la chat resta com'è; autopilota fermo su «NAS-film» |
| MT5 | 1 | vista a elenco, la chat resta com'è (dal vivo da un altro PC); autopilota fermo |
| Money | 1 | vista a elenco, la chat resta com'è; autopilota fermo su «Money» |
| Predefinito | 29 | vista a elenco, le 29 chat restano com'erano; autopilota fermo su «Portfolio» |
| NexoraOS | 1 | vista a elenco, la chat resta com'è; autopilota fermo su «NexoraOS» |
| video installazione | 1 | vista a elenco, la chat resta com'è; autopilota fermo su «video installazione» |
| microcoat | 2 | vista a elenco, le 2 chat restano com'erano; autopilota fermo su «microcoat» |
| BG4 | 1 | vista a elenco, la chat resta com'è; autopilota fermo su «GLOS» |
| adesivi | 1 | vista a elenco, la chat resta com'è; autopilota fermo su «adesivi» |
| visitafacile | 1 | vista a elenco, la chat resta com'è; autopilota fermo su «Documents» |
| SierraDeck-prova-collaudo | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| HomeAssistant | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| gen | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| fionda apl | 1 | vista a elenco, la chat resta com'è (dal vivo da un altro PC); autopilota fermo |

### Il fisso dell'ufficio, alla 0.73.0 (dal suo battito sul Drive): 16 workspace, 1 chat

| Workspace | Chat | Cosa diventa |
|---|---|---|
| DDJ-Dj_Deck | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| Wdeck | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| HA | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| SierraDeck | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| serverDSM | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| flux | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| Nas film | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| BG4 | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| adesivi | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| visitafacile | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| GLOS | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| convertitore | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| fionda apl | 1 | vista a elenco, la chat resta com'è; autopilota fermo su «fionda apl» |
| glos video | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| video installazione | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| Predefinito | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |

### Il portatile, alla 0.69.0 (dal suo battito sul Drive): 16 workspace, 1 chat

| Workspace | Chat | Cosa diventa |
|---|---|---|
| MT5 | 1 | vista a elenco, la chat resta com'è; autopilota fermo su «Trading» |
| Money | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| DDJ-Dj_Deck | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| Wdeck | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| HA | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| SierraDeck | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| serverDSM | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| flux | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| Nas film | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| Predefinito | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| video installazione | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| microcoat | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| NexoraOS | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| BG4 | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| adesivi | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |
| visitafacile | 0 | vista a elenco, vuoto; autopilota fermo (la cartella si sceglie al primo lavoro) |

# 1. Il controllo della 0.73.0 installata
**Cosa ho guardato:**
- il registro dalle 19:27 UTC e quello di tutto il giorno: errori, avvisi, cicli che si ripetono, consegne, aperture, Drive;
- in sola lettura, gli autopiloti veri dal servizio;
- poi un giro con i clic veri su tutte le schermate, in una copia di prova, sul PC e sulla pagina del telefono.

**Cosa ho trovato e corretto**, ognuno con il suo test:
| # | Difetto | Correzione |
|---|---|---|
| 1 | Il collegamento diretto (WebRTC) verso il portatile spento si ritentava ogni 4 minuti, 75 secondi per tentativo: 193 tentativi in un giorno. | La pausa cresce: 2, 4, 8, 16, poi 30 minuti al massimo. Si riprova **subito** quando il portatile lascia un battito nuovo sul Drive. Se torna su Tailscale lo trova già il bussare, che si ripete ogni 30 s. |
| 2 | Il trasloco di «SierraDeck» fermo (il portatile non risponde) scriveva la stessa riga ogni 2 minuti: 390 righe. | Lo stesso fermo una volta all'ora; un motivo nuovo subito. Il trasloco vero non l'ho toccato. |
| 3 | Il controllo degli aggiornamenti ogni 10 minuti scriveva 4 righe senza novità (180 al giorno). | Una riga all'ora. Una versione trovata, lo scaricamento o un errore si scrivono sempre. |
| 4 | A ogni chiusura del programma: «[ERRORE] pty-host terminato con codice 0». | Non è un errore: non si scrive più. |
| 5 | «Aspettano te 2» in ambra con due risposte già date dall'autopilota e niente da fare. | Il numero conta solo chi aspetta davvero, sul PC, sulla pagina e nell'app. |
| 6 | Scheda dell'autopilota: «3 specialisti» sopra un elenco di 4 (riga salvata da una versione vecchia). | La riga si rifà dai ruoli delle chat. |
| 7 | Sulla pagina il menu «Stato» dei Progetti aveva lo sfondo bianco. | Scuro come i tasti. |
| 8 | Le cartelle degli specialisti finiti restavano vuote su disco (e comparivano in File). | Si tolgono da sole, solo se vuote. |
| 9 | Le chat degli specialisti finiti restavano aperte con il loro processo, e **al riavvio si riaprivano tutte insieme** (10 riquadri minuscoli nella copia). | Si chiudono da sole: vedi il punto 3. |
| 10 | La chat di un autopilota fermato da te restava «ci pensa l'autopilota»: se faceva una domanda, non arrivava né alle Domande né al telefono. | Torna tua appena l'autopilota è fermo, fallito o archiviato. |
| 11 | Il nuovo autopilota proponeva come cartella la copia di lavoro di uno specialista. | Propone il progetto vero. |
| 12 | Sulla pagina la scheda dell'autopilota scorreva di lato e attaccava due righe («5 h 24 minsupervisore»). | Una riga per voce, niente scorrimento laterale. |

**Verificato senza difetti:**
- nessuna chat di altri PC si è avviata da sola dopo l'installazione: il registro dice «i suoi riquadri restano come sono»;
- le chat ferme risultano ferme (i segnali di Claude Code arrivano);
- la lista degli autopiloti è giusta;
- le spunte e le Domande essenziali funzionano come nella 0.73.0.

# 2. Notifiche: solo quelle utili
Restano cinque tipi, e nell'app ognuno ha il suo interruttore (Impostazioni → Notifiche → «Quali notifiche»):
- **domande e attese**: una domanda, una scelta, un autopilota che aspetta il via, una chat che **ti aspetta da almeno 3 minuti**;
- **lavoro finito**;
- **lavoro fermo**;
- **versione pronta** (dell'app o del computer);
- **computer scollegato da più di 5 minuti**, e il ritorno.

Le pause brevi fra un turno e l'altro non suonano più: erano la maggior parte. Ogni chat e ogni autopilota hanno **una notifica sola, che si aggiorna**. I file ricevuti sono spenti di partenza: il file lo trovi comunque in File.

La pagina segue la stessa regola. L'inventario completo, con le stime per un'ora normale, è nella scheda `notifiche-utili-0-74-0.md`.

# 3. Il workspace è l'ambiente dell'autopilota
- «+ Nuovo autopilota» crea **il suo workspace** con la vista a elenco: a sinistra lui e i suoi specialisti, a destra **una chat sola, grande**. Tocchi una riga e quella chat viene davanti. **Nessuna chat in più** accanto all'autopilota (la spunta «Nel suo workspace, a elenco» si può togliere).
- I workspace che hai già **non cambiano da soli**: passano alla vista a elenco solo se lo scegli tu, uno per uno, da Strumenti → «Vista a elenco per questo workspace». «Mosaico» torna ai riquadri affiancati.
- Le chat normali restano, con «+ Nuova chat».
- Sulla pagina e nell'app gli specialisti finiti mostrano «chat chiusa» al posto di «Guarda».

Foto: `00-avvio` (prima: 10 riquadri) e `10-dopo-avvio` (dopo: 2); `12` e `14` (vista a elenco); `20` (workspace nuovo creato dall'autopilota); `22` (Mosaico); `p-12` e `p-13` (pagina).

# Punti aperti
1. **App Android senza foto:** qui non c'è un telefono collegato né un emulatore, e installarne uno non è permesso. È coperta dai test (320, tutti verdi) e dalla build.
2. **Telefono che non si collega** (c-19): il messaggio con il motivo è ancora da fare. Intanto la notifica «computer scollegato» dopo 5 minuti dice almeno che il telefono non lo raggiunge.
3. **Nella copia di prova gli autopiloti nuovi non partono**, perché Claude non ha il login (credenziali di prova scadute). La parte «specialisti che lavorano dentro la vista a elenco» l'ho provata sugli autopiloti di prova di oggi, non con uno nuovo. Si vede bene al primo autopilota vero che avvii dopo l'installazione.
4. Puoi cancellare le cartelle `note/prova-072`, `note/prova-0721`, `note/prova-073` e `note/vero-074`: sono copie di prova, senza credenziali. `note/compat` contiene due worktree git sui tag v0.69.0 e v0.73.0, che servono a rigenerare le risposte vere: si tolgono con `git worktree remove`.
