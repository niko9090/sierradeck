---
titolo: "L'ospite di ogni chat (0.52.0): perché la stessa chat partiva su due PC, e la regola dura"
quando: 2026-10-07T16:00:00+02:00
tag: ["una-casa", "ospite", "multi-pc", "pc-remoto", "causa", "decisione-nicholas"]
---

# Richiesta di Nicholas (07/10)

«Non riesco a lavorare su chat remote perché continua a prenderle su entrambi i pc. Posso fare una selezione delle chat quali sono i pc che la devono ospitare così negli altri si elimina e va solo da remoto?»

# La causa vera (trovata con i dati di PC-Fisso, 07/10)

- `case-chat.json` su PC-Fisso aveva 516 case, decise il 02/10 dalla migrazione 0.42, quasi tutte `regola`. Fra le chat nei workspace di PC-Fisso, 9 avevano casa DESKTOP ed erano riquadri **locali**.
  - La cartella di quelle chat esiste anche su PC-Fisso, perché sono progetti sul Drive che viaggiano. La stessa cartella ha un percorso su DESKTOP (sotto `E:\…`) e un altro qui (sotto `C:\…`).
- **`decidiApertura` (0.36.1) non leggeva mai la casa memorizzata.** Mandava una chat in remoto solo:
  1. se il battito di un altro PC la elencava fra le aperte;
  2. se la cartella qui non c'era.
- Il battito elenca solo le chat **montate nel workspace davanti**: DESKTOP e LAPTOP ne dichiaravano una ciascuno. Quindi:
  - il punto 1 non scattava per le chat degli altri workspace;
  - il punto 2 non scattava perché la cartella c'era su tutti e due i PC.
  - Risultato: `locale`, e un secondo claude.exe sulla copia di qui.
- Anche LAPTOP faceva girare una chat con casa DESKTOP, per la stessa ragione.
- `pty:spawn` non controllava la casa, e «Apri qui lo stesso» (`forzaQui`) scavalcava tutto.
- La casa della 0.42 serviva solo alla sincronia (cosa sale e cosa scende) e al «Riordina». **All'apertura non contava niente.**

# Cosa fa la 0.52.0

- **Il cancello unico**: `fermaSeCasaAltrove` (`src/shared/ospite-chat.ts`), chiamato per primo in `pty:spawn` (`src/main/ipc.ts`).
  - Se la chat ha casa su un altro PC, lancia il messaggio `CHAT_DI_UN_ALTRO_PC:` con `casa: true`, anche con `forzaQui`.
  - Il Terminal lo riconosce, richiede `daDove` e diventa remoto, oppure mostra l'attesa con «Porta qui la chat».
  - Vale **ogni** casa memorizzata, anche quelle della `regola`.
  - Da subito all'avvio: prima che il servizio delle case sia pronto, la guardia legge `case-chat.json` dal disco (`impostaGuardiaCasa` in `index.ts`).
- **`decidiApertura`**: la casa memorizzata (`casa` / `casaQui`) vince su battiti e cartella; `perCasa: true` nell'esito.
- **La scelta** «Ospitata da: PC» (`sceltaOspite`, `da: 'nicholas'`, `sceltaDa`):
  - si fa da 🏠 nella testata, con il tasto destro sul titolo, e nella finestra «Dove vive ogni chat…» (per chat o per workspace);
  - si propaga **subito** con `/api/case`: solo `daAltroPc`, permessa anche sul canale WebRTC, regola della 0.47;
  - e **al giro** con l'oggetto `case-chat` nella scatola del Drive.
- **Conflitti**: in `unisciCase` vince la scelta più recente. A pari istante vince l'id di PC più grande, così ogni PC arriva alla stessa risposta: prima vinceva «l'ultima arrivata» e due PC potevano non convergere.
  - L'annullamento prende un `decisaIl` strettamente dopo quello che annulla.
- **Il trasloco della copia di qui** (`pianoTrasloco` + `creaOspite().giro()`, ogni 10 s e dopo ogni giro delle case):
  - solo per le case *scelte* (`nicholas` / `sposta`) che puntano altrove: le case della `regola` bloccano l'avvio ma non spostano niente da sole (per quelle c'è «Riordina»);
  - chat aperta e al lavoro → si aspetta;
  - chat ferma → evento `casa:chiudiQui`: la finestra uccide il pty e rende remoto il riquadro;
  - chat chiusa → `unaCasa.riordina` con `tipo: 'ospite'`, nella cartella di recupero, annullabile. L'annullamento riporta la casa qui.
  - Prima di cedere una chat che era di qui si chiama `sincronia.salva()`, così l'ospite nuovo trova la copia sul Drive e la sua discesa automatica (`scendeQui`, più lunga vince) la porta giù.
- **Indicatore in alto**:
  - sul PC, `IndicatoreDiRiquadro` nella testata accanto a «SU PC», letto da `linee-remote.ts` che `RiquadroRemoto` pubblica;
  - nell'app, `PillolaComputer(linea)`, con la strada dedotta dall'indirizzo: solo intervalli standard, privati e 100.64/10 Tailscale.

# Trappole

- **Mai dati della rete di Nicholas nel codice o nei test** (IP veri, id dei PC, nomi, percorsi): l'app è pubblica. Nicholas lo ha chiesto esplicitamente il 07/10. Usare esempi (`192.168.1.20`, `pc-fisso-id`, `C:\Progetti\Money`).
- `ipc.ts` non si importa nei test (Electron): le funzioni pure vanno in `src/shared`.
- Il test strutturale in `tests/main/ospite.test.ts` controlla che `buildClaudeArgs(` compaia solo in `config.ts` / `ipc.ts` e che `gestore.pty.spawn(` stia solo nel Terminal. Un nuovo punto di avvio deve passare da `pty:spawn`, o il test fallisce apposta.

# Limiti noti

- Se Nicholas fa «Porta qui» mentre l'altro PC aveva lavoro non ancora salvato sul Drive, quel lavoro resta nella copia archiviata dell'altro PC: non si perde, ma non arriva qui da solo.
- Le chat nuove non hanno casa finché `nascite` non la scrive (giro di 2 minuti): fino ad allora sono di chi le ha create, come prima.
- Da provare dal vivo con Nicholas: scegliere DESKTOP per una chat aperta su PC-Fisso, poi verificare che PC-Fisso la chiuda a fine turno, la apra dal vivo e la metta nel recupero, e che «Annulla» la rimetta.
