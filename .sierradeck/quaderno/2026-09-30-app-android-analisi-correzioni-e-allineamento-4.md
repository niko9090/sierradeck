---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-09-30T15:35:47.662Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

Implementare l'autopilota «harness» come da .sierradeck/quaderno/2026-09-30-autopilota-harness.md, con le decisioni di Nicholas del 30/09.
(a) Il numero di chat lo decide il modello in base all'utilità; il consumo lo governa il freno sui limiti del piano; resta solo un tetto tecnico.
(b) Regola di pubblicazione per progetto (beta / stabile / versione unica). L'autonomia completa c'è solo con il «cloud» attivo, cioè la sincronizzazione Drive di SierraDeck del progetto, oppure con «va sul cloud» spuntato; il remoto git serve solo per il push. I divieti li fa rispettare il programma.
(c) Tappe T1–T7.
(d) Le Domande come conversazione su PC, app e pagina. Sul PC sono una colonna laterale fissa, come nell'app, con tutte le domande, comprese quelle iniziali della preparazione, a cui si deve poter rispondere anche dall'app e dalla pagina.
(e) Copia e incolla nella chat con l'autopilota.
Un test per ogni parte con logica.
PUBBLICAZIONE, decisa da Nicholas il 30/09: si pubblica subito la 0.36.0 (push, npm run pubblica, APK 2.39.0 e app-android.json allegati, latest.yml verificato). Poi ogni gruppo di modifiche finito e verde va in commit e viene pubblicato come nuova versione secondo la REGOLA VERSIONI, con la voce in novita.ts e l'APK alzato se android/ cambia.
Non toccare l'appId; il proprietario è Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ✅ Il file harness nel quaderno riporta le scelte fissate da Nicholas (con «cloud» = chat salvate sul Drive di SierraDeck), cosa è stato implementato per ogni tappa e cosa resta aperto
- ✅ La 0.36.0 è pubblicata su GitHub con latest.yml, l'APK e app-android.json fra gli asset
- ⬜ Sul PC le Domande sono una sezione laterale fissa, come nell'app Android: si apre e si chiude dalla console, ricorda il suo stato, mostra il conteggio e contiene tutte le domande (chat ferme, permessi, autopiloti, via, pubblicazione, domande iniziali), con testi completi (lo giudica il supervisore)
- ⬜ Alle domande iniziali dell'autopilota (intervista di preparazione) si risponde dalle Domande su PC, app Android e pagina, e la risposta fa andare avanti la preparazione; con i test su logica condivisa, pagina, app e servizio (lo giudica il supervisore)
- ⬜ Il «cloud attivo» è la sincronizzazione Drive del progetto (o «va sul cloud» spuntato nella creazione) e solo quello fa lavorare l'autopilota in autonomia; il remoto git serve solo per il push (lo giudica il supervisore)
- ⬜ Funzionano davvero e hanno i loro test: freno sui limiti del piano, git worktree per chat, regola di pubblicazione per progetto, divieti fatti rispettare dal programma, coordinatore con sotto-chat, Domande come conversazione (PC, app, pagina), copia e incolla nella chat dell'autopilota (lo giudica il supervisore)
- ✅ La versione corrente ha la sua voce nelle novità ed è pubblicata su GitHub con latest.yml
- ✅ I test del programma passano (compreso novita.test.ts)
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano, compresi i nuovi
- ✅ Tutto è in commit e mandato su origin (niente modifiche fuori, niente commit non spinti)

## Le mosse che contano

- **2026-09-30 12:14** — su tua richiesta: Ricevuto, e sono d'accordo: l'autopilota deve diventare il nostro «harness», cioè l'ambiente in cui l'agente lavora sapendo tutto quello che il programma sa fare e usandolo da solo. Ti dico prima com'è oggi, poi cosa faccio.

Oggi ogni autopilota governa una sola chat. Le consegne (src/main/autopilo
- **2026-09-30 12:35** — supervisore → prosegui: L'unico criterio aperto è la proposta harness chiesta da Nicholas; il resto è verificato in commit 46501f8 con albero pulito.
- **2026-09-30 12:39** — supervisore → finito: Tutti i criteri sono soddisfatti e li ho verificati: il commit a5cd3b5 contiene solo il quaderno (la proposta harness più una riga in app-android-nativa.md), l'albero è pulito e main è 2 commit avanti a origin, quindi non c'è stato nessun push. Le scelte T0 (quante chat, quanto piano, cosa può fare senza chiedere) le fa Nicholas quando legge la proposta.
- **2026-09-30 13:15** — su tua richiesta: Ricevuto, parto. Riapro il lavoro (era chiuso) e la chat implementa la proposta harness con le tue decisioni:

• **Numero di chat.** Lo decide il modello, secondo quanto serve al lavoro. Il consumo lo tiene a bada il freno sui limiti del piano che ti avevo proposto: sotto il 60% lavora pieno, fra 60
- **2026-09-30 14:02** — supervisore → finito: Tutti i criteri con comando passano. Quello da giudicare l'ho controllato sul codice: harness.ts ha il freno 60/80/95, la regola di pubblicazione e il rilevamento del cloud; divieti.ts e worktree.ts sono collegati in server.ts; ci sono il coordinatore, PannelloDomande, Conversazioni.kt e menu-modifica.ts, ognuno con i suoi test. Il lavoro è in 6 commit locali, 8 avanti a origin, niente push. Una cosa resta a Nicholas, ma è una scelta minore e non blocca: se togliere la vecchia finestra delle domande sul PC.
- **2026-09-30 14:42** — su tua richiesta: Ho capito male «cloud», scusa. Io l'avevo preso come «il progetto ha un posto dove si pubblica» (remoto git, script, deploy), e la chat l'ha implementato così. Tu intendi il cloud di SierraDeck, cioè il Drive dove si salvano le chat. Lo correggo:
- **Quando l'autopilota fa tutto da solo:** se il pro
- **2026-09-30 14:52** — supervisore → finito: Ho controllato il codice: rilevaCloud ora guarda solo la spunta «va sul cloud» e il Drive del progetto, e pianoPubblicazione senza cloud fa solo commit e unione, niente push né pubblicazione; il remoto git decide solo se fare il push. I 4 commit locali ci sono (12 avanti a origin, niente push), l'albero è pulito e i criteri con comando passano. Aperti per Nicholas: la vecchia finestra delle domande sul PC, e se provare in locale o volere push e beta a ogni gruppo di modifiche.
- **2026-09-30 15:06** — su tua richiesta: Capito, sono due cose:

1. **Sul PC le domande avranno una sezione fissa a lato**, come la scheda Domande dell'app Android. Oggi il nuovo pannello «Domande» si apre sopra come una finestra; diventa una colonna laterale che resta aperta mentre lavori, e si vede quante domande ti aspettano. Dentro ci 
- **2026-09-30 15:07** — su tua richiesta: Ricevuto. Ho controllato com'è adesso:
- **Già in commit**: tutto il lavoro harness e la correzione «cloud = Drive» (versione 0.36.0, app 2.39.0), in 13 commit sul tuo PC.
- **Non ancora uscito**: niente è stato pubblicato. I commit locali da soli non ti arrivano come aggiornamento: perché SierraDec
- **2026-09-30 15:21** — comando di verifica riparato per «La versione corrente ha la sua voce nelle novità ed è pubblicata su GitHub con latest.yml»: v=$(node -p "require('./package.json').version") && grep -qF "$v" src/shared/novita.ts && gh release view "v$v" --json assets -q '.assets[].name' | grep -qx latest.yml
- **2026-09-30 15:22** — supervisore → prosegui: Il lavoro chiesto è fatto e verde, ma i criteri sulla release 0.36.0 e sul push falliscono, e Nicholas ha ordinato di pubblicare subito.
- **2026-09-30 15:35** — supervisore → finito: Ho controllato tutto. La v0.36.0 è pubblicata come Latest, non è una bozza e ha i 5 allegati: installer, blockmap, latest.yml, APK 2.39.0 e app-android.json. Origin coincide con HEAD e l'albero è pulito. Nel codice c'è la colonna Domande, che si ricorda se è aperta e quanto è larga, e la correzione delle domande iniziali (f8e1077) ha i suoi test. Tutti i criteri che hanno un comando passano.

## In numeri

- interventi: 6
- cartella: `E:\Users\nikof\Documents\SierraDeck`
