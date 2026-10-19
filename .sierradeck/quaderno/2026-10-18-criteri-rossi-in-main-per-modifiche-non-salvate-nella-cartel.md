---
titolo: "Criteri rossi in main per modifiche non salvate nella cartella principale (18/10)"
quando: 2026-10-18T13:21:32.455Z
tag: ["autopilota"]
---

Alle 13:20 «Il TypeScript compila» e «I test passano» risultano rossi nella cartella principale, ma il codice a 76ed7c2 è verde. c-7 l'ha controllato nella sua copia: 406 file di test e 4191 test passati, Android verde. Il rosso viene da modifiche non salvate (né committate né in un ramo) in tests/main/pty-host-client.test.ts, dove alla riga 343 c'è un vi.waitFor su client.isRunning() con client possibilmente undefined (TS18048), e in tests/autopilot-host/verifiche-shell.test.ts. Qualcuno sta lavorando nella cartella principale invece che nella sua copia. Chi corregge (c-11) deve portare queste due modifiche nel suo ramo con client!.isRunning() (o un controllo prima), passare dalla Revisione, e poi la cartella principale va riportata pulita. Nessuno cancella a mano queste modifiche senza aver visto di chi sono. Nei test compare anche il rumore «AttachConsole failed» di node-pty: è innocuo.
