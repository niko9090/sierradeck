---
titolo: "Notifiche solo utili (0.74.0, app 2.74.0): inventario, regola, interruttori"
quando: 2026-10-15T20:30:00+02:00
tag: ["notifiche", "android", "pagina", "0.74.0"]
---

Nicholas, 15/10: «ne arrivano troppe e senza alcuna rilevanza, devi ricevere solo notifiche utili».

# Inventario: dove nascono
| Dove | Cosa | Prima |
|---|---|---|
| `Ronda.consuma` ← `Avvisi.daAnnunciare` (app). Gira a ogni `/api/stato`: ogni 2 s con l'app aperta, ogni 5 s con il servizio in primo piano (`GuardiaService`, il «controllo continuo»), ogni pochi minuti con la sveglia (`Sentinella`/WorkManager) | domande `d:`, scelte `k:`, chat che aspetta `c:`, autopilota finito `f:`, fermo `s:`, pronto `p:` | una chat non governata avvisava **a ogni turno finito**, anche se ripartiva dopo 20 s; scelta e attesa della stessa chat erano due notifiche; un autopilota poteva averne tre (fermo, pronto, finito) |
| `RicevitoreConsegne.notifica` (Consegne.kt) | un file mandato dal PC al telefono | una per file, sempre |
| `ControlloApp` (WorkManager su GitHub) | app nuova uscita | una per versione |
| `GuardiaService` | la riga fissa del controllo continuo | solo se lo accendi (obbligo di Android) |
| pagina, `avvisaSeServe` in client-pagina.ts | le stesse dell'app, con le Notification del browser | la chat a ogni turno, con un tag diverso per scelta e attesa |

**Un'ora normale.** Tre chat proprie che finiscono un turno ogni 5-8 minuti danno 20-35 avvisi «aspetta te». Ci si aggiungono un paio di file consegnati e qualche scelta. **Dopo:** le stesse tre chat danno zero avvisi se ripartono entro 3 minuti, e uno per chat se aspettano davvero. In più restano domande, finiti, fermi e versioni: di solito 0-3 in un'ora.

# La regola (Notifiche.kt, pura, con i test in NotificheTest)
Restano cinque tipi, ognuno con il suo interruttore (Impostazioni → Notifiche → «Quali notifiche»):
- **Domande e attese:**
  - domande e scelte suonano subito;
  - un autopilota che aspetta il via;
  - una chat che aspetta te **da almeno 3 minuti** (`ATTESA_CHAT_MS`; l'inizio dell'attesa si ricorda in `giaVisti` come `t:<id>:<ms>`).
- **Lavoro finito** (`f:`).
- **Lavoro fermo** (`s:`).
- **Versione pronta:** l'app nuova (ControlloApp) e il computer con l'aggiornamento in fase `pronto` (`v:pc:<versione>`). La installa sempre Nicholas.
- **Computer scollegato:** dopo 5 minuti senza risposta (`PERSO_DOPO_MS`). Il ritorno si dice solo se il «perso» era stato detto, con lo stesso numero, così la notifica nuova sostituisce la vecchia.
- **File ricevuti:** spento di partenza (sono «consegne»). Il file sta comunque nella sezione File.

**Una notifica per chat e una per autopilota:** `ID_CHAT` e `ID_AUTOPILOTA`. Un evento nuovo della stessa chat cancella quello di prima e suona; lo stesso evento aggiornato non suona (`EXTRA_CHIAVE` nella notifica).

La pagina segue la stessa regola: i 3 minuti, il tag `chat-<id>` per scelta e attesa, la versione pronta.

**Trappola:** i nomi dei test Kotlin fra backtick non accettano `;` (errore «Name contains illegal characters»).
