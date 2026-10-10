---
titolo: "Quaderno personale (0.57.0, app 2.57.0): dati riservati cifrati sul PC, consenso a ogni richiesta delle chat"
quando: 2026-10-10T17:25:00+02:00
tag: ["quaderno-personale", "privacy", "consenso", "mcp", "cifratura", "safeStorage", "domande", "telefono"]
---

# La richiesta

Nicholas (10/10) aveva dato i suoi dati legali (email di contatto, sede, partita IVA) per le pagine pubbliche. Da qui la regola: **mai** nel codice, nei test, nel quaderno del repo, nei commit o nelle note delle release.

Ne è nata una funzione: un posto dove questi dati stanno solo sul PC, e che le chat possono usare solo con il suo consenso.

# Come funziona

- **Regole e testi**: `src/shared/quaderno-personale.ts`.
  - `controllaVoce`; `trovaVoce`, che ignora maiuscole, accenti e punti; `sceltaDaRisposta`, prudente: tutto ciò che non è chiaro vale «no»;
  - `testoDomandaConsenso`, `testoEsito`, `valoreNascosto`.
- **Disco** (`src/main/quaderno-personale.ts`):
  - `<dati>/quaderno-personale.cifrato`: AES-256-GCM, in base64, con una chiave casuale;
  - la chiave sta in `quaderno-personale.chiave.json`, avvolta da `safeStorage` (DPAPI, legato all'utente Windows). È lo stesso schema delle password SFTP;
  - copiato su un altro PC o utente, il file non si apre, e il programma **non lo sovrascrive** (`disponibile: false` con il perché);
  - non va sul Drive.
- **Le chat**: lo strumento MCP **`chiedi_dato_personale(voce, motivo)`** nel server di `manda_al_telefono` (`mcp-telefono.ts`), con il gettone per sessione. Dal gettone il PC sa quale chat chiede. Il motivo è obbligatorio.
- **Il consenso** passa dalle **Domande**:
  - `id = dato-personale:<id>`, opzioni «Consenti una volta» / «Sempre per questa chat» / «No»;
  - `domande` e `rispondi` in `index.ts`, come le conferme di `manda_al_telefono`;
  - così arriva da solo al PC (colonna Domande: decisione 0.37.2, niente finestre sopra), alla pagina e all'app, **con la notifica** della Ronda e la risposta veloce;
  - senza risposta in 120 s vale no. Le richieste vivono in memoria: un riavvio le chiude come no.
- **«Sempre per questa chat»** vale per la **sessione** di Claude Code e per quella voce. Si revoca dalle Impostazioni (PC, pagina, app). Togliere una voce toglie anche i suoi «sempre».
- **Elenco degli usi**: chi, quale voce, il motivo, l'esito. Ci sono anche le voci assenti e i «no». Ne tiene 500 e non contiene mai il valore.
- **Chi può gestirlo**: lo schermo del PC (IPC `quadernoPersonale:*`) e i telefoni accoppiati **direttamente** a quel PC (`/api/quaderno-personale*`, visore `tel:`).
  - Un altro PC o un telefono che passa dal ponte ricevono 403 con la spiegazione.
  - L'app non mette la rotta in `Ponte.ROTTE`, e `PcIndietro` non la conta fra le funzioni «mancanti» degli altri PC.
- **Al primo avvio della 0.57.0** il quaderno è vuoto: i dati li inserisce Nicholas. Il programma non ne propone nessuno, perché non li ha da nessuna parte.

# Test

- `tests/main/quaderno-personale.test.ts`:
  - file cifrato, senza testo in chiaro;
  - riapertura;
  - portachiavi di un altro utente, file manomesso, portachiavi assente;
  - una volta, sempre, no, nessuna risposta, voce assente, motivo mancante;
  - revoca, togliere una voce;
  - lo strumento MCP;
  - le rotte (403 per PC e ponte).
- `tests/shared/quaderno-personale-app.test.ts` scrive `android/app/src/test/resources/quaderno-personale/quaderno-0.57.json`; `QuadernoPersonaleTest.kt` lo rilegge (lettura, esiti, valore nascosto, PC vecchi).
- `tests/main/client-pagina.test.ts` esegue `quadernoPersonaleHtml`, con il valore nascosto finché non si tocca «Mostra».

# Attenzione

Un dato consentito entra nella conversazione di Claude Code, quindi arriva anche ad Anthropic, e la chat potrebbe scriverlo dove non deve. Lo strumento lo ricorda nella risposta («non scriverlo nel repository…»), e l'informativa privacy lo dice. Il consenso resta la vera barriera.
