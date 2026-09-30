---
titolo: "L'autopilota come «harness» dell'agente: proposta, scelte di Nicholas, cosa è fatto (0.36.0 / app 2.39.0)"
quando: 2026-09-30T23:30:00+02:00
tag: ["autopilota", "harness", "multi-chat", "worktree", "limiti", "pubblicazione", "divieti", "domande", "decisione"]
---

> **Approvata e implementata il 30/09 (0.36.0, app 2.39.0)**, con le scelte di Nicholas che sostituiscono i valori di
> partenza della sezione 4. In fondo: **scelte fissate** (6), **cosa è fatto per tappa** con i test (7), **cosa resta
> aperto** (8). Le sezioni 1–5 sono la proposta com'era, lasciata per sapere da dove si è partiti.

# 1. Cosa fa oggi l'autopilota

**Chi è.** Non è una chat del mosaico. È un **servizio separato** (`src/autopilot-host/`, porta 47630) che
sopravvive alla chiusura del programma. Per ogni chat che governa tiene una sessione di giudizio `claude -p`, ripresa
con `--resume` a ogni fermata: è il **supervisore** (`supervisore.ts`, `decisione-supervisore.ts`). Il programma gli
parla con `src/main/autopilot-client.ts`, che è un semplice client HTTP: `elenca`, `crea`, `vai`, `modifica`, `parla`,
`dialoga`, `disfa`, `ferma`, `riprendi`, `riprendiAlRiavvio`, `elimina`, `domande`, `rispondi`, `battiti`,
`pausaAggiornamento`.

**Il ciclo di vita.**
1. **Intervista.** Legge il progetto e fa al massimo 2 domande (`intervista.ts`, `domande.ts`). Poi si scrive nome,
   obiettivo e **criteri**, cioè frasi con un comando che le misura (`verifiche.ts`).
2. **Pronto.** Aspetta il «Vai» (`mettiInPronto` in `server.ts`).
3. **Lavoro.** Apre una chat **sua**; dalla 0.27 non adotta mai una chat altrui. A ogni fermata (hook Stop) la chat
   passa dal supervisore, che:
   - misura i criteri;
   - risponde da solo ai bivi che sa sciogliere (`risposta-autonoma.ts`);
   - cambia strada se vede lo stesso esito tre volte (`strategie.ts`);
   - chiede a te solo quando è bloccato: la domanda va nella scheda Domande.
4. **Fine.** Finisce quando tutti i criteri passano; si arrende sugli stalli (`rete-sicurezza.ts`, `guardiano.ts`).

**Come arriva alla chat.** Il servizio non può toccare le finestre: mette le istruzioni in una coda di **consegne**
(`consegne.ts`). Il programma passa a ritirarle ogni 1,5–6 s (`src/main/autopilota-consegne.ts`) e le scrive nel
riquadro, come se le avessi digitate tu, nel workspace giusto.

**Il dialogo.** «Parla con lui» (`dialogo.ts`, `POST /autopiloti/:id/dialogo`): il supervisore risponde a parole sue.
Se il messaggio era un'istruzione, la trasforma in obiettivo, criteri o compiti e la porta alla chat a fine turno. Sul
PC, nella pagina e nell'app la «chat con lui» è ricomposta dall'archivio (`conversazione` in `shared/chat-autopilota.ts`).

**Il multi-chat esiste già, in forma base.**
- `tettoChat` va da 1 a 8 (`TETTO_CHAT_MAX` in `shared/autopilota.ts`) e **lo decide chi crea l'autopilota**.
- Con `tettoChat > 1`, all'avvio l'obiettivo viene scomposto una volta sola in un compito per posto
  (`componiPromptScomposizione`).
- `flotta.ts` (`pianificaFlotta`) apre le chat mancanti e chiude le finite. Le chat bloccate non occupano posti.

Tre limiti di questa forma:
- **tutte le chat lavorano nella stessa cartella**, quindi si pestano i piedi sugli stessi file;
- la scomposizione non si rivede mentre il lavoro va avanti;
- nessuno **rimette insieme** i risultati: ci sono solo i criteri globali.

# 2. Cosa gli manca per essere l'harness

Oggi l'autopilota vede **una cosa sola**: le chat che governa e i loro criteri. Il resto del programma non lo conosce.

## Conoscere le funzioni del programma

| Funzione | Oggi | Cosa gli servirebbe |
|---|---|---|
| **Stato delle chat** (lavora, aspetta, sceglie, spenta, guasta 0.34) | vede solo le sue, tramite hook | leggere `chatAperte` come `/api/stato`, per non aprire un doppione e per riusare una chat libera nella stessa cartella |
| **Coda condivisa** dei progetti | non la vede | accodare «dopo» invece di aprire subito; consumarla da coordinatore |
| **Domande** (`/api/domande`) | solo le sue | sapere quante cose aspettano già Nicholas, e non aggiungerne quando è sommerso |
| **Limiti del piano** (`/api/polso`, 5 ore e settimana, dalla 0.31) | non li vede | decidere quante chat aprire e quando rallentare (sezione 3) |
| **Altri computer** (battiti, posta) | non li vede | non lavorare su un progetto in mano a un altro PC; mandare un'azione a quel PC invece di aprire qui una chat in una cartella vuota |
| **Drive / testimone** | non lo vede | prendere o rispettare il testimone prima di scrivere |
| **Composizione** (workspace, finestre, riquadri) | solo «il workspace dove è nato» | mettere le sue chat in un workspace suo, senza riempire quello che Nicholas ha davanti |
| **Quaderno** | lo leggono le chat | scrivere lui il rapporto finale e rileggere le trappole note prima di dividere il lavoro |
| **Diagnosi «la chat non si apre»** (0.34) | non la vede | riprovare, o cambiare cartella e modello, invece di aspettare uno Stop che non arriverà |

In pratica serve **una «cassetta degli attrezzi» descritta**: un elenco di azioni con nome, parametri e cosa
fanno, che il supervisore può chiamare con una risposta JSON (come fa già con le decisioni). Il servizio la inoltra al
programma con lo stesso meccanismo delle consegne, e il programma la esegue con le funzioni che la pagina del telefono
usa già. Le rotte `/api/*` sono la base naturale: sono documentate, provate e già protette.

## Aprire, chiudere e guidare più chat — deciso da lui
Oggi il numero di chat lo sceglie Nicholas alla creazione. L'harness deve:
- **valutare** se il lavoro si divide: parti indipendenti per file o moduli, oppure una sola linea che non ha senso spezzare;
- **aprire** chat nuove a metà lavoro, non solo all'inizio;
- **chiudere** le chat finite o inutili;
- **riassegnare** un compito rimasto fermo a un'altra chat.

## Dividere il lavoro e rimettere insieme i risultati
- **Dividere.** Una scomposizione con dipendenze («B dopo A»), rivista a ogni tappa, non una lista fissa.
- **Rimettere insieme.** Unire il lavoro delle chat (merge dei rami, sezione 3), risolvere i conflitti con una chat
  dedicata, ripassare i criteri **sul risultato unito** e non solo su ciascun pezzo.
- **Rendere conto.** Un rapporto finale (nel quaderno) con cosa ha fatto ogni chat, quanto è costato e cosa resta aperto.

# 3. Come aprirebbe più chat

**Una cartella per chat.**
- **Progetti con git: `git worktree`.** Ogni sotto-chat lavora in `<progetto>.sierradeck-wt/<compito>`, sul ramo
  `ap/<id>/<compito>` partito dallo stesso commit. Niente file pestati, ogni pezzo si rivede da solo, e unire è un
  `git merge` misurabile. Le cartelle nascono fuori dal progetto (o in una sottocartella ignorata da git), e alla fine
  si tolgono con `git worktree remove`.
- **Progetti senza git: file separati.** Ogni compito dichiara i file che tocca, e l'autopilota rifiuta di dare lo stesso
  file a due chat. Per il resto si resta a **una chat alla volta**: nessun parallelo su file condivisi senza git.
- **Trappole da prevedere.**
  - Claude Code ricava lo slug della trascrizione dal percorso: ogni worktree è un «progetto» diverso per l'indice, per
    il Drive e per il testimone. Va segnato come figlio del progetto, o riempie l'elenco «Riprendi».
  - Le dipendenze (`node_modules`) vanno reinstallate in ogni worktree: tempo e disco.

**Un coordinatore con le sotto-chat.**
- Il supervisore dell'autopilota diventa **coordinatore**: tiene il piano, assegna i compiti, decide quando unire.
- Ogni sotto-chat ha il suo supervisore di giudizio (quello di oggi, uno per chat, 0.13) e risponde al coordinatore,
  non a Nicholas.
- Le domande delle sotto-chat passano prima dal coordinatore, che risponde se sa. Arrivano a Nicholas solo se
  bloccano davvero, già riassunte («3 chat chiedono la stessa cosa»).

**Un tetto sul numero di chat.**
- **Tetto duro**, scelto da Nicholas (sezione 4); oggi il massimo tecnico è 8.
- **Tetto morbido**, deciso dall'autopilota: quante parti indipendenti ci sono davvero, meno quelle bloccate. Non si
  apre mai una chat «per riempire il posto».
- Il totale conta anche le chat **non sue**: se Nicholas ne ha già 6 aperte, il posto è meno.

**Rallentare con i limiti del piano.** Legge l'ultimo polso (`limitiAggiornati`), perché i limiti sono del piano e non
della chat:

| Uso della finestra | Cosa fa |
|---|---|
| sotto il 60% | il tetto morbido pieno |
| 60–80% | niente chat nuove, le attive continuano |
| 80–95% | si scende a una chat, le altre si fermano a fine turno |
| oltre il 95% | si ferma tutto in modo pulito, con il motivo («finestra 5 ore al 96%, riparto alle 14:20») e **ripartenza automatica** all'azzeramento (`resettaIl`) |

Il **tetto settimanale** vale di più: una quota della settimana dedicata agli autopiloti (sezione 4) che non si supera.
Senza polso (chiave API a consumo, oppure nessuna risposta ancora) si resta a una chat, per prudenza.

**Il telefono mostra l'albero delle chat.**
- Nella scheda Lavori (app e pagina), il dettaglio diventa un albero: il coordinatore, e sotto ogni sotto-chat con il suo
  compito, lo stato (stessa parola e LED di `StatoChat`, 0.35), il ramo e i criteri.
- Toccando un nodo si apre la chat (`Apertura.apriChat`).
- In cima una riga di spesa: «3 chat · finestra 5 ore 64% · settimana 31%».
- Stessa struttura sulla scheda autopilota del PC.

# 4. Rischi e scelte che spettano a Nicholas

**Rischi.**
- **Consumo.** Otto chat in parallelo bruciano la finestra di 5 ore in fretta, e si fermano **anche le chat di
  Nicholas**, perché il piano è uno. È il rischio più concreto.
- **Conflitti e lavoro buttato.** Parti che sembravano indipendenti non lo sono, e il merge costa più del lavoro fatto.
- **Azioni irreversibili.** Con le funzioni del programma in mano, l'autopilota potrebbe chiudere chat altrui, cambiare
  workspace, portare cose dal Drive, pubblicare.
- **Rumore.** Più chat vogliono dire più domande. Il filtro del coordinatore deve funzionare, o la scheda Domande diventa
  inutilizzabile.
- **Disco.** Un worktree per chat, con le dipendenze installate in ognuno.

**Scelte che servono prima di cominciare** (le propongo con un valore di partenza prudente):

| Scelta | Proposta di partenza |
|---|---|
| Quante chat al massimo per autopilota, e in totale sul PC | 3 per autopilota, 6 in tutto contando anche le sue |
| Quanta parte del piano può spendere | fermarsi all'80% della finestra di 5 ore; al massimo il 50% della settimana per tutti gli autopiloti |
| Può fare commit? | sì, solo sui suoi rami `ap/…` |
| Può fare merge nel ramo principale? | no: propone il merge e aspetta il sì |
| Può fare push? | no |
| Può pubblicare (release, APK)? | **mai** senza un sì esplicito, per ogni release. È coerente con la regola che la pubblicazione la decide Nicholas |
| Cosa può fare senza chiedere | aprire e chiudere le **sue** chat, creare e togliere i suoi worktree, mettere in coda, leggere tutto |
| Cosa gli si vieta | toccare chat e autopiloti non suoi, cambiare il workspace davanti, «Porta qui» dal Drive, uscire dall'account, cambiare le preferenze, prendere il testimone da un altro PC, cancellare file fuori dai suoi worktree |
| Dove vede le sue chat | un workspace suo («Autopilota · nome»), non quello davanti |

# 5. Tappe

| Tappa | Cosa | Motivo | Costo stimato | Priorità |
|---|---|---|---|---|
| T0 | Nicholas fissa le scelte della sezione 4 | senza, ogni tappa dopo decide al posto suo | un colloquio | priorità **massima** (blocca le altre) |
| T1 | **Occhi**: il supervisore riceve a ogni giudizio un riassunto dello stato del programma (chat e stati, limiti del piano, domande aperte, altri PC sul progetto, testimone), in sola lettura | è la base di ogni decisione, e non rischia niente | 2–3 giorni: un «estratto» nel Gestore, spinto al servizio con i battiti; test puri | alta |
| T2 | **Freno sui limiti**: la tabella della sezione 3 applicata al `tettoChat` di oggi, con ripartenza all'azzeramento | protegge subito anche il multi-chat che già esiste | 1–2 giorni | alta |
| T3 | **Worktree per chat**: con `tettoChat > 1` su un progetto git, ogni chat nel suo worktree e ramo; merge proposto a fine lavoro; pulizia | toglie il difetto maggiore di oggi (chat che si pestano i piedi) | 4–6 giorni, di cui tanti su trappole di slug, indice e Drive | alta |
| T4 | **Cassetta degli attrezzi**: le azioni permesse (apri, chiudi, riusa chat; accoda; posta a un altro PC; scrivi nel quaderno) chiamabili dal supervisore, con la lista dei divieti applicata dal programma e non affidata al modello | è ciò che lo rende harness | 5–8 giorni: schema delle azioni, validazione, registro di ogni azione, test | media |
| T5 | **Coordinatore**: piano con dipendenze rivisto a ogni tappa; tetto morbido deciso da lui; domande delle sotto-chat filtrate e riassunte | «apre più chat quando la valutazione lo consiglia» | 5–7 giorni | media |
| T6 | **Rimettere insieme**: merge dei rami, chat dedicata ai conflitti, criteri ripassati sul risultato unito, rapporto nel quaderno | senza questo il parallelo produce pezzi, non un lavoro | 3–5 giorni | media |
| T7 | **Albero sul telefono e sul PC**: coordinatore → sotto-chat, stati, rami, spesa | vedere da lontano un lavoro diviso | 2–3 giorni sui tre lati (PC, pagina, app); APK nuovo | media |
| T8 | **Pubblicare con permesso**: una domanda «pubblico la X?» con il riassunto; solo dopo il sì esegue la procedura di [[pubblicare-una-release]] | chiudere il giro senza togliere la decisione a Nicholas | 2 giorni, e solo se Nicholas lo vuole | bassa |

**Ordine consigliato:** T0 → T1 + T2 → T3 → T4 → T5 + T6 → T7 → (T8). Dopo T3 il multi-chat di oggi è già utilizzabile
senza rischi grossi. T4–T6 sono il salto vero verso l'harness, e si possono fermare in qualsiasi punto senza lasciare
niente a metà.

Vedi anche [[autopilota-sezione-chat-in-alto]], [[autopilota-dialogo]], [[supervisore-uno-per-chat]],
[[consumi-e-limiti-del-piano]], [[coda-condivisa-comandi]], [[2026-09-30-analisi-app-android]].


---

# 6. Scelte fissate da Nicholas (30/09) — sostituiscono la sezione 4

1. **Numero di chat**: lo decide il modello in base all'utilità del lavoro (quante parti davvero indipendenti ci
   sono). Nessun tetto scelto da Nicholas: resta solo il **tetto tecnico di sicurezza** `TETTO_CHAT_MAX = 8`. Il campo
   «Chat in parallelo» della finestra di creazione è stato tolto; `tettoChat` passato dalla rete è ignorato.
2. **Consumo**: lo governa il **freno** sui limiti del piano — 60 / 80 / 95 % della finestra di 5 ore, e le stesse soglie
   sulla settimana (vince la finestra peggiore). Senza limiti letti: una chat sola.
3. **Pubblicazione per progetto**, scelta alla creazione: **«beta: pubblica sempre»**, **«stabile: chiede prima»**
   (predefinita), **«versione unica: decide il progetto»**. Se il progetto **va sul cloud** (spunta alla creazione) o ha il
   cloud **attivo** (remoto git, script di pubblicazione/deploy, file di deploy riconoscibili), l'autopilota fa tutto da
   solo: commit, merge dei suoi rami, push, pubblicazione secondo la regola. Senza cloud: commit e unione, niente push.
4. **Divieti fatti rispettare dal programma** (non dal modello): chat e autopiloti non suoi, «Porta qui», uscire
   dall'account, cambiare le preferenze, cancellare file fuori dalle sue cartelle.
5. **Domande come chat**, sul PC, nell'app e nella pagina, con la stessa logica e gli stessi testi.
6. T8 (pubblicare) è diventata la regola per progetto del punto 3.

# 7. Cosa è stato implementato (0.36.0), tappa per tappa

Commit locali: `ba788ff` (copia/incolla), `1e41bb3` (regole pure), `a1cdad6` (servizio), `77ed80c` (Domande e albero
PC/pagina), `9886d35` (app), più quello finale con versione, novità e quaderno. **Niente pubblicato**: né push, né release, né APK.

| Tappa | Dove | Test |
|---|---|---|
| **T1** stato del programma in sola lettura | Il Gestore spinge ogni 10 s `POST /stato-programma` (`inviaStatoProgramma` in `main/index.ts`: chat e stati, limiti da `limitiAggiornati`, domande in attesa, progetti e code, altri PC). Il servizio lo tiene in memoria (`coordinatore.ts` → `leggiStatoProgramma`) e lo mette nel prompt del supervisore (`riassuntoProgramma`, sezione «Stato del programma»). | `divieti-coordinatore.test.ts`, `server.test.ts` («le mosse…» controlla il prompt) |
| **T2** freno | `shared/harness.ts` → `frenoDaiLimiti`, `quanteChat`. Nel servizio: all'avvio (≥95% → `sospeso` con `pausaLimitiFinoA`), a ogni fine turno (chat oltre il tetto → stato **`pausa`**), e ogni minuto `rispettaFreno` (riprende le chat in pausa e gli autopiloti fermi per i limiti, apre i compiti in coda). Il guardiano del silenzio salta le chat in pausa. | `harness.test.ts`, `server.test.ts` (pausa all'85%, fermo al 97%) |
| **T3** una cartella per chat | `autopilot-host/worktree.ts`: worktree in `<progetto>.sierradeck-wt/<ap>-<chat>` sul ramo `ap/<ap>/<chat>`; `ChatGovernata.cartella/ramo`, `Autopilota.ramoBase`. La consegna fa nascere la chat nella sua cartella (`nel-mosaico.ts`), il primo messaggio spiega dove lavora (`regoleDiConsegna`). A fine turno il **programma** fa commit del worktree e lo unisce nel ramo principale; conflitto → `merge --abort` e la chat riceve l'istruzione di riallinearsi. Senza git: una chat sola. | `worktree.test.ts` (git vero: crea, salva, unisce, conflitto, pulizia, cloud) |
| **T4** azioni con divieti | `autopilot-host/divieti.ts`: **hook PreToolUse** (`/hook/pretool`, `hook-autopilota.ts`) sui comandi Bash/PowerShell delle chat governate → nega cancellazioni fuori dalle cartelle dell'autopilota (e della cartella di lavoro intera) e le chiamate alle rotte vietate; il blocco finisce nel diario. **Mosse del supervisore** (`mosse` nel JSON: `apriChat`, `chiudiChat`, `quaderno`) giudicate da `giudicaMossa`: vietate e sconosciute rifiutate e annotate. | `divieti-coordinatore.test.ts`, `server.test.ts`, `hook-autopilota.test.ts` |
| **T5** coordinatore | Scomposizione chiesta al supervisore fino al tetto tecnico (`componiPromptScomposizione`), chat aperte dentro il freno; `chiudiChat` libera il posto e apre il compito dopo; **domande gemelle** di chat sorelle agganciate a quella già aperta (`domandaGemella`; il registro accetta più attese per domanda). | `server.test.ts` («le domande gemelle…») |
| **T6** unione dei risultati | A lavoro finito: commit e unione di tutti i rami, criteri **ripassati sul risultato unito**, conflitti rimandati alle chat, worktree tolti; poi push (con il cloud) e pubblicazione secondo la regola (`pianoPubblicazione`: beta → istruzione di pubblicare; stabile → domanda «Pubblico adesso?» nelle Domande, sì/no anche in ritardo; unica → la regola del progetto). | `server.test.ts` (beta, stabile sì/no, senza cloud), `harness.test.ts` |
| **T7** albero delle chat | `alberoChat` (shared) → `/api/autopilota` porta `albero`; PC `AlberoChat.tsx` nella scheda (e ramo/pausa nel diario), pagina `alberoHtml`, app `RigaAlbero` in Lavori. | `harness.test.ts`, `client-rotte.test.ts`, `client-pagina.test.ts`, `HarnessAppTest.kt` |
| **Creazione** | PC `PannelloAutopiloti.tsx` (regola + «va sul cloud», spiegazione del freno e dei divieti), `validaNuovoAutopilota`, `/api/autopilota/crea` (telefono), app `Delega` e pagina «Affida». Il cloud riconosciuto si scrive in `Autopilota.cloud` all'avvio. | `validation.test.ts`, `server.test.ts` |
| **Domande come chat** | `shared/domande-conversazioni.ts` → `conversazioniDomande` (autopilota con domanda: la sua storia + domanda in fondo, risposta con `/api/rispondi`; autopilota **pronto**: si parla con lui via dialogo; chat su una scelta: la domanda con le opzioni; chat ferma; quello che mandi resta nel filo — `inviati` in `client-rotte.ts`). `/api/domande` porta `conversazioni`. PC: nuovo tasto **Domande** nella console (`PannelloDomande.tsx`, IPC `domande:chiama` limitato a 5 rotte, stessa istanza delle rotte del telefono); pagina `vistaConversazioni`; app `Conversazioni.kt`. | `domande-conversazioni.test.ts`, `client-rotte.test.ts`, `client-pagina.test.ts`, `HarnessAppTest.kt` |
| **Copia e incolla** | Cause: `body { user-select: none }` non riaperto nella chat con l'autopilota; nessun menu Modifica con i ruoli; nessun menu del tasto destro fuori dal terminale; la pagina ridisegnava cancellando la selezione; nell'app nessun `SelectionContainer`. Correzioni: `menu-modifica.ts` (menu applicazione + contestuale), CSS `.chatap__flusso`/`.diario__lato`, `selezioneAttiva` nella pagina, `SelectionContainer` nell'app. | `copia-incolla.test.ts`, `HarnessAppTest.kt` |

# 8. Cosa resta aperto

- **Provare sul campo** con un progetto vero: una flotta con worktree, un conflitto, il freno che scende e risale, una
  pubblicazione beta e una stabile. I test usano un git vero per i worktree ma un git finto dentro il servizio.
- **`node_modules` nei worktree**: ogni copia va reinstallata; costa tempo e disco. Da valutare un collegamento condiviso.
- **Le copie nell'indice**: i worktree sono cartelle diverse per Claude Code (slug diverso), quindi le loro conversazioni
  compaiono come progetti a sé in «Riprendi». Da raggruppare sotto il progetto padre.
- **La cartella di lavoro sporca**: l'unione avviene nella cartella di Nicholas sul ramo principale; se lui ha modifiche
  sugli stessi file, `git merge` fallisce e si rimanda (annotato nel diario). Alternativa da decidere: un worktree di
  integrazione separato.
- **Il commit nella chat singola** (senza worktree) lo fa la chat su istruzione, non il programma: il programma non fa
  commit nella cartella di Nicholas con dentro i suoi cambi.
- **La modale delle domande sul PC** (`DomandaModale.tsx`) c'è ancora accanto al nuovo tasto Domande: da decidere se
  toglierla (Nicholas voleva le domande «non bloccanti»).
- **Azioni del supervisore sul resto del programma** (mettere in coda, scrivere a un altro PC): non ancora fra le mosse;
  coda e altri PC li vede ma non li tocca.
- **Senza limiti letti** (chiave API a consumo) la flotta non parte mai: una chat sola per prudenza. Da rivedere se si
  lavora a consumo.
- **Una domanda gemella risposta in ritardo** riprende solo la prima chat che l'aveva posta; le altre ripartono dal freno
  o al loro prossimo giro.
