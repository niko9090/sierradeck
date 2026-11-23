# Rapporto: il PC in Glos che non lavora (k-197a, 23/11)

In breve: **non sono riuscito a leggere i log e i lavori del PC in Glos**. Ho però trovato fatti misurati sul suo stato, e dicono che la 0.116.0 **non basta da sola** e che là **non è ancora installata**. La causa vera (unioni scadute o altro) resta da confermare con i suoi registri.

## 1. Cosa ho provato e com'è andata

| Tentativo | Esito |
|-----------|-------|
| Cartella principale del PC di riferimento `E:\Users\nikof\Documents\SierraDeck` (errori-arrivati, lotti, controlli, `.recupero/<mittente>/`, rapporti del controllo PC) | **Non raggiungibile.** Questo agente gira sul PC «DESKTOP-O2DITVE» (Aiutante). Qui `E:` esiste come lettera ma è vuota (nessun disco: `Test-Path E:\Users` è falso). Nessuna condivisione di rete verso PC-Fisso: le unità di rete sono solo `Z:` = `\\ServerDSM\firmware` (firmware, non SierraDeck). Nella mia copia non c'è `.sierradeck/errori-arrivati/`. |
| Canali del programma per chiedere log e stato a un altro PC (`pc-remoto.ts` `chiama`, `/api/errori`, `/api/errori/arrivati`, `/api/salute`, `/api/coda`, rete Aiutante in `src/aiutante/rete.ts`) | **Non usabili da un agente.** Ogni chiamata fra PC è firmata con la «chiave di casa», derivata dalla chiave maestra che sta nel portachiavi del programma. Non l'ho estratta né voglio farlo: sono dati privati e il compito dice solo letture. Inoltre l'Aiutante risponde solo a `/api/pc`, aiuto e azioni, non a errori/coda/piano; per `errori` e `rapporto-lavori` dice che «vanno al PC di sviluppo». Nel codice non esiste una rotta che dia da un altro PC «registro unioni e criteri» o «piano di BG4»: `/api/errori`, `/api/salute`, `/api/coda` sì, il piano del workspace no. |
| Raggiungibilità di rete del PC in Glos | Porta 47640 sull'indirizzo Tailscale 100.113.83.97: **risponde (connessione aperta)**. Sulla LAN 192.168.68.100: no (è un'altra sede, normale). Non ho mandato altro. |
| Dati che il mio PC ha già in locale sul PC in Glos | **Sì, i battiti** ricevuti dal Drive (`%APPDATA%\SierraDeck Aiutante\pc-altrui.json`) e il registro dell'Aiutante. Quelli sotto. |

## 2. Cosa risulta sul PC in Glos («fisso_scrivania_glos», host DESKTOP-G24D499, id 5a3b43db6de2)

Dal battito delle 18:15 UTC del 23/11 (fresco: acceso e raggiunto dal Drive):

- **Versione installata: 0.115.1.** La 0.116.0 con le correzioni delle unioni non c'è ancora (è nel ramo principale, non pubblicata). Tutto quello che segue gira quindi con il codice di prima.
- **Acceso e collegato.** Il suo SierraDeck è in ascolto (`client.inAscolto: true`) e bussa a questo Aiutante ogni 10 minuti circa: l'ultima volta alle 18:15:47 UTC. Nel registro dell'Aiutante risulta collegato ogni 10 minuti anche il 13/11: non ci sono buchi di collegamento visibili da qui, quindi **non è spento e non è fuori rete**.
- **Il PC è molto carico.** Misura del battito: 4 processori, **carico 94%**, memoria libera 2.762 MB su 8.159 MB (66% usata). Il solo SierraDeck usa poco (CPU 3,2%, 634 MB, 5 processi): il carico viene da altro (suite, compilazioni, Claude Code delle chat).
- **Posti per i comandi pesanti: 2 attivi, 0 in fila, motivo «minimo»**: la regolazione ha portato i posti al minimo perché il PC è al limite.
- Workspace elencati: BG4, visitafacile, fionda apl, video installazione, casa-rodriguez, Gestore_sessioni_ClaudeCode, Home assistant, PROGRAMMA VECCHIO SARDI, Server_home, Ship_game, Upcolori, Desk_remoto #2, SierraDeck. Cartelle e chat sono su `E:\Documents\...` e `E:\obsidian\...` (la sede di BG4 è `E:\Documents\BG4\PROGRAMMA VECCHIO SARDI`).
- Confronto con gli altri PC dello stesso battito: PC-Fisso 41% di carico (24 GB), Portatile Asus 5% (16 GB). Il PC in Glos è il più piccolo (4 processori, 8 GB) ed è l'unico al limite.
- Altri PC di versione: PC-Fisso 0.115.0 e Portatile Asus 0.115.0, quindi anche il PC di riferimento è indietro di una versione.

Quello che **non** ho: storico errori, registro delle unioni e dei criteri di BG4, coda e piano di BG4, rapporti del controllo, lotti, `.recupero`. Per questo la causa **non è misurata**.

## 3. La causa: cosa si può dire e cosa no

Misurato:
1. Il PC è acceso, raggiungibile e batte: non è un problema di rete o di PC spento.
2. Gira la 0.115.1, senza le correzioni di unioni scadute e unioni veloci.
3. È al 94% di carico con 8 GB: ogni prova pesante (suite intera, `gradle`, `pytest`) lì è molto più lenta che sul PC di sviluppo.

Non misurato (serve il suo registro): se le unioni di BG4 scadono davvero, quante volte, se la fila è ferma, se l'autopilota di BG4 è fermo. Il rapporto k-191d del 23/11 (`rapporto-unioni-lente-23-11.md`) dice già che su questo PC di sviluppo non ci sono scadenze, che la prova dei criteri è il costo dominante (media 226 s) e che su BG4 il problema probabile è la suite lenta unita al carico (colli 3 e 4). Il battito conferma che a Glos le condizioni sono quelle peggiori. È l'ipotesi più forte, non una prova.

## 4. Confronto con la 0.116.0

**Non posso scrivere «risolto dalla 0.116.0».** Scrivo: **«servono queste altre correzioni» e, prima di tutto, l'installazione della 0.116.0 a Glos.**

Cosa fa la 0.116.0 (commit 4b48b70 e 5eb6531, test `unioni-che-scadono-23-11` e `unioni-veloci-23-11`):
- chi è scaduto non passa più davanti agli altri e ha più tempo a ogni tentativo (`unioni-che-scadono.ts`);
- la prova non rimisura ciò che il ramo non può rompere (rilasci, note Android, solo versione), lotti anche con file in comune senza conflitto, raccolta della raffica, scadenza adattiva (`criteri-prova.ts`, `unioni-a-lotti.ts`, `tempi-unione.ts`);
- i rapporti dei lavori vanno al PC di riferimento (utili per vedere BG4 senza chiedere a Nicholas).

Cosa **resta scoperto** per un PC come quello di Glos:
1. **Collo 3 del k-191d non fatto: le misure della prova non passano dal turno «pesante» del PC.** In `src/autopilot-host/server.ts`, `provaNelPrincipale`, la funzione `misura` non usa `turni.pesante` (nessuna occorrenza nel file). Con più workspace sullo stesso PC, due unioni di workspace diversi misurano insieme su 4 processori e si rallentano: è proprio la scadenza «per tempo». Su questo PC di 4 core al 94% è la correzione che pesa di più. Va fatta con un test sull'attesa circolare con il turno `unione`.
2. **La scadenza adattiva (`scadenzaAdattiva` in `tempi-unione.ts`) non aiuta finché ci sono meno di 3 prove ricordate**: allora vale il tetto, 45 minuti per prova e 60 per unione. Su un PC lento che scade subito, la fila può restare ferma per quel tempo prima che la misura adattiva si formi. Da verificare con il registro di BG4 (non l'ho potuto leggere).
3. **Serve una rotta di sola lettura che mandi a chi chiede** il registro unioni/criteri e il piano del workspace (per esempio `/api/workspace/registro`), oggi assente: senza, ogni misura su BG4 richiede di andare sul PC. Rapporti dei lavori al PC di riferimento (k-193a) coprono in parte questa mancanza, ma solo per i lavori nuovi.

Non ho fatto nessuna correzione nel codice: nessuna era piccola e sicura senza il registro di BG4 (la 1 tocca l'ordine dei turni e va provata con la misura vera).

## 5. Cosa serve per chiudere

1. **Accesso ai dati**, in uno di questi modi (a scelta dell'autopilota):
   - un agente sul PC di riferimento (PC-Fisso), che legge `.sierradeck/errori-arrivati/` (voci del mittente «fisso_scrivania_glos», lotti, controlli `controllo-*.md`, `.recupero/fisso_scrivania_glos/`) e i rapporti del controllo PC;
   - oppure, sul PC in Glos, un agente (o Nicholas con un solo comando) che legge `piano.json` di BG4, le righe `[unione di prova]`, `unione in fila`, `(scaduta)` e `unione ripresa dopo il riavvio` del suo log in `%APPDATA%\sierradeck\log\`.
2. **Installare la 0.116.0 a Glos** dopo la pubblicazione (lo fa Nicholas o il suo aggiornamento automatico): il battito dirà la nuova versione.
3. **Fare la correzione 1** (turno pesante per le misure della prova) e rimisurare a Glos: obiettivo, nessuna riga «(scaduta)» e prova media sotto 100 s.
