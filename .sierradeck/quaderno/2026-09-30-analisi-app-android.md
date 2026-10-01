---
titolo: "Analisi dell'app Android e della pagina servita (30/09/2026, 0.35.0 / app 2.38.0)"
quando: 2026-09-30T15:30:00+02:00
tag: ["android", "pagina", "telefono", "analisi", "difetti", "proposte", "controllo"]
---

# Perché

Mandato: rileggere l'app nativa (Kotlin/Compose, `android/app/src/main/java/it/ferrariconsulenze/sierradeck`) e la
pagina servita dal PC (`src/main/client-pagina.ts`) contro lo scopo di PRODUCT.md — **dal telefono vedere da lontano chi
lavora, chi è fermo, chi aspetta te; rispondere; rimettere in moto** — e contro quello che il programma ha imparato dalla
0.26 alla 0.34. Correggere i difetti su tutti e due i lati, fare i miglioramenti d'uso piccoli, scrivere qui le proposte grandi.

Il lavoro è in commit locali (0.35.0, app 2.38.0 / versionCode 73). **Niente pubblicato**: né release, né push, né APK.

# 1. Inventario (com'era il 30/09, prima delle correzioni)

## App nativa — fascia a 5 voci: Chat · Domande · Lavori · Negozio · Computer
In cima a ogni schermata: **pillola del computer** (nome + pallino connessione, tocco → selettore postazioni),
**nota d'errore globale** (`Nota`/`tenta`), **banda urgenze** (`Urgenze.kt`), striscia «c'è l'app nuova».
Schermo intero a parte: `SchermoInstallazione` (PC che si aggiorna), `NonRiconosciuto` (5 × 401 di fila).

| Schermata | Cosa fa | API |
|---|---|---|
| Chat — elenco | chat vive + salvate raggruppate per workspace (`raggruppaChat`), «+ Nuova» (sfoglia cartelle), «Riprendi» | `/api/stato`, `/api/sfoglia`, `/api/apri`, `/api/sessioni`, `/api/sessioni/riprendi` |
| Chat — dettaglio | terminale ANSI (Adatta/Griglia, misura carattere), «mostra quello di prima», scelte toccabili, invio, rinomina, chiudi | `/api/storia` (ripiego `/api/dentro`), `/api/scegli`, `/api/scrivi`, `/api/chat/nome`, `/api/chat/chiudi` |
| Domande | domande autopiloti (intervista/lavoro), scelte delle chat, chat ferme; risposta dentro la scheda | `/api/domande` ogni 2 s, `/api/rispondi`, `/api/scegli`, `/api/scrivi` |
| Lavori | elenco autopiloti ordinato per urgenza; dettaglio con chat con lui, fasi, misura, linguette (Obiettivo, Criteri, Compiti, Ha deciso, Altro), Vai/Ferma/Riprendi, riavvio, Elimina, Quaderno; «+ Affida» | `/api/autopilota*`, `/api/cartelle`, `/api/quaderno*` |
| Negozio | plugin/skill/agenti/MCP, accendi/spegni, installa plugin | `/api/negozio*` |
| Computer | Workspace (cambia/crea), Avvisi (controllo continuo, notifiche, batteria), Account (entra/esci/cambia), Consumi + limiti del piano, Code dei progetti, Altri computer (posta), Aspetto, Drive (catalogo, Porta qui, lavoro), Aggiornamenti (app + PC) | `/api/consumi`, `/api/coda*`, `/api/pc`, `/api/posta*`, `/api/preferenze`, `/api/drive/*`, `/api/aggiornamento*`, `/api/account*` |

Guardia ad app chiusa: `Sentinella` (sveglia ogni 2 min) o `GuardiaService` (5 s, riga fissa) → `Ronda` → `Avvisi`
(domande, chat che aspettano, autopiloti finiti/fermi) con risposta dalla notifica (`RispostaVeloce`).

## Pagina servita — fascia a 5 voci: Adesso · Domande · Chat · Lavori · Computer
Adesso (domanda in primo piano, fermi, polso, calma), Domande (come l'app), Chat (elenco per workspace, dettaglio con
`/api/dentro`), Lavori (dettaglio autopilota, delega, quaderno), Computer (workspace + pannelli Code, Altri PC, Drive,
Consumi, Impostazioni/aggiornamento PC). Niente Negozio, niente Account, niente risalita della conversazione.

## Funzioni del programma 0.26 → 0.34, e dove stavano sul telefono
| Funzione | App | Pagina |
|---|---|---|
| sync nei due versi / Drive (0.26) | sì (scheda Drive in Computer) | sì |
| coda condivisa | sì | sì |
| chat degli altri PC dal vivo, «su X · acceso/spento» (0.33) | **solo «su X»**, nessun acceso/spento | idem |
| scheda Domande (0.30) | sì | sì (con difetti di ridisegno) |
| limiti del piano nei Consumi (0.31) | sì, **letti una volta sola** | sì, letti una volta |
| autopiloti (dialogo, fasi, «pronto») | sì | sì |
| «Installa» dal telefono (0.33.1) | sì | sì |
| ritorno all'ultima composizione (0.34) | salvataggi tolti dalla UI, **API morte rimaste** | tolti |
| chat che non si apre con il motivo (0.34) | vive sul PC, il telefono non la vede (vedi proposte) | idem |

# 2. Difetti trovati e corretti

Ogni riga: **causa → correzione → prova**. Test app: `android/app/src/test/.../AnalisiAppTest.kt`;
pagina: `tests/main/client-pagina.test.ts` («analisi del telefono, 30/09»); computer: `tests/main/client-rotte.test.ts`.

## App Android
1. **Le chat non dicevano il loro stato.** L'elenco mostrava titolo e ultima riga: chi lavora, chi aspetta te e chi è
   fermo su un permesso erano identici. Il computer manda già `chiede/aspetta/governata/viva` → `StatoChat.kt`
   (`leggiChat`, `riassuntoChat`, `chatCheTiAspettano`): LED + parola per ogni chat, riassunto in testata, stato anche
   nella testata del dettaglio, pallino ambra e numero sulla voce «Chat». `Chat.viva` aggiunto a `Modelli.kt` (default
   `true` per i PC vecchi). Test: «una chat su una scelta…», «un computer vecchio che non manda viva…», «il riassunto…».
2. **La banda urgenze ignorava le scelte delle chat.** Contava solo `stato.domande` (autopiloti): una chat ferma su «posso
   scrivere questo file?» accendeva il pallino di Domande ma non la banda. → `urgenzaDi(stato, connesso)` pura in
   `Urgenze.kt`, domande + scelte contate insieme. Test: «una chat ferma su un permesso accende la banda».
3. **La notifica di un autopilota fermo non diceva mai il motivo.** `Avvisi` leggeva `motivoSospensione`, ma
   `/api/stato` lo chiama `motivo` (il nome lungo è del dettaglio): sempre «Serve una tua occhiata». Il vecchio test usava
   la chiave sbagliata e passava. → legge `motivo` con ripiego. Test: «…dice il motivo che il computer manda davvero».
4. **Una scelta (permesso) non si annunciava.** Solo `aspetta` generava la notifica. → famiglia `k:` (`ID_SCELTA`), anche
   per le governate, anche al primo giro, senza risposta scritta (una scelta si tocca), senza doppione «aspetta te».
   Toccata apre Domande. Test: tre casi in `AnalisiAppTest`.
5. **Un autopilota «pronto» (aspetta il via) non si annunciava.** Banda e pallino sì, notifica no → famiglia `p:`
   (`ID_PRONTO`). Test: «un autopilota pronto…»; bande famiglie distinte.
6. **Le notifiche degli autopiloti aprivano la scheda Chat.** Nessun extra → `EXTRA_SCHEDA=lavori` in `Ronda`,
   `MainActivity.apriDoveChiede` apre Lavori.
7. **La riga fissa del controllo continuo mentiva.** Contava le governate come «aspettano te» e ignorava le scelte →
   `rigaPresenza` pura in `Avvisi.kt`. Test: «la riga fissa non conta le governate e conta le scelte».
8. **«N in attesa di te» in Lavori contava solo sospesi e falliti** (e chiamava «in attesa» chi è fermo) →
   `riassuntoLavori`: fermi · aspettano una risposta · aspettano il via · si preparano · al lavoro · finiti. Test.
9. **Errori muti che si leggevano come «vuoto»**: Riprendi (errore = «Niente da riprendere»), Affida (errore = nessuna
   cartella), Quaderno (403 = «Nessuna scheda»), apertura di una scheda del quaderno, dettaglio autopilota che non arriva,
   coda che non si legge. → ognuno dice cosa è successo (`tenta`/`Nota.spiega` o riga ambra).
10. **Consumi letti una volta sola** all'apertura della scheda: i limiti del piano restavano quelli di allora → rilettura
    ogni 30 s (come il PC). **«Letti alle HH:mm» senza data**: una lettura di tre giorni fa sembrava di adesso →
    `quandoLetti` («ieri alle…», «il 27 set alle…»). Test.
11. **Codice e API morti**: `Prossimamente()`, `Api.salvataggi/caricaSalvataggio` e i modelli `Salvataggi` (tolti dalla
    0.34), KDoc che parlavano di «quattro destinazioni» e di «salvataggi».

## Pagina servita
12. **Fascia a 5 voci in una griglia a 4 colonne**: «Computer» andava a capo e copriva l'ultima piastrella → `repeat(5, 1fr)`. Test.
13. **`.voce` definita due volte**: la seconda (pensata per le decisioni) rendeva gli elenchi di chat e autopiloti
    12 px, grigi, senza margini → `.voce--riga` per le decisioni. Test (una sola regola `.voce`).
14. **Autopiloti fermi grigi**: `led--fermo` diventava la classe `fermo`, che nella pagina è il grigio del «computer
    muto» → `ledAutopilota` pura (`fermo` → `rosso`, come la console). Test.
15. **Tutte le chat verdi** in elenco e in Adesso → `statoChat`/`riassuntoChat`, identiche all'app (un test confronta le
    parole con `StatoChat.kt`); `ledDestinazione('chat')` ambra se qualcuna aspetta.
16. **La scheda Domande restava su «Leggo dal computer…»** e «Mandata» non compariva: la lista non entrava
    nell'`impronta`, quindi il ridisegno veniva saltato. Nell'impronta mancavano anche `chiede/aspetta/altrove` delle
    chat, `led/motivo/nome` degli autopiloti, `inCoda`, `attesa/chatOccupate/testo` dell'aggiornamento, i consumi → aggiunti. Test.
17. **Opzione corrente non evidenziata in Domande** (`scelta--qui` senza regola) → `scelta--ora`. **Cartella scelta non
    evidenziata in Affida** (`.cartella.attivo` senza regola) → regola aggiunta, e nome + percorso. Test.
18. **XSS residuo**: «Riprendi» in Adesso costruiva `riprendiAp('…')` con `esc` e non `escJs` → `data-ap`. Test.
19. **Il 401 finiva nella nota «Non sono riuscito»**: il controllo era `testo === '401'`, mai vero → `indexOf('(401)')`. Test.
20. **«Cerca ora» promesso dal testo e inesistente** → tasto + `cercaAggiornamento()` su `/api/aggiornamento/cerca`, con
    «Ho cercato alle…». Test.
21. **Adesso diceva «Nessuno ti aspetta» davanti a un autopilota pronto** e non mostrava le chat su una scelta → piastrella
    «ASPETTANO TE» (con «Vai» e «Rispondi dalla scheda Domande»). Test.
22. **Elenco delle conversazioni letto una volta per sempre** → a ogni apertura; **le chat di un altro PC mandavano
    comunque la richiesta** (poi 409) → la pagina lo dice subito. **Errore degli altri PC invisibile nell'elenco** → mostrato.
23. **Il selettore delle cartelle ricompariva da solo in Chat** dopo «Lascia stare» in Affida (`cartelle` non azzerate) → azzerate.
24. **Cambiando scheda restavano aperti** menu «altro», scheda del quaderno, coda, PC → chiusi in `vaiScheda`/indietro.
25. **Possibili cadute** con un PC vecchio: `costo.oggi.toFixed` senza numeri, `new Date(undefined)` → guardie.
26. Testi senza accenti («Gia mandata», «Ha capito cosi», «Torna all elenco»…) → corretti. Test. Codice morto tolto
    (`alLavoro`…`avanzamento`, `window.apriPannello = window.apriPannello`, commento orfano).

## Programma (PC)
27. **`/api/sessioni` non diceva se il PC dell'altra chat era acceso** (il PC lo dice dalla 0.33) → `altroveAcceso`
    dal battito; regola unica `battitoVivo` anche per `/api/pc` (un battito illeggibile non è «acceso»). Test.
28. **Il 409 di `/api/sessioni/riprendi` rimandava a «Altri PC»**, sezione che non esiste da nessuna parte → «Computer →
    Altri computer». La pagina chiamava la sezione «Altri PC», l'app e il PC «Altri computer» → unificato. Test.

# 3. Incoerenze sistemate (app ↔ pagina ↔ PC)
- Stato di una chat: stessa regola e stesse parole su app e pagina (test che le confronta).
- LED «fermo» rosso ovunque (console, app, pagina).
- Nome della sezione «Altri computer» ovunque, anche nei messaggi del computer.
- «su X · acceso/spento» ora anche sul telefono, come in «Riprendi» sul PC.
- «in lavoro su X» (app) / «su X» (pagina) per una chat il cui progetto è di un altro PC → «il progetto è in mano a X» /
  «progetto su X», e per la coda «in mano a X» (era «in lavoro su ?»).
- Notifiche della pagina (browser) allineate all'app: scelte e «pronto» annunciati; niente doppione scelta + aspetta.

# 4. Miglioramenti d'uso fatti (senza stravolgere)
- Riassunti a colpo d'occhio: testata Chat («1 aspetta te · 3 al lavoro») e testata Lavori (tutti gli stati).
- «Apri la chat» nelle voci di Domande (scelta e chat ferma) → entra nella chat (`Apertura.apriChat`).
- Autopilota in «attesa»: la scheda dice di rispondere nella casella, «Ferma» diventa secondario.
- Altri computer (app e pagina): elenco delle chat aperte di ogni PC con LED «aspetta te / al lavoro» (dal battito).
- Testi per esteso dove erano monchi: Riprendi (cosa fa, cosa non fa con le chat di altri PC), Code (cosa sono, perché
  vuote), Consumi (cosa sono ↑ ↓ ⟳), Affida (da dove vengono le cartelle, dove arrivano le domande), Domande (cosa
  conta il numero), Quaderno vuoto (perché), Altri computer (cosa si vede, come comandarli dal vivo).

# 5. Proposte (NON fatte: decide Nicholas)
| # | Proposta | Motivo | Costo | Priorità |
|---|---|---|---|---|
| P1 | **Chat degli altri PC dal vivo dal telefono** (riquadro remoto come sul PC 0.33): il telefono chiede al PC accoppiato di fargli da ponte (`/api/remoto/stato|storia|scrivi` che inoltrano con la chiave di casa) | oggi dal telefono si vedono le chat di un altro PC solo se si è accoppiati anche a lui; col ponte basta un accoppiamento | medio: 4 rotte ponte sul PC + schermata in app e pagina; attenzione a non aprire un proxy generico | alta |
| P2 | **Diagnosi «la chat non si apre» sul telefono** (0.34): `/api/stato` porta `guasto: {caso, testo}` per il riquadro, e l'app mostra il caso e «Riprova» | oggi una chat che non parte, vista dal telefono, sembra «al lavoro» o «spenta» | medio: il caso vive nel renderer (Terminal.tsx), va annunciato come `aspetta` | alta |
| P3 | **Opzioni rapide nelle domande degli autopiloti** (sì/no, scelte) | dal telefono si risponde a parole anche quando basterebbe un tocco | medio: `chiediUtente` deve produrre opzioni | media |
| P4 | **Azioni nella notifica di una scelta** (pulsanti per le prime 2-3 opzioni) | rispondere a un permesso senza aprire l'app | medio: servono le opzioni in `/api/stato` o una lettura in più nella ronda; conferma 409 già c'è | media |
| P5 | **Negozio e Account nella pagina** (l'app li ha) | parità dei due lati | medio | bassa |
| P6 | **Risalita della conversazione nella pagina** (`/api/storia`, come l'app) | parità | basso-medio | bassa |
| P7 | **Elimina workspace** dal telefono (rotta c'è, tasto no, su tutti e due i lati) | completezza | basso, ma distruttivo: doppio tocco | bassa |
| P8 | **Cartella destinataria scelta dal telefono nella coda** (oggi «prima chat libera») | parità col PC | basso | bassa |
| P9 | **Scheda Computer più corta**: indice in cima o sezioni pieghevoli (oggi 9 sezioni in uno scorrimento) | si cerca «Aggiornamenti» scorrendo tutto | basso | media |

# 6. Cosa resta aperto
- **Da provare sul telefono vero** (S25 Ultra via adb, vedi [[app-scheda-autopilota-e-installa-dal-telefono]]): i test
  coprono la logica, non l'aspetto. Da guardare: lunghezza delle parole di stato su schermi stretti (riga titolo + parola),
  la piastrella «ASPETTANO TE» nella pagina, le notifiche nuove (scelta, pronto) e il tocco che apre Lavori.
- `aspetta` e `chiede` sono giudizi del PC (prompt visto + silenzio; elenco numerato sullo schermo): se sbagliano, il
  telefono sbaglia con loro. Una chat che non riesce ad aprirsi oggi appare «al lavoro»/«spenta» (P2).
- La pagina non ha ancora Negozio, Account, risalita (P5, P6).
- Il riquadro «Altri computer» mostra le chat dal battito, che ha qualche minuto di ritardo: «ultimo stato noto» quando
  il PC è spento.
- Pubblicazione: non fatta. Alla release servono l'APK 2.38.0 (android/ è cambiato) e `app-android.json`
  (vedi [[pubblicare-una-release]], REGOLA APK).

## Nota 01/10 (0.36.1)

Sul PC le chat di un altro PC ora si aprono da sole dal vivo, o in attesa se quel PC tace (vedi `chat-dal-vivo-su-un-altro-pc.md`). Dal telefono, toccandole, la risposta dice «su X · acceso / spento o non risponde» al posto dell'errore secco. **P1 resta da fare** (per scelta, non in 0.36.1): guardarle dal vivo dal telefono attraverso il PC accoppiato.
