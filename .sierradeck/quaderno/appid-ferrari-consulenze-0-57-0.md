---
titolo: "appId Windows passato a it.ferrariconsulenze.sierradeck (0.57.0): GUID fissa, collaudo dell'aggiornamento"
quando: 2026-10-10T17:10:00+02:00
tag: ["appid", "installer", "nsis", "aggiornamento", "guid", "appusermodelid", "collaudo", "proprietà"]
---

# La decisione

Nicholas (10/10): il vecchio nome va tolto ovunque, anche dall'appId di Windows. Questo supera la vecchia regola «l'appId non si tocca». Android era già `it.ferrariconsulenze.sierradeck` dallo Stadio 1 dell'app nativa.

# Cosa c'era da temere

electron-builder ricava dall'appId due cose:
- **la GUID dell'installazione** (UUID v5 dell'appId): la chiave in «App installate» (`HKCU\…\Uninstall\<guid>`), `HKCU\Software\<guid>` con `InstallLocation`, e il mutex dell'installer. Con un appId nuovo e una GUID nuova, l'aggiornamento automatico avrebbe installato **un secondo programma**, con due voci in «App installate»;
- **l'AppUserModelID** scritto nei collegamenti del menu Start e del desktop.

# Come è fatto

- `electron-builder.yml`: `appId: it.ferrariconsulenze.sierradeck` e **`nsis.guid: 8e5eec75-f025-512f-b3e4-78d055eb2b1f`**, la GUID delle installazioni di prima. Non va cambiata. È solo un'impronta e non contiene il vecchio nome.
- `src/main/identita-app.ts`:
  - `APP_ID` e `GUID_INSTALLAZIONE`;
  - `app.setAppUserModelId(APP_ID)` in `index.ts`, prima del lucchetto, così finestra e collegamenti hanno lo stesso AUMID. Prima il programma non lo dichiarava.
- `build/installer.nsh` (`nsis.include`), macro `customInstall`: aggiorna l'AUMID anche del collegamento **fissato sulla barra delle applicazioni** (`User Pinned\TaskBar\SierraDeck.lnk`). L'installer da solo rifà solo quelli del menu Start e del desktop.
- Test: `tests/main/identita-app.test.ts`.

# Collaudo dell'aggiornamento (10/10, copia di prova)

Fatto con due installer di collaudo con nome diverso (`SierraDeckCollaudo`, cartella, collegamenti e voce propri), mai sul programma vero:
- il vecchio dal tag `v0.56.4` (worktree);
- il nuovo con la configurazione di adesso;
- appId di prova al posto del vecchio, GUID ricavata da quello.

Esito:
1. Installata la «0.56.4», avviata con `SIERRADECK_PROVA` per creare i dati, aggiunto un collegamento fissato finto.
2. Lanciato il nuovo installer come fa SierraDeck Update (`/S --update-if-installed`): uscita 0 in 47 s.
3. **Una sola voce** in «App installate», stessa GUID, versione nuova. Stessa cartella (`InstallLocation` invariata). La chiave della GUID nuova **non esiste**.
4. **Dati identici** prima e dopo: sha256 di tutti i 48 file uguali.
5. Menu Start, desktop **e collegamento fissato** con l'AUMID nuovo.
6. La versione nuova è partita e ha riconosciuto i dati: «prima volta con la 0.56.5 (venivo dalla 0.56.4)». Il collaudo era numerato 0.56.5; la configurazione dell'installer è la stessa della 0.57.0.
7. Notifiche: Windows accetta le notifiche per l'AUMID nuovo (ToastNotificationManager, prova silenziosa poi cancellata). Il programma per PC oggi non mostra notifiche di Windows: le notifiche sono quelle dell'app Android e del browser, e non dipendono dall'appId.
8. Disinstallato il collaudo: niente resti, la voce vera intatta.

# Trappola trovata durante il collaudo

La prima volta le porte della copia erano in cima a `impostazioni.json` invece che dentro `preferenze`, quindi ignorate.
- La copia ha usato la 47630 del servizio autopiloti vero e, versione diversa, l'ha «sostituito» tre volte, spegnendolo.
- Ha ritirato le consegne «riprendi» di due autopiloti veri: le chat vere non le hanno ricevute. I dati degli autopiloti non sono cambiati.
- Da 0.57.0, con `SIERRADECK_PROVA`, il programma **sposta da solo** le porte predefinite su 47650/47651 (`portePerLaProva`).
- Ricetta corretta nella scheda `gestire-dal-telefono-chat-workspace-autopiloti.md`.
