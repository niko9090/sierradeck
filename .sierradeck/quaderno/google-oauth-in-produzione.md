---
titolo: "Mettere l'app OAuth di SierraDeck «In production» nella console Google (fine dei 7 giorni del Drive)"
quando: 2026-10-10T17:15:00+02:00
tag: ["drive", "oauth", "google-cloud", "produzione", "github-pages", "search-console", "passi"]
---

# Perché

Finché l'app OAuth è in **Testing**, Google fa scadere il permesso al Drive dopo **7 giorni**: `invalid_grant`, Drive scollegato. È successo il 23/09 e il 09/10; vedi `drive-401-rinnovo-e-avviso-0-56-3.md`. In **Production** il permesso non scade da solo.

SierraDeck chiede solo `https://www.googleapis.com/auth/drive.appdata`. Per la documentazione di Google è uno scope **non sensibile**, quindi non serve la verifica di sicurezza (CASA). Serve la **verifica del brand**: home page, informativa privacy e dominio verificato. Se la console chiedesse altro, vale quello che dice la console.

# Cosa c'è già

Le pagine pubbliche su GitHub Pages, dalla cartella `docs/` del repository (attivate il 10/10):
- home: `https://niko9090.github.io/sierradeck/`
- privacy: `https://niko9090.github.io/sierradeck/privacy.html`
- termini: `https://niko9090.github.io/sierradeck/termini.html`

Il dominio da verificare è **`niko9090.github.io`**.

# I passi (li fa Nicholas, con l'account Google proprietario del progetto Cloud)

## 1. Verifica il dominio in Search Console

1. Vai su `https://search.google.com/search-console` con lo stesso account Google del progetto Cloud.
2. Scegli «Aggiungi proprietà» e poi il tipo **«Prefisso URL»**, non «Dominio»: un sottodominio di github.io non ha un DNS tuo.
3. Indirizzo: `https://niko9090.github.io/sierradeck/`. Alcune guide chiedono la radice `https://niko9090.github.io/`: se la verifica della sottocartella non basta alla console OAuth, serve un repository `niko9090.github.io`.
4. Metodo **«Tag HTML»**: Search Console dà una riga `<meta name="google-site-verification" content="…">`.
5. Mandala in una chat di SierraDeck, che la mette in `<head>` di `docs/index.html` e la pubblica. In alternativa, il metodo «File HTML»: il file va in `docs/`.
6. Premi «Verifica».

## 2. Google Cloud Console → «Google Auth Platform»

Il progetto è quello del client OAuth di SierraDeck (`console.cloud.google.com`).

**Branding:**
- nome dell'app: **SierraDeck**;
- email di assistenza utente: l'email di contatto di Ferrari Consulenze;
- logo (facoltativo): 120×120 px; si può esportare da `build/icona.svg`. Un logo nuovo fa ripartire la verifica del brand;
- home page: `https://niko9090.github.io/sierradeck/`;
- informativa sulla privacy: `https://niko9090.github.io/sierradeck/privacy.html`;
- termini di servizio: `https://niko9090.github.io/sierradeck/termini.html`;
- **domini autorizzati**: `niko9090.github.io`;
- contatto dello sviluppatore: l'email di Nicholas.

**Audience:**
- tipo di utente: **Esterno**;
- stato di pubblicazione: premi **«Pubblica app»** e conferma. Lo stato passa da «Test» a «In produzione»;
- gli utenti di test non servono più.

**Data access** (accesso ai dati):
- deve esserci solo `.../auth/drive.appdata`. Se c'è altro, toglilo: l'app non lo usa;
- se chiede la giustificazione: «SierraDeck salva nella cartella dati dell'app, cifrati sul PC con AES-256-GCM, le chat e la disposizione delle finestre dell'utente, per ritrovarle sui suoi altri PC. Non legge altri file del Drive.»

**Clients:**
- il client «Desktop» esistente va bene così.

## 3. Dopo

- La verifica del brand può richiedere qualche giorno. Lo stato si vede in Google Auth Platform → **Verification Center**.
- Fino all'esito, la schermata di consenso può dire «Google non ha verificato questa app». Si va avanti con «Avanzate».
- **Ricollega una volta il Drive** su ogni PC (Impostazioni → Account → Drive → «Collega»). I token dati in Testing scadono comunque ai loro 7 giorni; quelli dati in Production no.
- Nel registro di SierraDeck non devono più comparire `invalid_grant` 7 giorni esatti dopo un collegamento. L'avviso della 0.56.4 lo riconosce e lo spiega.

# Da ricordare

- Se il codice comincia a usare un servizio esterno nuovo, va aggiunto a `docs/privacy.html`. L'informativa elenca i servizi ricavati dal codice; l'inventario è del 10/10.
- I dati legali (email, sede, partita IVA) stanno **solo** nelle pagine di `docs/`: mai nel codice, nei test, nel quaderno, nei commit o nelle note delle release.
