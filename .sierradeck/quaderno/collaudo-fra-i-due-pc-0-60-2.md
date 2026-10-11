---
titolo: "Collaudo fra i due PC veri (11/10, 0.60.x): come si fa da questo PC, e cosa ha trovato"
quando: 2026-10-11T10:40:00+02:00
tag: ["collaudo", "ponte", "altri PC", "pannello", "drive", "timeout", "0.60.2"]
---

# Come si collauda da qui verso il portatile, senza Nicholas

**La porta giusta.** 47630 è il servizio autopiloti, solo locale e senza ponte. Le API del telefono e il ponte stanno sul Client, porta 47640.

**La chiave.** Sul disco non c'è nessuna chiave riusabile: `dispositivi.json` tiene solo il segno SHA-256. Il programma rilegge il file quando cambia, quindi per il collaudo:
1. si aggiunge un dispositivo temporaneo con nome evidente («Collaudo Claude (temporaneo)») e il segno di una chiave generata nello scratchpad;
2. si toglie a fine prova, tenendo una copia del file di prima.

**Il ponte.** `POST /api/ponte {pc, percorso, corpo?}`.
- Senza `corpo` quel PC riceve una GET, con `corpo` una POST. Il pannello vuole la POST: serve `corpo: {}`.
- Da Git Bash si lancia con `MSYS_NO_PATHCONV=1`, altrimenti `/api/...` diventa `E:/Programs/Git/api/...`.

**Nessuna API crea una cartella su un altro PC.** `/api/apri`, `/api/sottofondo/avvia` e `/api/autopilota/crea` vogliono una cartella che esiste o che è già nota. Il progetto di prova si porta di là come farebbe Nicholas:
1. si crea qui;
2. si registra in `progetti-drive.json`, che si rilegge dal disco a ogni accesso;
3. dopo il salvataggio sul Drive, sul portatile si fa «Porta qui» (`/api/drive/azione`).

**Divieti dello stop hook.** Il controllo dei comandi blocca anche le stringhe con le rotte vietate agli autopiloti (fermare un autopilota), perfino dentro un test. Nei test si usa un'altra rotta.

# Cosa ha trovato (corretto nella 0.60.2)

**Il pannello del Drive non arrivava mai attraverso il ponte.**
- Sul PC il pannello impiegava 15 secondi: `leggiPannello` riscaricava e decifrava il manifesto del Drive (oltre 12 mila voci) a ogni lettura.
- `pc-remoto` aspettava 4 secondi per ogni richiesta, e l'app 15. Il risultato era un 502 con il messaggio sbagliato «ha cambiato indirizzo mentre mandavo: non so se il testo è arrivato».

**Correzioni:**
- `ROTTE_LENTE` in `pc-remoto.ts` (pannello e azioni del Drive): 45 secondi;
- `ROTTE_LENTE` dell'app, valida anche attraverso il ponte (`lenta = percorso in ROTTE_LENTE`);
- `memoriaBreve` tiene il manifesto del pannello per 60 secondi, e il registro scrive `[pannello] pronto in N s` quando supera 3 secondi;
- una richiesta scaduta mentre quel PC risponde allo stesso indirizzo dà ora «risponde, ma non ha finito entro N secondi», non «ha cambiato indirizzo».

**Test:** `tests/main/pc-remoto.test.ts` (richieste lente), `tests/shared/memoria-breve.test.ts`, `ProgettiUnificatiTest.kt`.

# Il secondo difetto (corretto nella 0.60.3)

**Un progetto messo sul Drive da un PC non compariva nel pannello dell'altro.**
- Il registro dei progetti sale sul Drive come un file qualunque (`sierradeck/progetti-drive.json`, vince il più recente).
- Il registro di un PC impara i progetti degli altri **solo** in `eseguiFusione` («Fondi con il Drive», «Porta qui»), che scrive `fondiRegistri(qui, Drive)`.
- Il pannello (`leggiPannello`) leggeva solo il registro di qui, e l'azione `porta-qui` rispondeva «Progetto sconosciuto» prima ancora di chiedere al catalogo, che invece unisce il registro del Drive e trova il progetto per id.

**Correzione.**
- `registroConIlDrive` (in `fusione.ts`) dà il registro di qui più i progetti del registro sul Drive che hanno file sotto `progetto-<id>/`. Così un progetto tolto con «Togli», che non ha più file, non ricompare.
- Il registro sul Drive si legge con il manifesto, nella stessa memoria di 60 secondi.
- Serve solo per guardare: il registro di qui si scrive solo dalla fusione di «Porta qui».
- `porta-qui` accetta anche questi progetti e scrive `[allinea] porta qui «…»` con l'esito.

# Il terzo difetto (corretto nella 0.60.4): il ponte non lasciava traccia

**Il problema.** Dal telefono, attraverso il ponte, si scriveva o si apriva una chat sull'altro PC, e nel registro del PC ponte restava solo `[ponte] il telefono guarda X`, una volta. I passi `[apertura]` (avvio in sottofondo, pronta, testo consegnato) li scriveva solo il riquadro del PC (IPC `remoto:sottofondo`).

**Correzione.**
- `ponteVersoPc` manda `/api/sottofondo/avvia` alla stessa funzione del riquadro (`sottofondoRemotoGlobale`), con il visore del telefono per il PIN. Così il telefono lascia gli stessi passi `[apertura]` e lo stesso seguito fino al testo consegnato.
- Le altre azioni passano da `azioneDelPonte` (in `shared/ponte-telefono.ts`) e scrivono `[ponte] dal telefono: … su X: fatto (strada …)` oppure `NON riuscito — …`. Le letture non si scrivono.

**«Riapri là» sull'altro PC cambia ciò che si vede là.** `apriNelSuoWorkspace` porta la prima finestra nel workspace della chat: è voluto. Nel collaudo si rimette il workspace di prima con `POST /api/workspace {nome}` attraverso il ponte.

# Il quarto e il quinto difetto (corretti nella 0.60.5)

**La prima chat di un progetto appena portato non partiva da lontano.** `deps.cartelle()` (le cartelle «conosciute», usate da `/api/sottofondo/avvia`, `/api/apri`, `/api/autopilota/crea`) veniva solo dalle trascrizioni delle chat. Un progetto arrivato con «Porta qui» non ne ha, quindi 403 «cartella non conosciuta». Ora contano anche i percorsi di questo PC nel registro dei progetti, se esistono.

**Ogni 403 diventava «arriviamo da fuori la sua rete locale».** `messaggioErroreRemoto('rifiutato')` ignorava il motivo detto da quel PC. Ora solo il 403 della rete (`RIFIUTO_DI_RETE`, «solo dalla rete locale», condiviso con `client-server.ts`) dà quella spiegazione. Gli altri dicono «X rifiuta la richiesta: «motivo»».

**Non toccato (da decidere se serve):** il registro sul Drive resta «vince il più recente». Un'unione vera a ogni salvataggio, come per `workspaces.json`, chiederebbe le lapidi per «Togli».

# Esito del collaudo (11/10, 09:17–09:28 UTC, portatile alla 0.60.5, questo PC alla 0.60.4)

Le righe del registro di questo PC (`[apertura]`, `[ponte] dal telefono`, `[autopiloti]`, `[rimozione]`):

**Chat di prova chiusa sul portatile.** Da qui `/api/sottofondo/avvia` con il testo:
- «avviata in sottofondo … nessun riquadro, nessuna finestra»;
- poi «aspetta una scelta»: era la domanda di fiducia di Claude Code sulla cartella nuova, con «No, exit» come scelta predefinita;
- risposta con `/api/scegli` «Yes, I trust this folder», poi «testo collaudo-msg-0001 consegnato … apertura remota riuscita»;
- la chat ha risposto «ricevuto».

Sul portatile il workspace attivo (MT5) e i suoi riquadri sono rimasti uguali.

**Autopilota di prova.**
- Creato, scheda letta, messaggio con `[autopiloti] scrivo all'autopilota …: fatto`. Ha risposto nel dialogo e ha finito da solo (ciao.txt).
- **Fermare e far riprendere non l'ho fatto io:** un divieto di Nicholas (`ROTTE_VIETATE` in `autopilot-host/divieti.ts`) impedisce a una chat governata di fermare un autopilota. Non va aggirato: lo prova Nicholas, con un clic.
- Un autopilota «finito» non si archivia: per scelta, l'archivio serve a togliere gli avvisi dei fermi (`eFermo`).

**Workspace.** «Riapri» (`/api/sessioni/riprendi`) ha aperto la chat di prova nel suo workspace «SierraDeck-prova-collaudo», non in MT5. Poi `POST /api/workspace {nome:'MT5'}` ha rimesso lo schermo com'era.

**Pulizia.**
1. Questo PC è diventato residente del progetto di prova.
2. Sul portatile «solo cloud»: il confronto ha copiato qui ciao.txt e le note in `.sierradeck/recuperati/…`, poi «Conferma» ha messo la cartella nel recupero (30 giorni).
3. La copia di questo PC è andata nel recupero con `spostaCartellaInRecupero`, da uno script tsx con `--tsconfig tsconfig.json`, che serve per gli alias `@shared`.

# Trappole del collaudo

- **Autopilota creato senza `workspace`:** usa il workspace che quel PC ha davanti. Il riquadro della sua chat è comparso in MT5 sullo schermo del portatile. Va sempre creato prima un workspace di prova e passato in `workspace`.
- **`/api/workspace/crea` rende attivo il workspace nuovo** su quel PC: cambia lo schermo là. Nel collaudo si rimette subito quello di prima.
- **`/api/stato` elenca solo le chat del workspace attivo.** `/api/chat/sposta` e `/api/chat/dormi` di una chat in un workspace non attivo rispondono 404: bisogna passare a quel workspace, agire e tornare indietro.

# Proposte per Nicholas (non cambiate: sono scelte sue)

1. Un workspace creato **da lontano** (telefono o altro PC) non diventa attivo sullo schermo di quel PC.
2. Un autopilota creato da lontano senza workspace va in un workspace suo, con il suo nome, e non in quello che quel PC ha davanti.
