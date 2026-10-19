---
titolo: "0.80.0 riparatrice: cosa c'è davvero in main e bozza delle novità (c-7, 19/10)"
quando: 2026-10-19T13:50:13.093Z
tag: ["autopilota"]
---

Da v0.79.0 a main ci sono 94 commit, quaderno compreso. Verificati:
(a) Chiusura delle chat finite: aafccdb, 12f85e0, 4e1a0f3, 9f44b27. Vale solo dopo l'installazione.
(b) Il workspace cambia solo per scelta di Nicholas: 0c9d839, con src/renderer/cambio-schermo.ts e il registro con la causa; consegna in sottofondo; tornaNelSuoWorkspace e riprendiSessione da lontano non spostano più lo schermo.
(c) Fatta A METÀ, c28e4a9. Il workspace prende il nome scritto da Nicholas o il nome della cartella. Un autopilota senza nome prende ancora le prime 40 lettere dell'obiettivo (validation.ts:354, server.ts:3159): va nella 0.81.0.
(d) Niente cartelle vuote per i progetti di altri PC: aa3579b, cartella-workspace.ts. Nuova chat non crea più la cartella.
(e) Workspace senza autopilota: 2c00b19. C'è solo sul PC, nella Panoramica; per pagina e app va nella 0.81.0.
(f) Dati non riscritti vuoti: 7680168.
(g) Velocità: e244ef9, f27dd81, 1fe22c4, 469634b, 225636e, d18a2e7, 2897a8d, 6bec053.
(h) Grafica: 06d90db, 395744d, df0e094, 1a904c2, 8be2b61, cd208ae.
In più: 6bdf5e9, gli errori del main finiscono nel registro.

Bozza delle novità:
- Le chat finite si chiudono da sole, anche se il ramo è già unito o tolto.
- Il workspace sullo schermo cambia solo quando lo scegli tu; ogni cambio va nel registro con la sua causa.
- Il workspace di un autopilota prende il nome che scrivi tu o quello della cartella, non la prima frase.
- Un progetto che vive su un altro PC non crea più una cartella vuota qui.
- Un workspace senza autopilota lo dice e offre «Crea l'autopilota» (sul PC).
- Se un file dei workspace non si legge per un istante, non viene più riscritto vuoto.
- Pagina del telefono, Drive, progetti e app più veloci.
- Stati uguali su PC, pagina e app: «fermo» rosso, «ferma» a fine turno.
