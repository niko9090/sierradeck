---
titolo: "0.76.0 (c-27 + c-28): cause e correzioni, scheda tecnica"
quando: 2026-10-16T11:00:00+02:00
tag: ["0.76.0", "autopilota", "consegne", "elenco", "domande", "segnali"]
---

# A, B, C, D (c-27). Il rapporto per Nicholas, con i numeri, è in `rapporto-0-76-0.md`
**A. La promessa diventa lavoro.**
- Causa provata: il 15/10 alle 21:50:59 l'autopilota era «finito». La risposta a Nicholas ha applicato un cambio senza `comando: "riprendi"`, e la chat è rimasta ferma finché lui non ha riscritto «vai fatto».
- Correzione: `ripartenzaDopoDialogo` in `src/autopilot-host/dialogo.ts`. Un messaggio per la chat o un cambio fanno ripartire un autopilota fermo; in attesa diventano la risposta alla domanda; al lavoro con la chat ferma, forzano il giro. Collegato in `rispondiAlDialogo` (server.ts).
- La riga «L'autopilota è fermo: Riprendi» (`promessaSenzaLavoro` in `src/shared/promessa-autopilota.ts`) c'è su PC (ChatAutopilota), pagina (`fermoConPromessa`) e app (Lavori.kt).
- Test: `dialogo.test.ts` (0.75.4) e `promessa-autopilota.test.ts`.

**B. Consegne al primo Invio.**
- Causa provata con Claude Code 2.1.301: se testo e Invio arrivano nello stesso pezzo, un testo da 70 caratteri in su vale come incollato. L'Invio non manda, e nemmeno il primo Invio da solo dopo.
- Il 16/10 (c-26) il riquadro si rimontava e il segnale «aspetta» diceva «pronta» subito: c'è voluto un Invio dopo l'altro, e «perso» ha fatto riscrivere il testo, che era nel campo (5 copie nel messaggio).
- Correzione: si scrive solo a terminale quieto (`quieto`); l'Invio parte solo quando il testo si vede nel campo (`testoNelCampo`, `nelCampo`); niente riscrittura se il testo è nel campo. Vale anche per il sottofondo (`sottofondo.ts`, niente più Invio a tempo).
- Test: `consegna-al-primo-invio.test.ts`.
- Banco dal vero: `banco-consegne.ts` nello scratchpad, con Claude Code vero, gli hook http dei segnali e lo stesso `eseguiConsegna`.

**C. Elenco a sinistra.**
- `vociInOrdine` (ordine del layout, niente doppioni) e `chatDavantiStabile` (scelta per workspace, niente salti) in `src/shared/vista-elenco.ts`, collegati in App.tsx. Una riga per chat in ElencoWorkspace.
- Test in `vista-elenco.test.ts`. Prova con clic veri fatta: 60 clic, 0 cambi d'ordine, 0 doppioni.

**D. Riquadro «Documents».**
- `senzaRemotiDiSistema` in `workspace-riparazioni.ts`, chiamata da `riparaListaAllAvvio`. Sui dati veri toglie solo «Documents» in visitafacile (casa DESKTOP), senza chiudere nessuna chat.
- Origine del percorso: la riparazione della 0.65.1 aveva preso `remoto.cwd`.

# E, F, G, H (c-28) e quello trovato nelle prove
- **E. Indicatore:** `indicatoreChat` in `segnali-chat.ts`, usato anche dal PC in App.tsx (prima si usava il solo flusso, `pensano`). Ci sono i segnali nuovi PreToolUse, solo per AskUserQuestion, e PostToolUse. Lo schermo vince su «chiede» solo se la finestra dice che non c'è una scelta aperta (`sceltaAperta`, che la finestra manda al main).
- **F. Pannello fisso:** `autopilotaDelWorkspace` in `vista-elenco.ts`. `DiarioAutopilota` va nella colonna di sinistra e nei riquadri c'è `senzaDiario`.
- **G. Specialisti:**
  - `dividiAllaRipresa` in server.ts (autopilot-host);
  - senza limiti letti `TETTO_SENZA_LIMITI = 2` (harness.ts);
  - ordine per ruolo in `specialistiDi`.
- **H. Domande brevi:**
  - `domandaBreve` e `domandeALato` in `domande-conversazioni.ts`, con `DETTAGLI_MAX` 1500, perché i dettagli stanno dietro il «?»;
  - PC: `DomandeALato.tsx`, nascosto se la colonna Domande è aperta;
  - pagina: `domandaALatoHtml`;
  - app: `DomandeALato.kt`.
- **Banda falsa:** una consegna ferma su una domanda della chat non è più un «guasto» con il tasto Invio.
- **Chat tolte che tornano dal Drive:** `slugChatInRecupero`, usata dall'ARRIVO in sincronia.ts.

# Trappole
- **Banchi dal vero nello scratchpad** (`banco-consegne.ts`, `banco-indicatore.ts`): si compilano con esbuild, con `state/layout` sostituito da uno stub. Lanciati da dentro una sessione di Claude Code, i claude.exe figli ereditano `CLAUDE_CODE_CHILD_SESSION` e non salvano le trascrizioni. È comodo, perché non lasciano storie.
- **Copia di prova con i dati veri:** `prepara-elenco.cjs` e `avvia-elenco.sh` nello scratchpad. Si copiano solo lista dei workspace, preferenze e stato della trasformazione; mai autopiloti, Drive o chiavi. Si ferma con taskkill sull'albero di electron con `--remote-debugging-port=9333`.
- **Una cartella di storie spostata nel recupero torna** con la sincronia di una versione prima della 0.76.0.
