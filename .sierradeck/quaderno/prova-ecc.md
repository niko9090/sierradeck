---
titolo: "Prova di ECC (plugin ecc@ecc 2.2.3) nella 0.79.0"
quando: 2026-10-17T23:30:00+02:00
tag: ["ecc", "prova", "revisione", "hook", "per Nicholas"]
---

Decisa da Nicholas il 17/10: «comincia a usarlo qui, così cominciamo a testare». Qui il registro per il rapporto.

## Hook di ECC spenti solo per SierraDeck (reversibile)
- Nel campo `env` di `.claude/settings.local.json`, che git ignora (`~/.config/git/ignore`), con `ECC_HOOKS_ENABLED=false` e `ECC_GATEGUARD=off`.
  - `ECC_HOOKS_ENABLED=false` è l'interruttore generale di `scripts/lib/hook-flags.js`. Tutti i 27 hook passano da `isHookEnabled` (run-with-flags, i dispatcher, lifecycle-bootstrap).
  - `ECC_GATEGUARD=off` è una seconda sicurezza per il «Fact-Forcing Gate».
- Il file è in tre posti: il progetto principale e le due cartelle di lavoro dei rami (`a-c`, `ap-f1e631f5-c-1`).
- **Trappola:** ogni cartella di lavoro di un ramo (`SierraDeck.sierradeck-wt\…`) è una radice a sé e legge solo il proprio `.claude/settings.local.json`.
  - Una cartella creata d'ora in poi non riceve il file da sola: va copiato a mano.
  - In alternativa SierraDeck potrebbe copiarlo quando crea la cartella. È un cambio di codice, da decidere con Nicholas.
- Per tornare indietro basta cancellare quel file. `~/.claude/settings.json` e gli altri progetti non sono stati toccati.

**Verifica**
- Una chat nuova (`claude -p`) nel progetto e nella cartella di c-1 vede `ECC=false GG=off`, e il primo comando non è bloccato. Prima di copiare il file nella cartella di c-1 vedeva `ECC=` vuoto.
- `isHookEnabled` dà 13/13 hook accesi senza impostazione e 0/13 con l'impostazione.
- **Non provato a confronto:** in una chat `-p` il GateGuard non blocca nemmeno con gli hook accesi, quindi da lì la differenza non si vede. Il blocco che conta è quello delle chat interattive.
- Claude Code avvia comunque i processi degli hook (circa 1 s ciascuno all'avvio della sessione), che escono subito senza fare niente.
- Nelle chat `-p` di questa macchina non c'è il tool Bash, con o senza il file: c'è solo PowerShell. Non dipende da ECC.

## Agenti usati

| Agente | Ramo | Tempo | Token | Difetti veri | Falsi allarmi / scelte volute |
|---|---|---|---|---|---|
| ecc:kotlin-reviewer | c-1 | 1 min | 32 k | 1 importante (rotte lente) + 1 per dopo | 2 |
| ecc:silent-failure-hunter | c-1 | 2 min | 60 k | 4 | 4 |
| ecc:typescript-reviewer | c-1 | 3 min | 89 k | 3 (in parte uguali a quelli sopra) | 5 |

ecc:react-reviewer non è stato usato: c-1 non tocca l'interfaccia. Va usato sul ramo dell'interfaccia (c-3).

### Difetti veri (verificati da me nel codice)
1. **Le rotte nuove non sono fra le rotte lente** (kotlin-reviewer).
   - Dove: `src/main/pc-remoto.ts:147`, `ROTTE_LENTE`. Le sei `/api/chat/gestione/*` hanno l'attesa normale di 4 s.
   - Scenario: «Spazio delle chat» misura tutte le chat del PC remoto, ed «Elimina» o «Svuota» via ponte superano i 4 s. Il ponte risponde 504 mentre il PC remoto continua il lavoro, quindi l'utente riprova. È lo stesso difetto del trasloco del 12/10.
   - Sull'app, per quando le chiamerà: `Api.ROTTE_LENTE`, `Api.kt:648`. Il 17/10 alle 23:41 l'interfaccia (c-3) l'ha già sistemato: `Api.kt:686` ha `spazio`, `azione` e `svuota`. Lato PC (`pc-remoto.ts`) resta da fare.
   - L'avevo mancato io nelle due revisioni precedenti.
2. **`tolteDaQui` rilegge `recupero-chat.json` dal disco a ogni percorso** (typescript-reviewer).
   - Dove: `src/main/gestione-chat.ts:453`. Lo chiamano l'arrivo (`sincronia.ts:1592`) e «Ripristina» (`sincronia.ts:1389` → `incrementale.ts:570`) per ogni voce del manifesto del Drive.
   - Con migliaia di file di chat sono migliaia di letture sincrone a ogni arrivo. Serve un insieme in memoria aggiornato da `scriviRecupero`.
3. **Se `statoDi` fallisce, la chat passa per libera** (silent-failure-hunter).
   - Dove: `src/main/gestione-chat.ts:217` e `:246`. `.catch(() => ({ sessione }))` dà uno stato vuoto, che si elimina o archivia.
   - È contrario a «nel dubbio non si tocca». Va rifiutato con un motivo.
4. **L'esito della scrittura dei registri non si guarda** (silent-failure-hunter + typescript-reviewer).
   - Dove: `scriviJsonAtomico` restituisce `false` senza sollevare un errore (`src/shared/scrittura-atomica.ts`), e `scriviRecupero` / `scriviArchiviate` (`gestione-chat.ts:152-156`) lo ignorano.
   - Scenario: i file sono già nel recupero ma il registro non si scrive (disco pieno, antivirus). La chat risulta «eliminata» ma non si può più ripristinare, e nessun giro la svuota.
   - Raro, ma è l'unico caso in cui si perde davvero una chat.

### Veri ma minori (da sistemare quando capita)
- Elimina accetta una chat senza file (indice vecchio, o doppio clic): resta una voce da 0 file. L'avevo già segnalato io.
- `potaRecupero` con `slice(-2000)` può scartare voci ancora nel recupero.
- Il rollback silenzioso in `spostaNelRecupero` e in `ripristinaDalRecupero`.
- Nessun try/catch per singola chat nel ciclo di `azione`.
- `giro()` con `.catch(() => undefined)` e nessun log (`index.ts`).
- Lo svuotamento del Drive perde il messaggio d'errore.
- Lo spostamento fra due dischi (EXDEV) non ha ripiego. L'avevo già segnalato io.
- Elenchi `spazio`, `archiviate` e `recupero` mostrano i titoli delle chat col PIN.

### Falsi allarmi o scelte volute
- «Il gettone non protegge dai client remoti»: è la conferma forte chiesta. Un telefono o un PC abbinato è fidato, e la parola la scrive la persona nell'interfaccia.
- «`relativo` con `..` nel registro»: serve poter scrivere `recupero-chat.json` in locale, quindi non è un vettore reale.
- La finestra di 3 s nella cache degli autopiloti, la chat aperta in un terminale esterno, una chat in due slug, «Archivia» di un UUID che l'indice non conosce: casi teorici e senza danno.
- Il fallback «servizio autopiloti muto → governata»: voluto e corretto (lo dice anche l'agente).
- Le rotte con un solo metodo HTTP accettato: il ponte e la pagina usano già quel metodo, quindi non è un difetto.

## Giudizio e costo
- **Utile.** I tre agenti in parallelo hanno impiegato circa 3 minuti di orologio e circa 180 k token in tutto. Hanno trovato 2 difetti importanti che le mie due revisioni avevano mancato (rotte lente, letture ripetute del registro).
- **Rumore.** Circa metà dei punti sono teorici o scelte volute: ogni risultato va verificato nel codice prima di correggere.
- Le righe citate dal silent-failure-hunter erano a volte approssimate (lo dice lui stesso).
- Il kotlin-reviewer è il più economico e quello che ha reso di più, perché guarda gli accoppiamenti fra PC e app.

## Seconda revisione: tutta la 0.79.0 (motore c-1 + interfaccia c-34)

17/10 sera. La chat «Rilascio · interfaccia» ha usato i quattro agenti chiesti sul diff intero della 0.79.0, `git diff 4f9b4e6 4299bf6`: motore, interfaccia del PC, pagina del telefono e app.

**Come si lanciano.** In una chat di SierraDeck i tipi `ecc:*` non si caricano come sotto-agenti (`Agent type 'ecc:typescript-reviewer' not found`). Funzionano invece come sessione a parte, con soli strumenti di lettura:

```
claude -p "<incarico>" --agent ecc:<nome> --output-format json \
  --allowedTools Read Grep Glob "Bash(git diff:*)" … --disallowedTools Edit Write NotebookEdit
```

- I quattro sono partiti in parallelo e l'ultimo ha finito dopo 4 min 33 s.
- Durata, costo e modello vengono dal JSON. Il modello è sempre `claude-sonnet-5-5`.
- Due agenti hanno detto di non avere la shell per `git diff`, perché qui il `-p` ha solo PowerShell, e hanno letto i file interi.

| Agente | Parte rivista | Segnalazioni | Difetti veri | Falsi allarmi / scelte volute | Durata | Costo |
|---|---|---|---|---|---|---|
| ecc:typescript-reviewer | motore, rotte, Drive | 13 | 10 | 3 | 3 min 15 s | $0,48 |
| ecc:react-reviewer | PC (React) + pagina | 10 | 9 | 1 | 4 min 1 s | $0,55 |
| ecc:kotlin-reviewer | app | 6 | 5 | 1 | 3 min 57 s | $0,53 |
| ecc:silent-failure-hunter | tutto | 18 | 12 | 6 | 4 min 33 s | $0,69 |
| **Totale** | | **47** | **36** (circa 30 diversi: 5 doppioni fra agenti) | **11** | 4 min 33 s di orologio | **$2,25** |

Ogni segnalazione l'ho verificata io sul codice prima di correggere.

### Difetti veri, tutti corretti con test

**Motore** (`src/main/gestione-chat.ts`)
- Se lo stato di una chat non si leggeva, la chat passava per libera e si eliminava. Ora si rifiuta con «non riesco a sapere se è in uso».
- Fra la misura (lenta) e lo spostamento la chat poteva riaprirsi. Ora lo stato si richiede subito prima di spostare.
- Due «Elimina» insieme (doppio tocco, PC e telefono) creavano due voci nel recupero. Ora le azioni vanno in fila.
- Un id in maiuscolo contava come un'altra chat e non chiudeva quella aperta. Ora si normalizza in minuscolo.
- La scrittura del registro poteva fallire mentre la risposta diceva «fatto»:
  - Elimina ora rimette i file al loro posto;
  - Archivia ora dice di no.
- Un registro illeggibile veniva preso per vuoto e poi coperto. Ora si mette da parte come `.illeggibile-<ora>` e lo si dice.
- Se il rollback non riusciva, la risposta diceva comunque «Niente è cambiato». Ora dice quali file sono rimasti e lo scrive nel registro, sia nello spostamento sia in «Ripristina».
- «Ripristina» seguiva qualsiasi percorso scritto nel registro. Ora solo quelli dentro il recupero e dentro la cartella di Claude.
- Svuota svuotava sul Drive anche le copie di chat rimaste nel recupero del PC. Inoltre ingoiava l'errore del Drive e diceva `ok`.
- Dopo un «Ripristina» il messaggio diceva «Anche la copia sul Drive è tornata» a priori. Ora riporta quello che dice il Drive.
- Una chat dell'indice senza più file diventava una voce vuota nel recupero.
- `potaRecupero` con `slice(-2000)` poteva scartare voci ancora nel recupero.
- Il registro veniva riletto dal disco per ogni file del Drive. Ora resta in memoria finché il file non cambia: era il punto 2 della prima revisione.

**Drive** (`src/main/spazio-drive.ts`)
- Svuota diceva «X liberati» e segnava la pulizia come svuotata anche se il Drive aveva rifiutato i file. Ora non la segna e il giro riprova.
- Il fallimento dell'annullamento di una pulizia era muto. Ora resta una riga «ATTENZIONE» nel registro.
- Gli id delle pulizie erano al millisecondo. Ora sono unici.

**Rotte**
- Le sei rotte della gestione non erano fra le rotte lente del ponte, né sul PC (`pc-remoto.ts`) né per «ripristina» nell'app. Era il punto 1 della prima revisione, ancora aperto.
- Uno Svuota riuscito in parte arrivava come errore 409. Ora arriva come esito.
- Il tetto di 500 chat per richiesta tagliava «Scegli tutte».
- `giroChat` ingoiava gli errori.

**PC (React)**
- Invio nel campo SVUOTA mandava più richieste.
- Esc chiudeva tutta «Riprendi una conversazione» con la conferma aperta. Ora la conferma ascolta in cattura.
- Le letture fuori ordine mescolavano dati vecchi e nuovi.

**Pagina del telefono**
- Spuntare una chat non aggiornava il totale né i tasti, perché la casella prende il fuoco e il ridisegno veniva saltato. Per la stessa causa la conferma non cambiava con «anche dal Drive».
- La parola SVUOTA si perdeva al primo ridisegno.
- Svuota, «Continua» e Ripristina partivano due volte con un doppio tocco.
- Una conferma di Elimina poteva arrivare tardi, dopo aver cambiato pannello.

**App**
- Le voci della gestione comparivano anche con un PC più vecchio della 0.79.0.
- Elimina si poteva confermare prima di sapere quanto spazio libera.
- «Continua» con un doppio tocco chiedeva due gettoni.
- Se un elenco non arrivava, quella scheda restava su «Leggo…» per sempre. Ora c'è «Riprova».

### Falsi allarmi o scelte volute

| Agente | Segnalazione | Perché non è un difetto |
|---|---|---|
| typescript-reviewer | Cache degli autopiloti di 3 s | È voluta. Una chat governata è anche aperta, e quel controllo è fatto subito. |
| typescript-reviewer | `readdirSync` di `todos` per ogni chat | È una questione di prestazioni, non un comportamento sbagliato. |
| typescript-reviewer | Titoli delle chat col PIN negli elenchi | In tutto il programma il PIN nasconde il contenuto, non il titolo. I client sono dispositivi abbinati. |
| react-reviewer | La selezione si azzera anche dopo un rifiuto | È una scelta di interfaccia. |
| kotlin-reviewer | Testo del rifiuto senza motivo | Il motore dà sempre un motivo. |
| silent-failure-hunter | Titolo «Fatto» con il Drive fallito | Il testo lo dice. |
| silent-failure-hunter | «Chiudi» locale del riquadro | La chiusura locale è sincrona. |
| silent-failure-hunter | Voci svuotate oltre le 2000 | Il limite è voluto e il caso è teorico. |
| silent-failure-hunter | `byteDi` restituisce 0 su un errore | È una stima. |
| silent-failure-hunter | Il ripiego della stima dello spazio | Il testo resta onesto. |
| silent-failure-hunter | `ok = true` predefinito nell'app | Il PC lo manda sempre. |

### Compilazione rotta: non è capitato

La compilazione è sempre rimasta verde: `npm run typecheck`, e `gradle testDebugUnitTest assembleDebug` con codice d'uscita 0 letto direttamente. ecc:build-error-resolver ed ecc:kotlin-build-resolver quindi non sono serviti e non li ho lanciati.

### Controlli dopo le correzioni

- `npm test`: 4145 test passati, 2 saltati.
- `npm run typecheck`: nessun errore.
- gradle: verde.
- La guardia delle cancellazioni è rispettata.
- Nel diff non ci sono dati privati.

### Giudizio: vale la pena tenerlo?

**Sì, per la revisione.** Per $2,25 e meno di 5 minuti hanno trovato una trentina di difetti veri, diversi fra loro, che due revisioni mie e un collaudo con clic veri avevano mancato. Alcuni erano seri: una chat eliminata con lo stato illeggibile, la scritta «liberati» senza aver liberato niente, il Drive svuotato per chat rimaste. Circa un quarto delle segnalazioni è rumore o scelta voluta, quindi ogni punto va verificato nel codice. silent-failure-hunter e react-reviewer hanno reso di più. Gli hook vanno tenuti spenti finché Nicholas non dice sì.

## Terza revisione: interfaccia c-47 + Panoramica c-49 (18/10 notte)
Ramo `ap/ap-f1e631f5/c-4`, diff da `4f7afaa`. Due agenti in parallelo come sessione a parte (`claude -p --agent …`, solo Read/Grep/Glob), diff salvato in un file perché il `-p` qui non ha la shell.

| Agente | Parte | Segnalazioni | Difetti veri | Falsi allarmi / voluti | Durata | Costo |
|---|---|---|---|---|---|---|
| ecc:typescript-reviewer | PC, pagina, shared, servizio | 10 | 6 | 4 | 2 min 39 s | $0,37 |
| ecc:kotlin-reviewer | app | 4 | 3 | 1 | 2 min 39 s | $0,26 |

**Veri, corretti con test:**
- `.pan2-dialogo` con `overflow: hidden` tagliava il campo del primo messaggio (workspace senza autopilota): ora `hidden` solo con `:has(.chatap--pronta)`.
- Pagina: a ogni rilettura (10 s) «Elimina dal PC» si riaccendeva finché il PC non rispondeva, e ogni rilettura ridisegnava il pannello. Ora la misura di prima resta e si ridisegna solo se il motivo cambia.
- Riassunto «Al lavoro» senza tetto: con 8–10 chat schiacciava il resto (PC) o la conversazione (app). PC 30vh con scorrimento; pagina e app 3 righe + «e altre N»; app aperta in 220 dp che scorrono.
- Nelle viste senza Panoramica (colonna dell'autopilota, PC 0.78) la riga corta e quella tecnica comparivano tutte e due: lì le righe corte non si mostrano.
- Elimina toccato prima che arrivasse il motivo (PC, pagina, app): si apriva la conferma e il rifiuto arrivava solo dopo. Ora niente conferma, il tasto si spegne con il motivo.
- La frase di «chiede-te» suonava male: «Revisione: rimanda di nuovo «…» di Sviluppo, decidi tu come andare avanti.».
- App: `oraLocale` falliva con un offset («+02:00»): ora anche quello.

**Falsi allarmi o voluti:** il fuoco automatico «ruba le scorciatoie» (no: sono in ascolto in cattura sulla finestra); righe della pagina apribili senza riquadro (sulla pagina sono sempre chat aperte); ore locali diverse fra PC e telefono in fusi diversi (voluto); `escluse.firstOrNull()` con una sessione sola (corretto).

**Limite noto, non corretto:** il «da quanto» della rotta `/api/panoramica` parte dalla prima volta che qualcuno guarda (la rotta non gira se nessuno guarda); il PC usa il suo, dai segnali. Dopo un riavvio i due possono differire di qualche minuto.

**Giudizio:** anche qui utile: 9 difetti veri per $0,63 e meno di 3 minuti, che la prova con clic veri non aveva fatto vedere (casi con molte chat, PC vecchi, tocchi veloci).

## Quarta revisione: dashboard dell'autopilota c-50 (18/10 notte)
Ramo `ap/ap-f1e631f5/c-5`, diff della dashboard prima dell'unione con c-4. Agente lanciato dalla chat (Agent tool), sola lettura.

| Agente | Parte | Segnalazioni | Difetti veri | Falsi allarmi / voluti | Durata | Token |
|---|---|---|---|---|---|---|
| ecc:typescript-reviewer | shared, PC, pagina, app | 5 | 4 (1 medio, 3 piccoli) | 1 (ordine delle regex: è solo un'etichetta) | 3 min | 69 k |

**Veri, corretti con test:**
1. **Medio.** Un segnale perso (Stop mai arrivato) lasciava «fa girare i test · da 3 h» per sempre. Ora, dopo 10 minuti di silenzio: «nessun segnale da N min», e niente «adesso».
2. Il permesso si raccontava dalla descrizione scritta dalla chat («esegue un comando»). Ora si racconta dal comando.
3. Nell'app «da N min» avanzava solo quando cambiavano i dati.
4. Sul PC ogni segnale faceva subito una rilettura via IPC: ora aspetta mezzo secondo di quiete.

Ha anche verificato, senza trovare problemi:
- il cambio del matcher PreToolUse: non tocca `statoDaSegnali` né l'hook dei divieti dell'autopilota;
- l'IPC `segnali:di`, con l'input controllato;
- le regex sul diario, uguali ai testi veri (poi tolte nell'unione con c-4);
- l'assenza di backtick e backslash nella pagina.

**Hook di ECC accesi nella cartella di lavoro di c-5.** È la trappola già scritta sopra: il worktree nuovo non aveva `.claude/settings.local.json`.
- Il «Fact-Forcing Gate» ha bloccato una decina di volte la prima scrittura di un file e ogni comando che cancella (`git rm`, la cartella della copia di prova, perfino un testo che contiene quelle parole). Ogni volta chiedeva di ripetere i fatti.
- Costo: qualche decina di secondi e un po' di testo per blocco. Nessun errore evitato: erano tutte azioni volute.
- Conferma che, se Nicholas vuole gli hook spenti, il file va copiato anche nei worktree creati da SierraDeck. Meglio ancora: SierraDeck lo copia da solo quando crea la cartella (da decidere).

**Giudizio:** utile anche su un lavoro piccolo. Il difetto medio (Stop perso) la prova dal vero non l'avrebbe mostrato.

