---
titolo: "Le impostazioni rifatte (0.56.0, app 2.56.0): inventario, struttura unica, cosa è stato tolto e perché"
quando: 2026-10-09T13:30:00+02:00
tag: ["impostazioni", "aggiornamenti", "app", "pagina", "pc", "ricerca", "parità"]
---

# La richiesta (Nicholas, 09/10)

«Nelle impostazioni l'aggiornamento lo puoi mettere in alto all'inizio? E sistemare tutto il menu impostazioni che così com'è non serve a niente ed è fatto malissimo».

# Com'è fatta adesso

- **Una struttura sola:** `src/shared/impostazioni-struttura.ts`.
  - `SEZIONI` nell'ordine: Aggiornamenti, Computer, Chat e autopiloti, Drive e salvataggi, Aspetto, Notifiche, Info e aiuto.
  - `VOCI`: ogni voce con la frase su cosa fa e cosa succede se la cambi, le parole per la ricerca e dove c'è (`pc`, `app`, `pagina`).
  - `cercaImpostazioni`: tutte le parole, senza accenti né maiuscole, nell'ordine delle sezioni. `sezioniDi` nasconde le sezioni vuote di quel posto (il PC non ha Notifiche).
- **App:** la struttura arriva come file dell'APK, `android/app/src/main/assets/impostazioni.json`, scritto dal test vitest con `AGGIORNA=1`. `ImpostazioniVoci.kt` ha solo la ricerca, controllata sugli stessi casi del PC (`ImpostazioniVociTest`).
- **PC** (`PannelloImpostazioni.tsx`, scheda «Generali»):
  - ricerca in alto e sezioni con la testata e la spiegazione (`Testa`);
  - «Aggiornamenti» in cima (`SezioneAggiornamenti.tsx`): versione, Novità, stato con Cerca/Scarica/«Cosa cambia e installa» (la stessa finestra delle note, con l'evento `sierradeck:apri-installa`), ultimo tentativo anche fallito, scarica da solo.
- **App** (scheda Computer):
  - ricerca, poi le sezioni nello stesso ordine, ognuna con il titolo e la spiegazione del PC;
  - «Aggiornamenti» in cima: l'app con il suo controllo da solo della 0.43 e il computer con note e Installa;
  - in Info, «Copia i dettagli».
- **Pagina:** ricerca (`filtraImpostazioni`), Aggiornamenti in cima con le versioni e l'ultimo tentativo, Drive, Aspetto, Notifiche, Info con «Copia i dettagli».

# Inventario di prima (09/10) e cosa è cambiato

| Dove | Voce | Com'era | Adesso |
|---|---|---|---|
| PC | `salvaAllaChiusura` | **morta**: nessuno la legge, nessuna schermata la mostra (il salvataggio alla chiusura avviene sempre) | fuori dalle voci; la chiave resta nel tipo per non rompere i file vecchi |
| PC | «Torna ai valori di fabbrica» | la nota diceva «accento, chiarore, stile, porte» ma rimette **tutto** | nota corretta in «Info e aiuto» |
| PC | «Novità di questa versione» | **doppia**: in «Comportamento» e sul numero di versione | una volta sola, in «Aggiornamenti» (resta il numero in alto) |
| PC | «Scarica gli aggiornamenti da solo» | in «Comportamento»; la nota diceva «si installa alla chiusura», **falso** (`autoInstallOnAppQuit` è spento) | in «Aggiornamenti», con il testo vero: non installa mai da solo |
| PC | «Accetta il Client anche da fuori la rete» | sotto «Rete» | Computer |
| PC | «Manda a dormire le chat che lasci» | sotto «Rete», **fuori posto** | Chat e autopiloti |
| PC | Nome di questo PC | dentro Account → Altri computer | Computer (`NomeQuestoPc`, esportato) |
| PC | Domande e Consumi a lato | non in impostazioni, si accendono dalla barra | restano lì: metterle anche qui sarebbe **doppio** |
| PC | «Riparti al login» degli autopiloti | nel pannello Autopiloti | resta lì, con una riga che lo dice in Chat e autopiloti |
| App | Stile e chiarore | cambiavano il PC ma **l'app non si ridipingeva** | dopo il cambio l'app rilegge i colori (`Banco.applica`) |
| App | Novità del PC | mancava | le note arrivano con «Installa» del computer |
| App | Aggiornamenti | in fondo alla scheda Computer | in cima |
| Pagina | Aggiornamento | in fondo al pannello, senza ultimo tentativo | in cima, con le versioni e l'ultimo tentativo |

Le voci che non sono impostazioni (workspace, consumi, code dei progetti, salute) restano nella scheda Computer dell'app, dentro la sezione giusta.

# Test

- `tests/shared/impostazioni-struttura.test.ts`: ordine, spiegazioni, voci tolte, ricerca, la pagina, il file dell'app.
- `ImpostazioniVociTest.kt`: la stessa ricerca sui casi del PC, «Copia i dettagli».
- Provato dal vero sul PC (copia di prova): le sezioni in ordine; la ricerca «porta» → Computer, «novità» → Aggiornamenti, una parola che non c'è → «Niente con…».
