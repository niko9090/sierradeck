---
titolo: "Una patch salvata a mano non entra con git apply: usare patch -p1 -F3"
quando: 2026-10-21T15:50:00+02:00
tag: ["git", "patch", "trappola", "revisione"]
---

Il 21/10 `note/revisione-c46.patch` (le correzioni della Revisione di c-46) non entrava più in main:
- `git apply --check` falliva su tutti i file;
- `git apply --3way` diceva «repository lacks the necessary blob», perché la patch non ha le righe `index <hash>..<hash>` e quindi git non ha la base per l'unione a tre.

Il codice era solo spostato di qualche riga (c-49 aveva cambiato `.clickable` in `.tocco`). `patch -p1 -F3 --dry-run < file.patch` ha mostrato che entravano tutte le parti: una con «fuzz 1», le altre con uno spostamento di righe. Si applica senza `--dry-run` e la parte con fuzz si ricontrolla a mano. `patch` lascia i fine riga CRLF dei file com'erano.

**Per non ricaderci:** una patch da tenere da parte si salva con `git format-patch` o `git diff --full-index`, che portano gli hash. Ancora meglio, si salva come commit su un ramo, così basta un cherry-pick.
