---
titolo: "collegamento-rtc.test.ts: attesa corretta da c-4 su main, c-11 non la rifaccia"
quando: 2026-10-19T11:20:01.311Z
tag: ["autopilota"]
---

Il 19/10 c-4 ha portato l'attesa predefinita di `finche` (tests/main/collegamento-rtc.test.ts:94) da 2 s a 10 s, con un commit su main che tocca solo il test. Annulla la scheda «per c-11, attesa fissa in collegamento-rtc.test.ts:208»: c-11 non deve rifarla, perché nascerebbe un conflitto quando il suo ramo viene unito.
