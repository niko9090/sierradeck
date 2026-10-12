---
titolo: "Matrice di controllo a tappeto (0.68.0): ogni funzione provata dal vero fra i 3 PC e il telefono"
quando: 2026-10-12T21:40:00+02:00
tag: ["collaudo", "matrice", "controllo-completo", "0.68.0"]
---

Ordine di Nicholas (12/10): «controllo completo e a tappeto su tutte le funzioni,
una nuova versione che porta a risoluzione TUTTI i difetti». Prove fatte dal vero
il 12/10 sera sui 3 PC (PC fisso, portatile, desk-nik-glos) con dispositivo
temporaneo; il telefono = le stesse rotte attraverso il ponte (`/api/ponte`).
Chat e progetti di prova: «SierraDeck-prova-c2», «SierraDeck-prova-ap». Sulle
chat vere di Nicholas: solo lettura.

Strumenti (scratchpad `collaudo/`): `matrice.cjs` (letture sui 3 PC),
`prova-chat.cjs <pc>` (giro vero di una chat), `prova-autopilota.cjs <pc>`,
`pagina-vera.cjs` (la pagina servita compila).

Legenda: ✅ funziona · 🔧 era rotto, corretto nella 0.68.0 (con test) · ⏳ aperto

## Chat
| Prova | PC fisso | Portatile | desk-nik-glos | Esito |
|---|---|---|---|---|
| apri chat in un progetto (ponte = telefono) | ✅ | ✅ | ✅ | |
| domanda «trust this folder» → scelta dal telefono | ✅ | ✅ | ✅ | `opzione` = testo dell'opzione |
| scrivi + risposta letta (storia) | ✅ | ✅ | ✅ | |
| chiudi (prova) | ✅ | ✅ | ✅ | |
| riprendi in sottofondo | ✅ | ✅ | ✅ | |
| stato a schermo (lavora / aspetta) | ✅ | ✅ | ✅ | |
| chat di casa su altro PC data per «non avviata» | 🔧 | 🔧 | 🔧 | vedi D1 |
| «Riprendi» di un altro PC dal telefono | — | 🔧 | 🔧 | D3: 504 dopo 4 s |

## Workspace e progetti
| Prova | PC fisso | Portatile | desk-nik-glos |
|---|---|---|---|
| crea workspace = progetto (cartella nella radice) | ✅ | ✅ | ✅ |
| togli workspace | ✅ | ✅ | ✅ |
| niente workspace di sistema / doppioni / sessioni interne | ✅ | ✅ | ✅ |
| «Su altri PC» c'è, mai sé stesso, fionda visibile | ✅ | ✅ | ✅ (residente) |
| «Apri» da Su altri PC: chat vive là | 🔧 D1 | 🔧 D1 | — |
| pannello Progetti (niente progetti di sistema, spazio Drive) | ✅ | ✅ | ✅ |
| Lavora su questo PC / Togli | ✅ provati dal vero il 12/10 (0.66.3, progetto di prova: 24 file + 4 chat, fermo/ripresa, Annulla tutto) | | |

## Autopiloti, consegne, sottofondo, domande
| Prova | Esito |
|---|---|
| autopilota di prova sul portatile: crea, scheda, visto dal PC fisso fra «altri PC», ferma, archivia | ✅ |
| consegne dopo il riavvio (registro: «il servizio è ripartito con N messaggi… li rimetto in coda», consegne in sottofondo NexoraOS 19:07) | ✅ |
| «Domande» sul PC/telefono | 🔧 D4: 20–30 s per rispondere |
| «Riprendi» un autopilota lascia traccia | ✅ (0.67.2) |

## Collegamento fra PC
| Prova | Esito |
|---|---|
| strade: portatile LAN (~20 ms), desk-nik-glos Tailscale (~60–140 ms) | ✅ |
| chiave di casa: il ponte firma e passa su tutti | ✅ |
| rifiuti voluti del ponte (domande, salute, case di un altro PC) con il motivo | ✅ |

## Drive
| Prova | Esito |
|---|---|
| spazio: 14,9 GB su 16,1 (SierraDeck 6,4 GB: chat 4,5 · progetti 0,5 · sistema 0,4 · orfani 0,86) | ✅ misurato |
| salvataggio / arrivo / presenze | 🔧 D2: «403 Quota exceeded» per ore |
| copie di conflitto a catena | ✅ (0.67.1) |

## Aggiornamenti
| Prova | Esito |
|---|---|
| da soli alla quiete sui 3 PC (0.67.1 → 0.67.4 senza «Installa») | ✅ |
| «Installa là» | ✅ (0.67.1, ~2 min per PC) |
| app Android firmata Ferrari Consulenze (apksigner) | ✅ |
| release come bozza, poi pubblicata (niente «404 latest.yml») | ✅ (0.67.4) |

## Telefono (pagina e app: stesse rotte via ponte)
| Prova | Esito |
|---|---|
| pagina servita dal PC: compila, ha Progetti/Apri/Salute/Aggiornamenti | ✅ |
| negozio, quaderno personale, consumi, consegne, app (versione+APK), account | ✅ |
| file dei progetti | ✅ |
| PIN e ospite | ✅ letture; le azioni PIN cambiano le impostazioni di Nicholas: provate solo nei test |

## Difetti trovati e corretti nella 0.68.0
- **D1 chat «non avviate» quando lo sono** (caso fionda, 2267fc18): (a) «Apri»
  da «Su altri PC» metteva qui riquadri dal vivo verso chat che sul PC di casa
  non hanno un terminale (lì il workspace non è sullo schermo): ora «Apri» le
  fa partire là in sottofondo; (b) `trovaChatRemota` voleva l'id esatto: una
  chat ripresa con un id nuovo vale come aperta se stessa cartella e stesso
  titolo (una sola), e riquadro, workspace e casa passano all'id nuovo
  (`casa:idNuovo`). Test `chat-aperta-con-id-nuovo.test.ts`. Sul caso fionda
  l'id nuovo non c'era: la causa vera era (a).
- **D2 Drive oltre la quota di Google** («Total Query Cost per minute per
  user», fino a 751 errori l'ora dalle 16): la ronda delle presenze legge ogni
  30 s tre file per ognuno dei ~55 progetti del registro, quasi tutti assenti,
  e un «non c'è» non si ricordava. Ora si ricorda 3 minuti per chi legge; chi
  crea ricerca sempre (niente doppioni). Test `drive-ricerche-assenti.test.ts`.
- **D3 «Riprendi» di un altro PC dal telefono**: `/api/sessioni` via ponte
  scadeva a 4 s (504). Rotte lente anche per sessioni, ripresa, sottofondo,
  file (PC e app 2.68.0). Test `rotte-lente-del-ponte.test.ts`.
- **D4 Domande, Salute, Altri computer lenti (20–30 s)**: `postino.pc()`
  rileggeva i battiti dal Drive a ogni richiesta. Ora `pcSubito()`: un minuto
  di memoria, poi risposta subito e rilettura in sottofondo. Test in
  `progetti-posta-altrui.test.ts`.

## Aperti
- Il registro dei progetti ha molti doppioni per id (Wdeck ×4, Gestore ×3…):
  li unisce «stesso nome = stesso progetto» nella vista, ma moltiplicano i giri
  sul Drive. Da proporre a Nicholas una pulizia del registro.
- Pulizie del Drive (14,9 GB su 16,1): in attesa della conferma di Nicholas.
