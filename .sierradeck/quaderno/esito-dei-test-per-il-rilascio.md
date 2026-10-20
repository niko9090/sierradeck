---
titolo: "Esito dei test per il Rilascio: come si produce il file che legge il criterio (e perché worktree.test.ts andava a tempo)"
quando: 2026-10-20T13:05:00+02:00
tag: ["autopilota", "rilascio", "test"]
---

## Ultimo passo prima di pubblicare (0.81.0 e seguenti)

Il criterio «I test del programma passano» non lancia più la suite. Legge
`../SierraDeck.sierradeck-wt/esiti/test-<commit>.json`, dove `<commit>` è
`git rev-parse HEAD` **di main**. Il file deve dire: `success` vero, 0 falliti,
più di 4000 test.

1. Lavora in una cartella tua fuori dalla principale, per esempio
   `git worktree add ../SierraDeck.sierradeck-wt/esito-main main --detach`, con
   `node_modules` collegato con una giunzione a quello della principale.
2. Porta la cartella **esattamente** al commit di main: `git fetch`, poi
   `git checkout --detach main` (oppure `git merge main` su un ramo **senza
   commit tuoi in più**). Controlla che `git rev-parse HEAD` sia uguale a
   `git rev-parse main` e che `git status` sia pulito.
3. `mkdir -p ../SierraDeck.sierradeck-wt/esiti`, poi
   `npx vitest run --reporter=json --outputFile=../SierraDeck.sierradeck-wt/esiti/test-$(git rev-parse HEAD).json`
   (va lanciato dalla cartella del punto 2; il percorso è relativo a quella).
4. **Dopo ogni unione in main va rifatto**: un nuovo commit vuol dire un nuovo
   nome di file, e quello vecchio non conta più.

Con il PC carico la suite intera dura circa 19 minuti. Lanciala con
`run_in_background` e non tenere aperto un comando in primo piano.

## Il rosso per tempo di worktree.test.ts (20/10, ramo c-248)

Non era un difetto del codice. Con la CPU al 100% (62 node, una decina di
claude) un processo costa da 0,3 a più di 1 s solo per partire, e i test con
git vero ne lanciano circa 30 ciascuno. In più:

- il `beforeEach` lanciava 6 processi git per **ogni** test, anche per i due
  che git non lo usano, con il limite di 20 s degli hook;
- ogni `commit` e ogni `merge` lanciano anche
  `git maintenance run --auto --detach`. È un processo in più, che resta in
  sottofondo e pesa sul PC.

Correzione, solo nel test: il repository di partenza si crea una volta
(`beforeAll`) e si copia con `cpSync` per ogni test. Nel repository finto
anche `maintenance.auto=false` e `gc.auto=0`. I tempi limite non sono stati
toccati. Misura fatta da sola con il PC al 100%: il file passa da 143 s a
105 s, i test pesanti da 24–32 s a 13–15 s e quelli senza git da 2–3 s a 0,2 s.

Trappola per chi scrive test con git vero: conta i processi, non i secondi.
Con un contatore attorno a `gitReale` vedi quanti ne lancia ogni test, e quel
numero non cambia con il carico.
