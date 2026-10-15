---
titolo: "0.74.0: il workspace è l'ambiente dell'autopilota (vista a elenco) e le chat finite si tolgono da sole"
quando: 2026-10-15T22:30:00+02:00
tag: ["0.74.0", "autopilota", "workspace", "specialisti", "UI"]
---

Nicholas, 15/10: «A più chat finite tolte da sole, ma impostiamo di lavorare sempre con l'autopilota e il workspace è l'ambiente in cui opera, così ci evitiamo di aprire autopilota più una chat e sprecare risorse». Poi «Esatto procedi», con due decisioni:
- le chat normali restano, con «+ Nuova chat»;
- la vista nuova vale per i workspace nuovi. Quelli esistenti passano alla vista nuova solo con il suo ok, uno per uno, mai da soli.

# Come è fatto
- **Il segno della vista:** la preferenza del PC `workspaceElenco` (nomi), in `preferenze.ts`. Non sta nell'archivio dei workspace, perché troppe funzioni ricopiano `{nome, perSlot}` e un campo in più si perderebbe. Rinomina ed eliminazione la aggiornano dal main, con il nuovo parametro `dopoNome` di `registerLayoutIpc` e `rinominaInElenco`.
- **La vista** (`ElencoWorkspace.tsx`, `App.tsx`):
  - a sinistra gli autopiloti del workspace (`a.workspace === attivo`), con stato, ultima azione e riga dell'organizzazione, e i loro specialisti. Quelli senza riquadro sono in grigio: «chat chiusa» se hanno finito, «non aperta qui» se no. Sotto, «Altre chat»;
  - a destra il `Mosaic` con `solo=<paneId>`: tutti i riquadri hanno la misura piena, uno solo `visibility: visible`, e niente maniglie. **Mai** `display: none`, perché xterm misurerebbe zero colonne e Claude si ridisegnerebbe stretto;
  - quale chat sta davanti: `chatDavanti` (quella scelta, poi chi chiede, poi chi lavora). «Guarda» la porta davanti.
- **Accendere e spegnere:** Strumenti → «Vista a elenco per questo workspace» manda l'evento `sierradeck:vista-elenco`; «Mosaico» nella colonna la spegne.
- **«+ Nuovo autopilota»**, spunta «Nel suo workspace, a elenco», accesa di partenza:
  - `nomeWorkspacePerAutopilota` (al massimo 60 caratteri, «#2» se il nome è preso);
  - si accende la preferenza e si crea il workspace con `azioniDiFinestra().crea`, che trasloca il layout;
  - l'evento `sierradeck:rileggi-workspace` aggiorna la barra (senza, la barra restava sul workspace vecchio);
  - poi si crea l'autopilota con quel workspace. Nessuna chat in più.
- **Chat finite** (`shared/chat-governate.ts`, `chatDaSistemare`), applicata a ogni lettura degli autopiloti, e solo se l'elenco è stato letto:
  - `chat.stato === 'finita'` o autopilota `finito` → si uccide il pty e si fa `closePane`;
  - autopilota `sospeso`, `fallito`, archiviato o sparito → `liberaAutopilota`: la chat resta aperta ma torna di Nicholas.

  Prima `pane.autopilota` non si toglieva mai. Le chat finite si riaprivano tutte a ogni riavvio, e una chat di un autopilota fermo non arrivava mai alle Domande né al telefono.
- **Pagina e app:** `Specialista.chiusa` dal PC mostra «chat chiusa» al posto di «Guarda».
- **Cartelle:** `progettoVero` (in destinazioni-autopilota) non propone mai un worktree `.sierradeck-wt` come cartella di un autopilota nuovo. Le cartelle vuote dei worktree si tolgono all'avvio del servizio e a fine lavoro (`togliWorktreeVuoti`).

# Provato con i clic veri (copia di prova note/prova-073, foto in foto-0731)
- All'avvio i riquadri delle chat finite si sono chiusi da soli, da 10 a 2 (foto `10-dopo-avvio`, prima `00-avvio`).
- Vista a elenco accesa da Strumenti (`12`, `14`). «Mosaico» torna indietro (`22`).
- «+ Nuovo autopilota» crea «Prova elenco» e «Seconda prova», ognuno nel suo workspace a elenco, attivo nella barra, senza chat in più (`20`). Nella copia la preparazione si ferma per il login scaduto di Claude: è atteso.
- La pagina mostra «chat chiusa» sugli specialisti finiti (`p-12`); la scheda non scorre più di lato (`p-13`).

**Trappola:** l'heredoc di Bash ha mangiato i `\\` anche nei test (percorsi Windows). Per i file con le barre rovesciate usare Write o Edit.
