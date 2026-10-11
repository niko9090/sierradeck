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
