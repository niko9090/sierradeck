---
titolo: "Firma del codice: perché l'antivirus blocca l'aggiornamento, e le opzioni (02/10/2026)"
quando: 2026-10-02T03:00:00+02:00
tag: ["firma", "antivirus", "smartscreen", "installer", "electron-builder", "decide-nicholas"]
---

# Il problema

Nicholas (02/10): un portatile non riesce ad aggiornare SierraDeck, perché l'antivirus segnala l'app come non sicura.

**Niente è stato comprato, configurato o inviato.** Questa scheda serve a Nicholas per decidere.

# Perché succede

Gli eseguibili di SierraDeck **non sono firmati**. L'ho verificato sul pacchetto della 0.38.2 con `Get-AuthenticodeSignature`:
- `dist/SierraDeck Setup 0.38.2.exe` → **NotSigned**;
- `dist/win-unpacked/SierraDeck.exe` → **NotSigned**.

Il log di `npm run pacchetto` scrive «signing with signtool.exe», ma senza un certificato configurato electron-builder non firma niente: in `electron-builder.yml`, alla voce `win:`, non c'è nessuna impostazione di firma.

Per Windows Defender SmartScreen e per molti antivirus, un eseguibile scaricato da internet, senza firma e con poca «reputazione» (pochi download di quel file preciso), è sospetto per definizione. Ogni release cambia il file e azzera la reputazione: per questo il blocco può tornare a ogni aggiornamento. Un falso positivo vero e proprio, cioè l'antivirus che dice «virus», è un caso diverso, che si segnala a parte (vedi sotto).

**Da sapere da Nicholas:** quale antivirus c'è sul portatile (Windows Defender o un altro) e il messaggio esatto. «Windows ha protetto il PC» è SmartScreen; un file messo in quarantena è l'antivirus.

# Le opzioni di firma

## 1. Microsoft Artifact Signing (ex «Trusted Signing»)

Il servizio di firma gestito da Microsoft su Azure.
- **Chi può:** «Public Trust certificates are available to organizations in the United States, Canada, the European Union, the United Kingdom, …» (Microsoft Learn, quickstart, aggiornato a settembre 2026). **Le organizzazioni dell'UE ci sono.** Gli **sviluppatori individuali** invece solo negli Stati Uniti e in Canada: quindi va richiesto a nome di **Ferrari Consulenze come organizzazione**, non di Nicholas come persona.
- **Requisiti d'identità (organizzazione):**
  - nome legale dell'impresa e sito;
  - email su un dominio dell'impresa (primaria e secondaria);
  - identificativo d'impresa (per l'Italia la P. IVA o l'iscrizione al Registro imprese);
  - indirizzo;
  - la verifica d'identità del legale rappresentante, con un documento d'identità e un selfie tramite un partner (AU10TIX) e Microsoft Authenticator.
  - Documenti emessi negli ultimi 12 mesi.
  - Tempi: «from 1 to 20 business days».
  - Fonti di terze parti parlano anche di un requisito di **3 anni di attività verificabile**; nella pagina Microsoft che ho letto non l'ho trovato scritto, va verificato al momento della richiesta.
- **Serve un abbonamento Azure a pagamento**: le sottoscrizioni gratuite o di prova non valgono.
- **Costo** (fonti di terze parti, luglio 2026):
  - piano Basic 9,99 $/mese per 5.000 firme;
  - Premium 99,99 $/mese per 100.000;
  - poi 0,005 $ a firma.
  - A SierraDeck basta il Basic: una release firma una decina di file.
- **In electron-builder** (26.15.3, quella del progetto, già supportato): `win.azureSignOptions` con `publisherName` (il nome esatto del certificato, per esempio «Ferrari Consulenze»), `endpoint` (per esempio `https://weu.codesigning.azure.net` per West Europe), `certificateProfileName` e `codeSigningAccountName`. Le credenziali arrivano dall'ambiente (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` di un'app Entra con il ruolo di firma), **mai nel repository**.
- **Pro:** economico, niente chiavetta hardware, si integra nel `npm run pacchetto` di oggi.
- **Contro:** la verifica d'identità richiede tempo; il certificato dura pochi giorni e si rinnova da solo (non è un problema, grazie al timestamp).

## 2. Certificato OV o EV comprato da un'autorità (Sectigo, DigiCert, …)

- **OV** (Organization Validation): costa di solito qualche centinaio di euro all'anno. Dal 2023 le regole del CA/Browser Forum vogliono la chiave su un **token hardware** o su un HSM, anche per l'OV: niente più `.pfx` su disco. La reputazione SmartScreen si costruisce con i download.
- **EV** (Extended Validation): costa di più, sempre su token o HSM. In passato dava fiducia immediata a SmartScreen; Microsoft ha poi tolto questo vantaggio, e oggi EV e OV si comportano in modo simile verso SmartScreen.
- **In electron-builder:**
  - con un token: `win.signtoolOptions` (per esempio `certificateSubjectName` / `certificateSha1`), con il token collegato al PC che fa il pacchetto;
  - con un servizio cloud dell'autorità: il loro strumento come `sign` personalizzato.
- **Contro:** costo più alto, una chiavetta da custodire, e il pacchetto si può fare solo dove c'è il token.

## 3. Restare senza firma

Costo zero. Il problema però torna su ogni PC nuovo e a ogni release, e un antivirus aziendale può bloccare del tutto.

**Mio consiglio, da far decidere a Nicholas:** opzione 1 (Artifact Signing, piano Basic, a nome di Ferrari Consulenze), se l'impresa ha i requisiti. Costa poco, resta dentro la procedura di pubblicazione di oggi e non richiede hardware.

## Attenzione agli aggiornamenti, quando si comincia a firmare

electron-updater, quando l'app è firmata, controlla che anche il nuovo installer sia firmato dallo stesso editore. Per questo:
- `publisherName` va scritto esattamente come nel certificato;
- da quel momento **tutte** le release vanno firmate (una non firmata non verrebbe installata);
- il passaggio da «non firmata» a «firmata» non dà problemi.

Va provato su una release beta prima di pubblicarla a tutti.

# Segnalare il falso positivo a Microsoft

Se è **Defender** a segnalarlo come minaccia:
- portale https://www.microsoft.com/en-us/wdsi/filesubmission, scegliendo «Software developer» e «Incorrectly detected / false positive»;
- conviene accedere con un account Microsoft, così si segue la pratica;
- **limite 50 MB per file**: l'installer da circa 112 MB non ci sta, quindi si manda l'eseguibile segnalato (per esempio `SierraDeck.exe`, o il file preciso indicato dall'antivirus), eventualmente in un archivio con la password «infected» come chiede il portale;
- gli analisti di Microsoft lo esaminano e, se è pulito, correggono la rilevazione.

Per un **antivirus di terze parti** ognuno ha il suo modulo per i falsi positivi (Avast/AVG, Bitdefender, Kaspersky, ESET, Norton…).

**Non ho inviato niente**: decide Nicholas.

# Passi immediati per sbloccare il portatile

1. **Capire chi blocca:** SmartScreen («Windows ha protetto il PC») o un antivirus (notifica di quarantena).
2. **SmartScreen:** sulla finestra «Windows ha protetto il PC» → «Ulteriori informazioni» → «Esegui comunque». Vale per quel file.
3. **Windows Defender** ha messo in quarantena il file: Sicurezza di Windows → Protezione da virus e minacce → **Cronologia protezione** → la voce di SierraDeck → **Consenti** (o Ripristina).
   - Se serve, si aggiunge un'**esclusione** per la cartella dell'app, `%LOCALAPPDATA%\Programs\SierraDeck`, e per quella degli aggiornamenti scaricati, `%LOCALAPPDATA%\sierradeck-updater`.
   - Solo su un PC di Nicholas, sapendo che un'esclusione abbassa la protezione di quella cartella.
4. **Antivirus di terze parti:** la stessa cosa dal suo pannello (quarantena → ripristina, poi un'eccezione per quelle due cartelle).
5. **Aggiornare a mano**, se l'aggiornamento automatico resta bloccato: scaricare `SierraDeck-Setup-<versione>.exe` dalla pagina della release su GitHub (https://github.com/niko9090/sierradeck/releases/latest) ed eseguirlo. L'installazione sopra quella esistente tiene dati e impostazioni.
6. Prima di consentire, controllare che il file venga davvero dalla release ufficiale: stesso nome e stessa dimensione della pagina GitHub.

# Fonti

- Microsoft Learn, «Quickstart: Set up Artifact Signing» (ex Trusted Signing): https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart
- Prezzi, da fonti di terze parti: https://my-ssl.com/learn/azure-trusted-signing-vs-code-signing-certificate , https://weblog.west-wind.com/posts/2025/Jul/20/Fighting-through-Setting-up-Microsoft-Trusted-Signing
- Disponibilità in Europa: https://www.devclass.com/security/2026/01/14/code-signing-windows-apps-may-be-easier-and-more-secure-with-new-azure-artifact-service/4079554
- Opzioni di firma secondo Microsoft: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options
- Portale per segnalare i file a Microsoft: https://www.microsoft.com/en-us/wdsi/filesubmission
- electron-builder 26.15.3, `node_modules/app-builder-lib/out/options/winOptions.d.ts`, interfaccia `WindowsAzureSigningConfiguration` (`win.azureSignOptions`)
