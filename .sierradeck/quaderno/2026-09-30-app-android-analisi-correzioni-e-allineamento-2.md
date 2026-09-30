---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-09-30T14:02:27.751Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

Implementare l'autopilota «harness» come da .sierradeck/quaderno/2026-09-30-autopilota-harness.md, con le decisioni di Nicholas del 30/09.
(a) Il numero di chat lo decide il modello in base all'utilità; il consumo lo governa il freno sui limiti del piano (60/80/95% della finestra di 5 ore più il limite settimanale); resta solo un tetto tecnico di sicurezza.
(b) La regola di pubblicazione si sceglie per progetto nella creazione dell'autopilota (beta: pubblica sempre / stabile: chiede / versione unica). Se il progetto va sul cloud o ha il cloud attivo (remote, script di pubblicazione o deploy), l'autopilota fa tutto da solo: commit, merge dei suoi rami, push e pubblicazione secondo quella regola. I divieti (chat e autopiloti altrui, Porta qui, account, preferenze, file fuori dalle sue cartelle) li fa rispettare il programma.
(c) Le tappe T1–T7: stato del programma in lettura, freno, git worktree con una cartella per chat, azioni con divieti, coordinatore con sotto-chat e filtro delle domande, unione dei risultati, albero delle chat su PC, app Android e pagina servita.
(d) La scheda Domande diventa una conversazione a messaggi, con l'autopilota dove c'è e con la chat che aspetta dove non c'è; su PC, app Android e pagina, con la stessa logica.
(e) Correggere il difetto per cui nella chat con l'autopilota non si può copiare il testo né incollare nella casella (PC, app, pagina), con un test.
Un test per ogni parte con logica. Versione 0.36.0 (minore) dopo git fetch, voce in src/shared/novita.ts, bump dell'APK. Aggiornare nel quaderno il file harness e app-android-nativa.md. Per SierraDeck stesso: solo commit locali in italiano, NIENTE push, release o caricamento dell'APK. Non toccare l'appId; il proprietario è Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ✅ Il file harness nel quaderno riporta le scelte fissate da Nicholas, cosa è stato implementato per ogni tappa e cosa resta aperto
- ⬜ Funzionano davvero e hanno i loro test: freno sui limiti del piano, git worktree per chat, regola di pubblicazione per progetto con rilevamento del cloud, divieti fatti rispettare dal programma, coordinatore con sotto-chat, Domande come conversazione (PC, app, pagina), copia e incolla nella chat dell'autopilota (lo giudica il supervisore leggendo codice e test)
- ✅ La versione è 0.36.0 con la sua voce nelle novità
- ✅ I test del programma passano (compreso novita.test.ts)
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano, compresi i nuovi
- ✅ Il lavoro è in commit locali (niente modifiche lasciate fuori) e non è stato pubblicato niente

## Le mosse che contano

- **2026-09-30 12:06** — configurato da sé: Nel quaderno c'è il rapporto di analisi dell'app, con inventario, difetti corretti, incoerenze, miglioramenti, proposte e cose aperte · I test del programma passano (compreso novita.test.ts, che vuole la voce della versione nuova) · Il TypeScript del programma compila senza errori · L'app Android compila e i suoi test unitari passano, compresi quelli nuovi per i difetti corretti · Il lavoro è in commit locali (niente modifiche lasciate fuori) e non è stato pubblicato niente
- **2026-09-30 12:14** — su tua richiesta: Ricevuto, e sono d'accordo: l'autopilota deve diventare il nostro «harness», cioè l'ambiente in cui l'agente lavora sapendo tutto quello che il programma sa fare e usandolo da solo. Ti dico prima com'è oggi, poi cosa faccio.

Oggi ogni autopilota governa una sola chat. Le consegne (src/main/autopilo
- **2026-09-30 12:35** — supervisore → prosegui: L'unico criterio aperto è la proposta harness chiesta da Nicholas; il resto è verificato in commit 46501f8 con albero pulito.
- **2026-09-30 12:39** — supervisore → finito: Tutti i criteri sono soddisfatti e li ho verificati: il commit a5cd3b5 contiene solo il quaderno (la proposta harness più una riga in app-android-nativa.md), l'albero è pulito e main è 2 commit avanti a origin, quindi non c'è stato nessun push. Le scelte T0 (quante chat, quanto piano, cosa può fare senza chiedere) le fa Nicholas quando legge la proposta.
- **2026-09-30 13:15** — su tua richiesta: Ricevuto, parto. Riapro il lavoro (era chiuso) e la chat implementa la proposta harness con le tue decisioni:

• **Numero di chat.** Lo decide il modello, secondo quanto serve al lavoro. Il consumo lo tiene a bada il freno sui limiti del piano che ti avevo proposto: sotto il 60% lavora pieno, fra 60
- **2026-09-30 14:02** — supervisore → finito: Tutti i criteri con comando passano. Quello da giudicare l'ho controllato sul codice: harness.ts ha il freno 60/80/95, la regola di pubblicazione e il rilevamento del cloud; divieti.ts e worktree.ts sono collegati in server.ts; ci sono il coordinatore, PannelloDomande, Conversazioni.kt e menu-modifica.ts, ognuno con i suoi test. Il lavoro è in 6 commit locali, 8 avanti a origin, niente push. Una cosa resta a Nicholas, ma è una scelta minore e non blocca: se togliere la vecchia finestra delle domande sul PC.

## In numeri

- interventi: 3
- cartella: `E:\Users\nikof\Documents\SierraDeck`
