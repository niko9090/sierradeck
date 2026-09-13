---
titolo: "L'autopilota e la bash sbagliata: perche' nessun criterio si poteva misurare"
quando: 2026-08-30T13:40:00+02:00
tag: ["autopilota", "criteri", "windows", "trappole"]
---

## Il sintomo

Tutti i criteri di un autopilota falliscono insieme, con lo stesso errore:

```
/bin/bash: C:UsersnikofAppDataLocalTempsierradeck-criterio-vLURTbcriterio.sh: No such file or directory
```

Le barre rovesce del percorso sono sparite. Non e' un file rovinato: e' un'altra
bash.

## La causa

`bashCandidati()` prende la prima `bash.exe` che trova nelle cartelle del PATH.
Su Windows 11 il PATH di ogni utente comincia con `C:\Windows\System32`, e li'
dentro c'e' **il ponte verso WSL**. E' una bash vera, di Linux, e non vede il
disco di Windows: le si passa `C:\Users\...\criterio.sh`, lei ne mangia le barre
rovesce e non trova niente. Il secondo candidato, lo stub dello Store in
`WindowsApps`, non e' migliore.

**In sviluppo non si vede.** Avviando il programma da dentro Git Bash, il PATH
comincia con `usr\bin` e la bash giusta vince per caso. Il difetto esce solo
lanciando il programma installato, dal menu Start, con il PATH di sistema.

## Cosa costa davvero

Non si perde una verifica: si perde la capacita' di concludere.

1. Ogni criterio torna «non misurabile» (uscita 127).
2. Il servizio conclude che i **comandi** dei criteri sono sbagliati e li fa
   riscrivere dal supervisore: comandi buoni, riscritti per un guasto che non era
   loro.
3. Il supervisore giudica il lavoro senza sapere niente, e l'autopilota prosegue
   a vuoto.

## La correzione (0.12.36)

`bashDaScartare()` in `src/autopilot-host/verifiche.ts`: si scartano per
**posizione** le bash sotto `System32`, `Sysnative`, `SysWOW64` e `WindowsApps`.
Non per nome: sotto quelle cartelle non c'e' nessuna bash che sappia leggere un
percorso di Windows.

E all'avvio il servizio scrive nel registro **con quale shell** gira i criteri.
Senza quella riga, una shell sbagliata si presenta solo come sei criteri che
falliscono senza motivo apparente, ed e' costato ore capirlo.

## Da ricordare

- Un errore che compare **su tutti i criteri insieme** non e' dei criteri: e'
  dell'ambiente. Prima di riscrivere il comando, guardare chi lo esegue.
- Quello che si trova nel PATH dipende da **come e' stato avviato il
  programma**. Provare da Git Bash non prova niente sull'app installata.

## Seconda trappola (2026-09-13): i colori di vitest nel file

Un criterio del tipo `npx vitest run > file; grep -qE '^ *Tests .*passed' file`
falliva con la suite verde. Su Windows picocolors accende i colori per il
solo fatto di essere su win32, anche senza terminale: nel file la riga del
riepilogo comincia con `ESC[2m` e `^ *Tests` non la trova. (Nel Bash di
Claude Code non si vede: lì `NO_COLOR` è impostato.) Rimedio nel repo:
`tests/riepilogo-semplice.ts`, reporter in coda a quello di serie
(`vitest.config.ts`), che stampa `Tests N passed (T)` in chiaro e una riga
`Tests … failed` solo se qualcosa è fallito. Insieme: `testTimeout` e
`hookTimeout` a 20 s, perché il verificatore lancia i criteri sotto carico.
