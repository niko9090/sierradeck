# Rapporto: perché le unioni sono lente (misure del 23/11, compito k-191d)

Solo misure, nessun codice cambiato. Periodo: registri del servizio dal 16 al 23/11 (8 giorni, 204 prove di unione), file `piano.json` dei compiti del workspace di sviluppo e del workspace di prova «investimento» sullo stesso PC.

Limite dei dati: il workspace BG4 (schema) gira su un altro PC e qui non ci sono i suoi registri, quindi le scadenze in fila di BG4 non si misurano da qui. Il percorso del codice è lo stesso, per cui valgono le stesse cause; la causa specifica delle sue scadenze va letta sul suo PC (vedi «Cosa resta»).

## 1. Il percorso di un'unione e il costo di ogni passo

Ordine reale (`giraFila` e `cancelloOra` in `src/autopilot-host/servizio-orchestratore.ts`, `provaNelPrincipale` in `src/autopilot-host/server.ts`):

| # | Passo | Dove | Costo misurato |
|---|-------|------|----------------|
| 1 | Attesa in fila (una unione alla volta per workspace e per cartella principale) | `giraFila`, `filaUnioni` | mediana 18 min, p90 58 min, max 115 min dal «in fila» all'«unito» (vedi tabella 2) |
| 2 | Lotto: ricerca dei rami indipendenti (diff dei file di ogni ramo) | `unisciLotto`, `formaLotto` (`unioni-a-lotti.ts`) | git < 0,1 s per diff; usato 1 sola volta nei registri (introdotto il 22/11 sera) |
| 3 | Ricerca ramo, worktree list, salvataggio del lavoro nel ramo (add/commit) | `cancelloOra` | git: 0,07 s (worktree list, diff), 0,6 s (status): trascurabile |
| 4 | Attesa del turno del PC (`turni.unione`) | `turni-criteri.ts` | media 2 s, totale 685 s su 46.151 s di prove (1,5%); un solo caso a 301 s (attesa di un comando pesante) |
| 5 | Unione di prova senza commit nella cartella principale (`iniziaProvaAsincrono`) | `worktree.ts` | git, secondi |
| 6 | Misura dei criteri di TUTTI i compiti già uniti, compattati (`criteriPerLaProva`), con il ramo dentro | `provaNelPrincipale` | **è il costo dominante: media 226 s, 55 prove su 204 oltre 300 s, 19 oltre 600 s, max 1539 s** |
| 7 | Se rosso: chiusura, seconda misura senza il ramo, riunione | `provaNelPrincipale` | raddoppia il passo 6 solo nei rossi (non misurato a parte) |
| 8 | Chiusura prova con commit | `chiudiProvaAsincrono` | git, secondi |
| 9 | Criterio del compito sul principale, con cache per impronta del codice | `cancelloOra`, `misuraCriteri` (`criteri-veloci.ts`) | media 9 s per vitest mirato (130 misure, max 132 s); `tsc` 10-12 s |
| 10 | Aggiornamento del piano, nota in conversazione, pulizia del worktree (non attesa) | `cancelloOra` | trascurabile |
| - | Fetch/bundle dagli altri PC | NON nel cancello: `riallineaPrincipale` gira fuori dai turni | 0 nel percorso dell'unione |
| - | `npm install` o junction `node_modules` | NON nel cancello: la prova gira nella cartella principale, che ha già `node_modules` | 0 |
| - | Scadenze e riprove | `conScadenza` (45 min), `UNIONE_MAX_MS` (60 min), `attesaDopoScadenza` (30 s, 2, 5, 15 min) | 0 prove marcate «(scaduta)» nei registri di questo PC dal 16 al 23/11 |

Conclusione: i passi git e i lucchetti costano secondi. Il tempo sta nella misura dei criteri (passo 6) e nel fatto che si fa una unione alla volta (passo 1).

## 2. Tempi veri (registri, 16-23/11)

Tempo per unione di prova (passo 4 + 5-8), da `[unione di prova] … attesa del turno N s, prova N s`:

| Giorno | Prove | Attesa turno media (max) | Prova media | Prova max | Prove da 0 s |
|--------|-------|--------------------------|-------------|-----------|--------------|
| 16/11 | 40 | 2 s (8 s) | 429 s | 1539 s | 3 |
| 17/11 | 20 | 2 s (2 s) | 52 s | 307 s | 0 |
| 19/11 | 21 | 2 s (6 s) | 246 s | 679 s | 0 |
| 20/11 | 57 | 2 s (6 s) | 220 s | 1060 s | 7 |
| 22/11 | 33 | 2 s (5 s) | 154 s | 646 s | 7 |
| 23/11 | 33 | 11 s (301 s) | 157 s | 707 s | 6 |
| Totale | 204 | - | 226 s | 1539 s | 23 |

Totale prove: 46.151 s, circa 12,8 ore di cartella principale occupata in 8 giorni, per 240 commit non di merge.

Dal «in fila» all'«unito» (102 compiti del workspace di sviluppo, `unione in fila` nel registro contro `unitoIl` nel piano):

| Posizione in fila quando entra | Compiti | Attesa media | Max |
|--------------------------------|---------|--------------|-----|
| 1ª-2ª | 19 | 9,9 min | 42,8 min |
| 3ª-5ª | 35 | 23,3 min | 64,4 min |
| 6ª o più | 48 | 38,8 min | 115,3 min |
| Tutti | 102 | media 28,1 min, mediana 18,2 min, p90 57,6 min | 115,3 min |

Fila più lunga vista: 11 unioni. Posizioni 6+ sono il 47% dei casi: la fila è quasi sempre piena a ondate (22/11: 32 compiti, media 33 min).

Durata dei compiti dalla creazione all'unione (sviluppatori): media 41 min, mediana circa 33 min. L'unione pesa quindi circa metà del tempo di vita di un compito quando la fila è lunga.

Riprove e attese: scadenze 0 su questo PC; 16 «unione ripresa dopo il riavvio» il 20/11 e 7 il 16/11. Il controllo di carico (`guardia-pc`) ha fatto aspettare 233 volte i comandi degli specialisti: media 4 min, max 31 min (PC al 60-75% di processore per minuti). Non è dentro il cancello ma lo rallenta (collo 3).

## 3. I colli di bottiglia veri, con la prova

### Collo 1: la prova rimisura cose che il ramo non può rompere (release, Android, versione)

Prova:
- Il 20/11 una prova di 1060 s contiene: una quindicina di criteri da 1 s di compiti di rilascio (`git tag --list vX`, `grep -q … android/novita-app.txt`, `test ! -e …`), poi `gradle -p android testDebugUnitTest --rerun --offline` da 483 s, poi `gradle … compileReleaseKotlin` da 32 s.
- Il 23/11 alle 00:11 la prova di un rilascio dura 281 s e coincide con un `npx vitest run --maxWorkers=2` da 280 s: ogni rilascio tocca `package.json` (18 volte in 8 giorni), e `CAMBIA_TUTTO` in `criteri-prova.ts` manda in prova l'intera suite.
- `gradle` nei registri: 78 esecuzioni, 10.882 s (3,0 ore) tra il 16 e il 20/11, 64 con `--rerun` (che forza a rifare i test già verdi). Ogni rilascio tocca `android/novita-app.txt`, che `criteriPerLaProva` conta come file Android (`soloNote` conosce solo `.md`, `.sierradeck/`, `docs/`, `note/`). Nessun gradle il 22 e 23/11: la correzione di `GRADLE_QUALSIASI` ha già tolto una parte, ma la regola per i file di testo Android resta.
- 2.006 comandi da 3 s o meno (git tag, grep, test): 1.756 s in 8 giorni, e si ripetono a ogni prova perché dopo ogni unione il codice è un altro e la cache per impronta non vale più. Misurano uno stato (versione pubblicata), non il codice.

Correzione proposta:
1. `src/autopilot-host/criteri-prova.ts`, `soloNote`: contare come «nota» i file `android/novita-app.txt` e in generale `android/**/*.txt|*.md`. Senza file Android veri niente gradle.
2. `criteriPerLaProva`, ramo `gradle`: togliere `--rerun` e `--no-daemon`-simili dalle opzioni unite (nella prova prima/dopo la cache di gradle serve a questo).
3. `src/autopilot-host/server.ts`, `provaNelPrincipale` (riga 816-821, costruzione di `tutti`): escludere i criteri dei compiti con `ruolo === 'rilascio'`. Il criterio di un rilascio misura tag, release e versione, non il codice (oggi `misuraIlRemoto` e `fissaLaVersione` ne prendono solo una parte).
4. `CAMBIA_TUTTO` in `criteri-prova.ts`: per `package.json` e `package-lock.json` provare tutta la suite solo se il diff cambia altro oltre alla riga `version` (nuova funzione pura `soloVersione(diffPackageJson)`; `provaNelPrincipale` ha già `base...ramo` e può leggere il diff del file).

Guadagno stimato: ogni rilascio passa da 280-1060 s di prova a circa 20-30 s. I rilasci sono 27 compiti su 153 in 8 giorni: circa 2-4 ore di cartella principale in meno su 12,8 ore (15-30% del tempo di prova), e la fila si accorcia di conseguenza perché sono proprio le unioni lunghe a bloccare le altre.

### Collo 2: una unione alla volta, e i lotti quasi mai scattano

Prova:
- Posizione 6+ in fila: attesa media 38,8 min contro 9,9 min per la 1ª-2ª. L'attesa cresce con la lunghezza della fila: è serializzazione.
- Nei registri `unione a lotti` compare una volta sola (3 rami in 1 prova, il 23/11). Con file caldi in comune i rami non entrano insieme: negli ultimi 8 giorni `servizio-orchestratore.ts` è toccato da 21 commit, `src/main/index.ts` da 20, `src/shared/novita.ts` da 19, `package.json` da 18. `formaLotto` esclude per costruzione due rami che toccano lo stesso file, ma `novita.ts` e `package.json` vengono toccati da quasi ogni rilascio e novità.
- Il lotto si forma solo se `fila.length > 1` quando la testa parte (`giraFila`, riga 1696): il primo ramo di una raffica parte da solo e la prova da solo costa 150-300 s prima che gli altri siano visibili.

Correzione proposta:
1. `src/autopilot-host/unioni-a-lotti.ts`, `formaLotto`: due rami che toccano lo stesso file entrano nello stesso lotto se il merge git è senza conflitti (provarlo con `git merge-tree --write-tree` sul base, a costo di millisecondi) invece di escluderli per il solo nome del file. Restano fuori solo conflitti veri.
2. `giraFila`: prima di far partire la testa, aspettare qualche secondo (3-5 s) che si raccolgano i rami già pronti nella stessa raffica (oggi parte subito). Costo massimo 5 s, risparmio una prova intera da 150-300 s.
3. `unisciLotto`: tenere insieme anche i rami con `tentativi > 0` senza `sporcaDal`.

Guadagno stimato: con lotti fino a 8 rami una fila di 6-8 unioni passa da 6-8 prove (circa 15-25 min di sola prova) a 1-2. L'attesa media delle posizioni 6+ scende da circa 39 min a 10-15 min. Il costo dei criteri propri dei compiti (9 s) resta uno per compito, ed è piccolo.

### Collo 3: più misure pesanti insieme sullo stesso PC si rallentano a vicenda

Prova:
- Il 16/11 alle 14:29 sono partiti insieme un `python -m pytest tests -q` del workspace di prova (605 s) e un `npx vitest run` del workspace di sviluppo (845 s). La stessa suite, da sola, il 23/11 impiega 280 s (3 volte meno). Le suite intere hanno media 344 s, max 845 s (43 esecuzioni).
- Le misure del servizio non prendono il turno dei pesanti fra workspace (`turni.pesante` serve solo ai comandi delle chat): due unioni di workspace diversi misurano insieme. Il controllo di carico ha intanto fermato 233 comandi di specialisti per una media di 4 min.
- Una misura troppo lenta per il carico è un rosso «per tempo» (`interrottoPerTempo`) o una scadenza, cioè una riprova da 30 s a 15 min.

Correzione proposta: in `server.ts`, `provaNelPrincipale`, la funzione interna `misura` (riga 829) passa dal turno pesante del PC (`turni.pesante(a.cwd, …)`), almeno per i comandi che `ePesante` riconosce. Va tenuta fuori dal turno `unione` della stessa cartella per non causare una attesa circolare (`pesante` aspetta se in quella cartella c'è un'unione): `misura` oggi è già fuori da `turni.unione`, quindi l'ordine è fattibile ma va provato con un test.

Guadagno stimato: una suite da 845 s in coda diventa 280 s più l'attesa del turno: a PC carico il tempo per unione si accorcia, ma soprattutto spariscono le scadenze e le riprove «per tempo». Non accorcia un'unione sola su un PC libero.

### Collo 4: le scadenze costano un'ora di cartella principale ciascuna

Prova (dal codice, non dai registri di questo PC dove non ci sono scadenze): una prova lenta occupa la cartella principale fino a 45 minuti (`PROVA_MAX_MS`) e l'unione fino a 60 (`UNIONE_MAX_MS`), poi la riprova aspetta 30 s, 2, 5, 15 minuti (`attesaDopoScadenza`). Mentre una prova gira per 45 minuti nessun altro ramo può entrare (collo 2). Nel workspace di prova una suite Python media 477 s (17 esecuzioni, max 605 s): tre volte la durata attesa di una prova buona.

Correzione proposta: `src/autopilot-host/tempi-unione.ts`: una scadenza adattiva. La prova scade a `max(5 minuti, 4 × la mediana delle ultime 10 prove dello stesso workspace)`, con il tetto attuale di 45 minuti. Le prove sane di un workspace (3-4 minuti) che diventano 12-16 minuti sono già anomale e si ritentano subito, invece di bloccare la fila per 45. Va scritta insieme alla correzione delle scadenze di k-191a, per non pestarsi su `servizio-orchestratore.ts`.

Guadagno stimato: ogni scadenza costa oggi fino a 45-60 min di fila ferma; con scadenza adattiva circa 10-15 min. Solo per i workspace dove la scadenza avviene davvero (BG4); non si misura qui.

### Collo 5: il costo fisso di ogni criterio breve su Windows

Prova: 2.006 criteri da 3 s o meno, 1.756 s in 8 giorni, media 0,9 s l'uno: il costo di avviare un processo, non del lavoro. Una prova di rilascio ne lancia una quindicina in serie (parallelismo `PARALLELI = 2`).

Correzione proposta: `src/autopilot-host/criteri-veloci.ts`, `misuraCriteri`: i comandi che non sono pesanti e non guardano fuori (`ePesante` falso, `guardaFuori` falso) in parallelo fino a 4, i pesanti restano a 2. Con la correzione del collo 1 questo diventa un risparmio minore (circa 10-20 s per prova di rilascio).

Guadagno stimato: piccolo, 10-20 s per prova con molti criteri brevi; da fare per ultimo.

## 4. Ordine consigliato per k-191e

1. Collo 1 (filtri della prova: `soloNote`, `--rerun`, criteri di rilascio, versione in `package.json`): guadagno più grande e rischio basso, tutto in funzioni pure di `criteri-prova.ts` più una riga in `server.ts`. Test unitari semplici.
2. Collo 2 (lotti con file in comune ma senza conflitto e breve raccolta della raffica): ridà la fila corta. Test con `formaLotto` e un finto `git merge-tree`.
3. Collo 3 (turno pesante fra workspace per le misure): ferma le scadenze «per tempo». Va provato bene per non creare attese circolari.
4. Colli 4 e 5 dopo la correzione di k-191a, perché toccano gli stessi tempi.

Non toccare: il criterio misurato davvero, il rosso che non entra, la cartella principale pulita. Nessuna di queste correzioni li indebolisce: tolgono lavoro che non può cambiare l'esito (rilasci, note, Android senza file Android) o lo fanno una volta sola.

## 5. Cosa resta da misurare

- Sul PC dove gira BG4: leggere `[unione di prova]` e `unione in fila` nel suo registro e il suo `piano.json`, per confermare se le scadenze vengono dalla suite lenta del progetto (collo 3 e 4) o da un criterio che attende per sempre.
- Dopo k-191e ripetere la tabella del paragrafo 2: obiettivo prova media sotto 100 s e attesa mediana in fila sotto 8 minuti.
