---
titolo: "Rapporto della 0.82.0 (rilascio, c-39)"
quando: 2026-10-21T02:30:00+02:00
tag: ["release", "0.82.0", "rapporto"]
---

## Stato (21/10 02:30) — NON ancora pubblicata

| Pezzo | Ramo | In main |
|---|---|---|
| 1) chat insieme decise dal PC | c-33 | **no** (aspetto) |
| 2) colore fisso per attività | c-35 | sì |
| 3) chi sta lavorando | c-35 | sì |
| 4) domande contro lo stato vero | c-34 | sì |
| 5) menu dei workspace rifatto | c-36 | **no** (aspetto) |
| 6) «Apri cartella» | c-37 | sì |
| 7) grafica meno caotica | c-38 | sì (599852f9) |

Novità, versione e pubblicazione restano ferme finché c-33 e c-36 non sono in
main e le suite sono verdi. La bozza delle novità (7 righe) è pronta.

## Controlli su main 599852f9 (21/10 02:07–02:24)
- Test del programma principale: 191 file, **1824 passati**, 2 saltati, 7 min 25 s.
- Altri test (servizio, renderer, condivisi, pty): 254 file, **2776 passati**, 9 min 9 s.
- `npm run typecheck`: 0 errori. Guardia delle cancellazioni: pulita.
- Nessun test rosso: niente da attribuire a c-35, c-37 o c-38.

## Da decidere per Nicholas
- **c-38 ha messo Istruzioni, File e «Ha deciso» della scheda dell'autopilota
  dietro «⋯»** (non tolte). La regola dice niente funzioni spostate senza il suo
  sì: lo decide lui, si può rimettere com'era.

## In attesa di Nicholas (dopo l'installazione, che fa solo lui)
- I tre gesti per i workspace del 19/10: «Sposta in…» dell'autopilota
  «Recupero VisitaFacile» → NexoraOS, poi «Elimina» sui due workspace sbagliati.
- «Chat delle prove» sul Drive: da togliere, la conferma lui.
- La cartella prova-c2 sul DESKTOP: da togliere, la conferma lui.

## Note per chi rilascia
- Nella copia di lavoro della chat non c'è `node_modules`: le suite si lanciano
  nella cartella principale (che è su main), come fanno i criteri.
- `android/` è cambiato dalla v0.81.1 → APK 2.82.0 (versionCode 138) con
  `npm run allega-apk`.

## Limiti delle chat in base al PC (c-33)

**Cosa fa.** Il numero di chat degli autopiloti al lavoro insieme lo decide il
PC: processori, memoria libera e carico degli ultimi minuti. Vale per tutti gli
autopiloti insieme, va da 2 a 8, scende subito sotto sforzo e risale di un posto
ogni 3 minuti. Le chat in più aspettano: «in fila: parte quando si libera un
posto». Le chat finite e ferme da 5 minuti, o di un autopilota fermo da 30
minuti senza domande aperte, si chiudono da sole (la conversazione resta fra le
chiuse). Non si chiudono mai le chat al lavoro, quelle adottate, quelle bloccate
o quelle con una scelta aperta. In vista c'è «N di M chat» sul PC, nella pagina
e nell'app, con il motivo dietro «?». Nelle Impostazioni (Chat e autopiloti) ci
sono tre scelte: Meno chat, Come dice il PC, Più chat.
Come funziona dentro: scheda `posti-delle-chat-0-82-0.md`.

**Test.** PC finti piccolo, medio, grande e sotto carico; salita lenta; fila;
chiusura da sola e nuovo tentativo; scelta aperta; «più chat»; la consegna
«chiudi»; la misura del carico (prima lettura, rumore); i testi su pagina,
programma e app (`PostiChatTest.kt`).

**Misura nella copia di prova.** Lo stesso lavoro, prima e dopo: un autopilota
con 8 compiti; ogni «chat» è un processo che tiene 300 MB e calcola per 40 s.
Il PC ha 8 processori e 24,5 GB.
«Prima» è il servizio senza misura del PC, cioè tetto 8 come fino alla 0.81.1.
«Dopo» usa i posti dal PC.

| | Prima | Dopo |
|---|---|---|
| Chat insieme (massimo) | 8 | 2 |
| Tempo per finire | 45 s | 169 s |
| Processore (media) | 100% | 100% |
| Memoria libera, minima | 3.551 MB | 4.669 MB (+1.118) |
| Memoria libera, media | 3.902 MB | 5.518 MB (+1.616) |

Da leggere con onestà:
- **Il PC era già pieno prima di cominciare.** Il processore stava al 100% anche
  a riposo, per il lavoro delle altre chat dell'autopilota (test, build). Per
  questo il «dopo» si ferma al minimo di 2 e il processore resta al 100% in
  tutti e due i casi: il carico non veniva da questo lavoro.
- Il guadagno è la memoria: circa 1,1 GB in più nel momento peggiore e 1,6 GB
  in media. Il prezzo è il tempo: lo stesso lavoro dura quasi 4 volte tanto,
  perché aspetta in fila invece di contendersi un PC già saturo.
- Una misura precedente, fatta prima della correzione qui sotto, ha aperto
  6 chat su un PC pieno. La prima misura dava carico 0 perché arrivava subito
  dopo la creazione del misuratore. Ora la primissima misura aspetta il secondo
  che manca, senza usare il processore. Il numero va rifatto con il PC a riposo
  (nessun'altra chat al lavoro) per vedere il caso medio.

**Revisione.** Una revisione indipendente non ha trovato difetti gravi. Ha
trovato quattro difetti che ho corretto, ognuno con il suo test:
- una chat con un permesso aperto contava come «ferma» e poteva essere chiusa;
- una `chiudi` persa teneva occupato il posto per sempre;
- senza stato del programma la regolazione tornava a «Come dice il PC» di colpo;
- una `chiudi` in coda apriva una finestra solo per chiudere una chat.

Restano due limiti, scritti nella scheda:
- le chat nate prima della 0.81.0 si chiudono un po' più tardi;
- oltre 80 chat accese, le altre non si chiudono da sole.

**Prove.**
- `typecheck` pulito.
- Test di autopilot-host, renderer, shared, pty-host e main: 4632 passati.
- Il test di `sottofondo` caduto sotto carico è «un testo che Claude Code
  perde torna in coda e si riscrive». La causa era nella prova, non nel
  programma: `digerisci` aspettava 20 ms fissi che xterm elaborasse lo
  schermo, e con il PC al 100% non bastavano. Ora aspetta che xterm abbia
  elaborato tutte le scritture ricevute (callback di `write` e `vi.waitFor`).
  Asserzioni e tempi finti sono gli stessi di prima. Sotto carico (suite main
  in parallelo, più Gradle) passa **10 volte su 10**, con tutti i 16 test del
  file.
- Android, sul codice unito (main b9dab2d0): `gradle testDebugUnitTest
  assembleDebug`, **BUILD SUCCESSFUL**, 390 test, 0 falliti, 1 saltato. L'APK
  debug si compila. Nel progetto non c'è `gradlew`: si usa `gradle`.
  Una prima build ha dato «Unresolved reference» in `Gestione.kt`
  (`TitoloDialogo`, `apriCartellaDa`, `Aiuto`). Era la cache incrementale di
  Kotlin rimasta da prima dell'unione: rilanciata sullo stesso albero, è verde.
