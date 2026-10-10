---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-09-30T12:39:13.669Z
tag: ["autopilota", "finito"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

Analizzare a fondo l'app Android nativa di SierraDeck (Kotlin/Compose in android/app/src/main/java/it/ferrariconsulenze/sierradeck, 35 file) e la pagina mobile servita dal PC, e migliorarle rispetto allo scopo del programma descritto in PRODUCT.md: guidare più sessioni di Claude Code insieme e perdere meno tempo ad aprirle, ritrovarle e rimetterle in moto. Dal telefono l'utente deve poter vedere da lontano chi lavora, chi è fermo e chi aspetta lui, rispondere e rimettere in moto. Passi: (1) Fare l'inventario di cosa fa oggi l'app, schermata per schermata, e confrontarlo con le funzioni aggiunte al programma di recente (dalla 0.26 alla 0.34: sync nei due versi, coda condivisa, chat degli altri PC dal vivo con «su X · acceso/spento», scheda Domande, limiti del piano nei Consumi, autopiloti, «Installa» dal telefono, ritorno all'ultima composizione all'avvio, chat che non si apre con il motivo). Leggere src/main (le API /api/* che l'app usa), le note in .sierradeck/quaderno (soprattutto app-android-nativa.md e i mandati/rapporti di controllo) e le memorie. (2) Trovare difetti, incoerenze tra app, pagina servita e programma (nomi, testi, stati, funzioni presenti su un lato e non sull'altro, API cambiate) e problemi d'uso (troppi tocchi, informazioni nascoste, stato non leggibile a colpo d'occhio, testi troppo corti: Nicholas vuole spiegazioni complete in ogni pannello). (3) Correggere tutti i difetti e le incoerenze trovati, in tutti e due i lati del mobile (pagina servita + app nativa) e nel programma dove serve, e aggiungere un test per ogni difetto corretto dove si può (android/app/src/test, tests/ con vitest). (4) Fare i miglioramenti d'uso e di organizzazione che rendono l'app chiaramente migliore senza stravolgerla. Le funzioni nuove grandi NON vanno fatte: vanno scritte come proposte nel quaderno, con motivo, costo e priorità, perché decide Nicholas. (5) Scrivere tutto nel quaderno: un nuovo file .sierradeck/quaderno/2026-09-30-analisi-app-android.md con l'inventario, i difetti trovati (per ciascuno: causa, correzione, test), le incoerenze sistemate, i miglioramenti fatti, le proposte di funzioni nuove e cosa resta aperto; aggiornare anche app-android-nativa.md. Regole di prudenza: rispettare la REGOLA VERSIONI (patch per le correzioni, minor se c'è una funzione nuova; guardare prima i commit e fare git fetch, perché anche il portatile pubblica), aggiungere la voce in src/shared/novita.ts, alzare la versione dell'APK (versionCode/versionName) solo se android/ è cambiato. Fare commit in locale con messaggi in italiano come quelli già presenti. NON pubblicare release, NON fare git push e NON caricare APK: la pubblicazione la decide Nicholas. Il prodotto è di Nicholas Ferrari / Ferrari Consulenze: non toccare l'appId e non scrivere come proprietario il nome dell'account di accesso. Per compilare Android: cd android && gradle (non c'è il wrapper), JDK 21, SDK in E:\Android\Sdk.

## Come è finita

- ✅ Nel quaderno c'è il rapporto di analisi dell'app, con inventario, difetti corretti, incoerenze, miglioramenti, proposte e cose aperte
- ✅ Nel quaderno c'è la proposta di progetto per l'autopilota harness (stato di oggi, più chat in autonomia, rischi, scelte per Nicholas, tappe con costo e priorità), senza codice implementato
- ✅ I test del programma passano (compreso novita.test.ts, che vuole la voce della versione nuova)
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano, compresi quelli nuovi per i difetti corretti
- ✅ Il lavoro è in commit locali (niente modifiche lasciate fuori) e non è stato pubblicato niente

## Le mosse che contano

- **2026-09-30 12:06** — configurato da sé: Nel quaderno c'è il rapporto di analisi dell'app, con inventario, difetti corretti, incoerenze, miglioramenti, proposte e cose aperte · I test del programma passano (compreso novita.test.ts, che vuole la voce della versione nuova) · Il TypeScript del programma compila senza errori · L'app Android compila e i suoi test unitari passano, compresi quelli nuovi per i difetti corretti · Il lavoro è in commit locali (niente modifiche lasciate fuori) e non è stato pubblicato niente
- **2026-09-30 12:14** — su tua richiesta: Ricevuto, e sono d'accordo: l'autopilota deve diventare il nostro «harness», cioè l'ambiente in cui l'agente lavora sapendo tutto quello che il programma sa fare e usandolo da solo. Ti dico prima com'è oggi, poi cosa faccio.

Oggi ogni autopilota governa una sola chat. Le consegne (src/main/autopilo
- **2026-09-30 12:35** — supervisore → prosegui: L'unico criterio aperto è la proposta harness chiesta da Nicholas; il resto è verificato in commit 46501f8 con albero pulito.
- **2026-09-30 12:39** — supervisore → finito: Tutti i criteri sono soddisfatti e li ho verificati: il commit a5cd3b5 contiene solo il quaderno (la proposta harness più una riga in app-android-nativa.md), l'albero è pulito e main è 2 commit avanti a origin, quindi non c'è stato nessun push. Le scelte T0 (quante chat, quanto piano, cosa può fare senza chiedere) le fa Nicholas quando legge la proposta.

## In numeri

- interventi: 2
- cartella: `E:\Users\nikof\Documents\SierraDeck`
