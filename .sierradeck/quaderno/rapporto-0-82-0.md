---
titolo: "Rapporto 0.82.0"
quando: 2026-10-21T12:00:00+02:00
tag: ["rapporto", "0.82.0"]
---

# Rapporto 0.82.0

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
- Un test di `sottofondo` è caduto una volta, durante un giro con il PC al 100%.
  Rilanciato da solo è passato 3 volte su 3: dipende dal tempo, non da un
  difetto.
- Android: vedi sotto.
