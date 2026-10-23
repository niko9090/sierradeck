---
titolo: "Guardia del PC: quando l'autopilota rimanda chat e test pesanti"
quando: 2026-10-23T22:00:00+02:00
tag: ["guardia-pc", "posti", "0.85.1", "prestazioni"]
---

# Guardia del PC (0.85.1)

Richiesta di Nicholas, 23/10: l'autopilota non deve mandare in crisi il PC.

**Quando scatta.** Si basa sulla misura che il guardiano prende ogni minuto (`creaMisuratore`, una media mobile di circa 3 minuti). Scatta in due casi:
- processore sopra l'85% in due misure a 60 secondi l'una dall'altra;
- memoria libera sotto il 15%: scatta subito.

Le regole sono in `src/shared/guardia-pc.ts` (`prossimaGuardia`).

**Cosa fa:**
- `postiAdesso()` dà solo i posti già occupati: nessuna chat nuova;
- a fine turno `misuraCriteri` gira con `tutti: false`, quindi i criteri pesanti tengono l'esito di prima (`rimandatoDal`);
- la riga «PC carico: aspetto · <misura> · consuma di più <programma>» va nell'indicatore (giallo), in `/posti-chat` e nel motivo di `aperturaPossibile`.

**Cosa non fa:**
- non chiude e non ferma niente, né le chat al lavoro né i programmi di Nicholas;
- `processi-pesanti.ts` legge `Get-Process` in sola lettura, una volta per episodio.

**Trappole:**
- Su Windows `os.loadavg()` è sempre 0: il carico viene da `os.cpus()`.
- `Process.CPU` di PowerShell conta i secondi totali da quando il processo è partito: per sapere chi consuma *adesso* servono due letture e la loro differenza. Un browser ha decine di processi con lo stesso nome, e vanno sommati.
- La verifica prima di «finito» rimisura tutto anche col PC carico: serve un esito fresco.
