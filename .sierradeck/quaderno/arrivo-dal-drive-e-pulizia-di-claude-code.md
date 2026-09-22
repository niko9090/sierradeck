---
titolo: "Le 1.700 chat che scendevano dal Drive ogni giorno: la pulizia di Claude Code e la ritenzione (0.32.1)"
quando: 2026-09-22T15:40:00+02:00
tag: ["drive", "arrivo", "claude-code", "cleanupPeriodDays", "ritenzione", "registro"]
---

## Il sintomo (registro del fisso, 22/09)

`ARRIVO: 1683 chat` alle 02:01Z, `1698` alle 09:01Z, `1720` alle 12:54Z,
dodici minuti l'uno, tutte «scritte». Ieri (21/09) la stessa cosa con 19
chat OGNI 5 MINUTI, dopo ogni SALVA. Sul disco `~/.claude/projects` aveva
1.141 `.jsonl` prima dell'arrivo e 2.862 dopo: 1.746 dei 2.862 hanno la
data più vecchia di 30 giorni (l'arrivo rimette la data originale con
`utimes`, serve alla firma `size+mtime`).

## La causa

Claude Code **cancella da solo** le trascrizioni ferme da più di
`cleanupPeriodDays` (predefinito 30, in `~/.claude/settings.json`; vale
anche `settings.local.json` e i `--settings` da riga di comando). Lo fa
all'avvio di una chat, al massimo una volta al giorno: il marcatore è
`~/.claude/.last-cleanup` (oggi scritto alle 15:00:21 locali; la
finestra è 24 ore sulla sua mtime). Nel binario: `tengu_retention_sweep`,
`transcriptsDeleted`, `desktopSessionCleanupPeriodDays` (le chat di
Claude Desktop/Cowork sono esenti, le nostre no). Le trascrizioni nelle
sottocartelle `subagents/` non le ha toccate (26 vecchie sopravvissute).

Quindi: l'arrivo scarica una chat vecchia di un altro PC → Claude Code la
toglie al giro dopo → SALVA riscrive il manifesto locale con
`manifestoDiQui` (solo ciò che c'è sul disco) → `giaArrivata` non la
protegge più → scende di nuovo. Già noto dalla 0.24.1 (le «117 chat
rimosse»): allora si era protetto il Drive dalla cancellazione, non il
disco dal riscaricare.

Non provato al minuto: chi ha tolto i file fra le 11:13 e le 14:54 locali
(il marcatore dice 15:00). Poco importa: il giro esiste comunque.

## La regola (0.32.1, `src/main/cassaforte/ritenzione-claude.ts`)

- `giorniDiRitenzione(radiceClaude)` legge `cleanupPeriodDays` da
  `settings.json` e `settings.local.json` (intero ≥ 1, altrimenti 30).
- Nell'`arrivo()` automatico una chat **non sul disco** e ferma da più
  della ritenzione **resta sul Drive** (`fuoriRitenzione`). Il registro
  scrive una riga solo quando il numero cambia:
  `ARRIVO: N chat lasciate sul Drive perche' ferme da piu' di 30 giorni…`.
- Una chat già sul disco e più lunga sul Drive scende come prima.
- «Porta qui» dal catalogo non è filtrato: la porta, ma se poi non la
  tocchi Claude Code la toglie al giro dopo (e sul Drive resta). Detto nel
  pannello Drive.
- Test: `tests/main/cassaforte-arrivo.test.ts` (fresca scende, vecchia no;
  con `cleanupPeriodDays: 3650` scende) e `cassaforte-ritenzione-claude.test.ts`.

## Alternative scartate (per ora)

- Mettere `cleanupPeriodDays: 3650` nei `--settings` di ogni chat: le
  chat aperte da SierraDeck non pulirebbero più niente, ma un `claude` da
  terminale nudo sì (30): metà e metà, e decidere quanto tenere sul disco
  spetta a Nicholas.
- Non conservare la data all'arrivo: rompe `stessaFirma` e riporta il giro
  del 21/09 (data diversa = «più avanti»).
