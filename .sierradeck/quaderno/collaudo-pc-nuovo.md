---
titolo: "Lista di collaudo «PC nuovo»: da zero al telefono, Drive e autopilota"
quando: 2026-10-10T17:20:00+02:00
tag: ["collaudo", "pc-nuovo", "installazione", "primo-avvio", "telefono", "drive", "autopilota", "prove-con-nicholas"]
---

Da fare insieme a Nicholas su un PC che non ha mai avuto SierraDeck, o su un utente di Windows nuovo. Per ogni passo: cosa fare, cosa deve succedere. Segna ✗ con una riga su cosa è successo davvero, più l'ora, così il registro si ritrova.

# 0. Prima
- [ ] Windows 11 aggiornato, utente senza `%APPDATA%\SierraDeck` e senza `%LOCALAPPDATA%\Programs\SierraDeck`.
- [ ] Claude Code **non** installato, per provare anche quel passo. In alternativa, installato e già collegato all'account Anthropic.
- [ ] Niente Tailscale e niente Drive collegato.

# 1. Installazione da zero
- [ ] Scarica `SierraDeck-Setup-<versione>.exe` dall'ultima release su GitHub.
- [ ] SmartScreen: l'installer non è firmato e Windows avvisa («Ulteriori informazioni» → «Esegui comunque»). La firma resta fuori per decisione di Nicholas. Non si disattiva Smart App Control.
- [ ] L'installazione è per utente e non chiede l'amministratore. Si può scegliere la cartella.
- [ ] Ci sono il collegamento sul desktop e nel menu Start, e la voce «SierraDeck <versione>» in «App installate», **una sola**.

# 2. Primo avvio senza Drive e senza Tailscale
- [ ] Schermata d'accesso: crea l'account (email, password, codice a 6 cifre per email) oppure entra.
- [ ] Preparazione: se manca Claude Code lo dice e propone di installarlo. Dopo l'installazione chiede di fare l'accesso ad Anthropic in una chat.
- [ ] Si apre il mosaico. Una chat nuova in una cartella di prova parte, e Claude Code risponde.
- [ ] Nessun avviso rosso del Drive: chi non l'ha mai collegato non deve vederlo.
- [ ] Impostazioni → Salute: niente errori. «Altri computer» vuoto e spiegato.
- [ ] Chiudi e riapri il programma: le chat aperte tornano.

# 3. Collegamento del telefono
- [ ] Installa l'APK dall'ultima release: Android chiede il permesso per le «app sconosciute».
- [ ] Sul PC: Impostazioni → Computer → Telefoni accoppiati → nuovo codice QR. Sul telefono: inquadra.
- [ ] L'app vede le chat dal vivo, lo stato, e scrive in una chat.
- [ ] Notifiche: una domanda di una chat arriva come notifica con «Rispondi».
- [ ] La pagina nel browser del telefono (indirizzo del PC, porta 47640) funziona con lo stesso accoppiamento.
- [ ] Senza Tailscale, fuori casa il telefono non arriva al PC e lo dice chiaro («Mi collego a…» con i tentativi), non con un errore muto.

# 4. Drive
- [ ] Impostazioni → Account → Drive → «Collega»: si apre il browser, consenso Google con il solo permesso della cartella dell'app.
- [ ] Con l'app OAuth in produzione non deve comparire «app non verificata», o deve sparire dopo la verifica del brand (scheda `google-oauth-in-produzione.md`).
- [ ] Prima volta: crea la cassaforte con parola d'ordine e **chiave di recupero**, da scrivere e conservare.
- [ ] Salvataggio: compare l'avviso (se acceso) e nel registro «SALVA ok».
- [ ] Secondo PC: stesso account Google, stessa cassaforte. Si vedono le presenze, e le chat dell'altro PC si aprono «SU <PC>».
- [ ] Il giorno 8 dopo il collegamento il Drive è ancora collegato: è la prova che la produzione funziona.

# 5. Autopilota
- [ ] Crea un autopilota su una cartella di prova, con un obiettivo piccolo («crea un file LEGGIMI con…») e un criterio verificabile.
- [ ] Intervista, poi pronto, poi lavoro: la chat governata riceve le istruzioni da sola (nel registro «consegna c-1: partita»).
- [ ] Una domanda dell'autopilota arriva nelle Domande del PC e come notifica sul telefono; rispondi dal telefono.
- [ ] Criteri soddisfatti: l'autopilota si chiude da solo e lo dice.
- [ ] Riavvia il programma a metà lavoro: l'autopilota riprende, e la consegna «riprendi» arriva alla chat che riparte (0.56.4).

# 6. Quaderno personale (0.57.0)
- [ ] Impostazioni → Chat e autopiloti → Quaderno personale: aggiungi una voce d'esempio.
- [ ] In una chat chiedi di usare `chiedi_dato_personale` per quella voce: compare nelle Domande (PC e telefono). «Consenti una volta» dà il valore, «No» no; senza risposta in 2 minuti vale no.
- [ ] «Sempre per questa chat», poi «Revoca»: dopo la revoca si chiede di nuovo.

# 7. Fine
- [ ] Disinstalla: la voce sparisce, `%APPDATA%\SierraDeck` resta (è voluto). Cancellala a mano se è un PC di prova.
