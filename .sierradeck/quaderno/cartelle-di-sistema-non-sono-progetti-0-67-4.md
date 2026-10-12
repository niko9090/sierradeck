---
titolo: "Le cartelle di sistema non sono progetti, e i workspace creati per sbaglio si rimettono a posto (0.67.4)"
quando: 2026-10-12T20:30:00+02:00
tag: ["workspace", "progetti", "documents", "doppioni", "0.67.4"]
---

## Cosa è successo (12/10)
La 0.67.1 ha creato da sola un workspace per ogni progetto residente. Due errori:
- **«Documents»** (su PC fisso e desk-nik-glos): un «progetto» nato da chat
  che lavoravano in Documenti (cartella `…\Progetti SierraDeck\Documents`).
  `gruppoDiCartella` risale il percorso per nome, quindi **ogni chat sotto
  `…\Documents\…` finiva in quel progetto**: sul PC fisso 541 chat di
  `Documents\Portfolio` (i giri dell'analista), più NexoraOS e microcoat.
  Aprire quel workspace avrebbe acceso 541 terminali.
- **«NAS-film» accanto a «Nas film»** (desk-nik-glos): la creazione usava un
  suo confronto dei nomi (solo maiuscole e spazi), non la regola dei progetti
  `nomeNormalizzato` (maiuscole, spazi, punti, trattini, accenti). La 0.67.2
  l'aveva allargato, ma restava una copia: ora è la stessa funzione.

## La regola (Nicholas)
Mai la cartella utente, Documenti o la radice di un disco come progetto o
cartella di lavoro.

## Cosa fa la 0.67.4
- `eNomeDiSistema` (Documents/Documenti, Desktop/Scrivania, Downloads,
  Users/Utenti, OneDrive, AppData, «Progetti SierraDeck»): mai un progetto.
  Il pannello non li mostra, `gruppoDiCartella` li salta nel riconoscimento
  per nome, `workspaceDaCreare` non li crea.
- Un workspace creato dal programma tiene al massimo **8** chat
  (`MAX_RIQUADRI_CREATI`), le più recenti; le altre restano in «Progetti» e
  «Riprendi».
- `riordinaCreatiDalProgramma`, nel giro dei workspace dei progetti: tocca
  **solo** i workspace assenti dalla copia `workspaces.prima-dei-progetti.json`
  (cioè creati dal programma), mai quelli di Nicholas.
  - doppione per nome → riquadri uniti in quello di Nicholas, senza doppioni;
  - nome di sistema → tolto; ogni riquadro va nel workspace del suo progetto
    (dall'ultima cartella del percorso, `progettoDallaCartella`) **se esiste
    già**, altrimenti in «Predefinito»; al massimo 8 per gruppo.
- Test: `tests/shared/workspace-creati-rimessi-a-posto.test.ts`.

## Da chiedere a Nicholas
- «HomeAssistant» (creato sul PC fisso) e «HA»: nomi davvero diversi, li ho
  lasciati. Sono lo stesso progetto?
- «gen»: progetto vero (`…\Progetti SierraDeck\gen` su portatile e
  desk-nik-glos), residente il PC fisso dove però la cartella non c'è: il suo
  workspace qui è vuoto.

## Esito vero (12/10, ~18:55 UTC)
I tre PC sono passati alla 0.67.4 da soli. Al primo giro dopo il riavvio:
- PC fisso: «Documents» tolto; riquadri → NexoraOS 2, microcoat 1,
  Predefinito 10 (8 di Portfolio, le più recenti, + 2 che lavoravano in
  Documenti); le altre 533 chat di Portfolio restano in «Progetti»/«Riprendi».
- desk-nik-glos: «Documents» tolto (9 riquadri → Predefinito, perché lì
  NexoraOS/microcoat/prog_play non hanno workspace) e «NAS-film» unito in
  «Nas film» (era vuoto).
- portatile: niente da fare.
