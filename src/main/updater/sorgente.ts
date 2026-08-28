/**
 * SierraDeck Update: un programma a sé, che non condivide niente con SierraDeck.
 *
 * Tre tentativi con PowerShell sono finiti male, ognuno per una ragione diversa
 * — un flag che uccideva il processo, un percorso che dipendeva dal `PATH`, una
 * finestra che nasceva mentre chi l'aveva chiesta stava già morendo. Il difetto
 * comune è che *non era un programma*: era uno script lanciato da chi stava per
 * chiudersi, e ogni volta il problema si spostava.
 *
 * Questo è un eseguibile vero. Si vede nel Task Manager, non dipende da nessuna
 * shell, non muore quando SierraDeck muore — perché non è suo figlio: è lui che
 * fa il lavoro, e SierraDeck si limita a farsi da parte.
 *
 * **Chi comanda l'installazione è lui.** Aspetta che SierraDeck sia uscito,
 * lancia l'installer, aspetta che finisca, riavvia il programma e si toglie.
 * Nessun pezzo di questa catena dipende da un processo che sta per sparire.
 *
 * Il sorgente sta qui e viene compilato al primo avvio con il compilatore C#
 * che ogni Windows ha già: nessuna dipendenza da aggiungere, nessun secondo
 * eseguibile da firmare e distribuire. Quando questo testo cambia, l'updater si
 * ricompila da solo — è il modo in cui si aggiorna senza che nessuno lo
 * sostituisca mentre sta lavorando.
 */

/**
 * Cambia a ogni modifica del sorgente: è il segno che fa ricompilare l'updater.
 *
 * A mano e non calcolata dal testo: una versione che cambia da sola a ogni
 * spazio aggiunto farebbe ricompilare per niente, e chi la alza qui sta anche
 * dicendo «ho cambiato qualcosa che conta».
 */
export const VERSIONE_UPDATER = 13

export function sorgenteUpdater(): string {
  return `using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

// SierraDeck Update - installa una versione nuova mentre il programma e' chiuso.
// Argomenti: <pid> <installer> <eseguibile> <versione> [claude] [nota]
//
// L'ultimo, se c'e', e' il comando di Claude Code da aggiornare: si fa qui e
// non nel programma perche' qui il programma e' gia' chiuso, e Claude Code non
// si lascia sostituire mentre le sue chat lo tengono aperto.
class Aggiornamento : Form {
    static string percorsoDiario;
    Label fase;
    Label percento;
    Panel barra;
    Panel binario;
    Timer battito;

    int passo = 0;      // 0 attesa uscita, 1 installazione, 2 avvio, 3 finito
    int valore = 0;

    /**
     * Quello che la spia racconta a chi guarda da fuori.
     *
     * 'volatile' perche' li scrive il thread dell'interfaccia e li legge quello
     * della spia: senza, il secondo potrebbe leggere all'infinito una copia
     * ferma nella sua cache.
     */
    static volatile string spiaTesto = "Chiusura di SierraDeck...";
    static volatile int spiaPercento = 0;
    static volatile string spiaVersione = "";
    static volatile bool spiaViva = true;
    int giri = 0;
    int pidVecchio;
    string installer;
    string eseguibile;
    string versione;
    string claude;
    string notaClaude;
    Process installazione;
    Process claudeInCorso;
    // La versione che «claude update» dice di installare, letta dal suo output
    // (la sua verita', non una nostra ipotesi). La piu' alta vista: il numero
    // bersaglio e' sempre maggiore di quello attuale.
    string claudeVersioneVista = "";
    // A che giro «claude update» ha finito: serve a tenere un istante la scritta
    // «aggiornato» prima di passare oltre, o non si leggerebbe.
    int claudeFinitoAGiro = -1;
    // Sotto questi giri non si chiude comunque: una finestra che appare e
    // sparisce in un lampo, mentre lo schermo e' occupato dall'installer, non
    // e' apparsa.
    const int GIRI_MINIMI = 45;
    // Quanto si aspetta prima di smettere di chiedere per favore: cinque
    // secondi bastano a una finestra per salvare e sparire.
    const int GIRI_GENTILI = 25;
    bool chiestoGentilmente = false;
    int vuoti = 0;
    // I giri passati **in questa fase**: la barra misura il tempo di ogni
    // tratto, non quello totale.
    int giriPasso = 0;
    int vistiUnaVolta = -1;
    const int GIRI_MASSIMI = 3000;
    // Quanto si aspetta che la nuova istanza si faccia viva prima di dire
    // «Pronto» comunque: trenta secondi. Oltre, o e' partita senza farsi
    // riconoscere o non partira', e in entrambi i casi tenere la finestra
    // ferma non aiuta nessuno.
    const int GIRI_AVVIO = 150;

    /**
     * I parametri scritti accanto all'eseguibile: pid, installer, programma,
     * versione, uno per riga.
     */
    static string[] DaFile() {
        try {
            string mio = Path.GetDirectoryName(Application.ExecutablePath);
            string f = Path.Combine(mio, "aggiornamento.txt");
            if (!File.Exists(f)) { Nota("nessun aggiornamento.txt accanto a me"); return new string[0]; }
            string[] righe = File.ReadAllLines(f);
            Nota("parametri letti dal file: " + righe.Length);
            return righe;
        } catch (Exception e) {
            Nota("parametri non letti: " + e.Message);
            return new string[0];
        }
    }

    static void Nota(string testo) {
        try {
            if (percorsoDiario != null) {
                File.AppendAllText(percorsoDiario, DateTime.Now.ToString("HH:mm:ss") + " " + testo + Environment.NewLine);
            }
        } catch {
            // Il diario e la sola voce che questo programma ha: se non si puo
            // scrivere, non c e nessun altro posto dove dirlo. Fallire qui non
            // deve fermare un aggiornamento che per il resto sta andando bene.
        }
    }

    [STAThread]
    static void Main(string[] args) {
        percorsoDiario = Path.Combine(Path.GetTempPath(), "sierradeck-update.log");
        Nota("avviato con " + args.Length + " argomenti");
        // Senza argomenti si leggono dal file accanto. E' cio' che permette di
        // farlo lanciare da explorer, che non sa passarne - e farlo lanciare da
        // qualcun altro e' l'unico modo perche' non muoia con chi lo chiama.
        if (args.Length < 3) args = DaFile();
        if (args.Length < 3) { Nota("parametri mancanti: esco"); return; }
        Application.EnableVisualStyles();
        try {
            Application.Run(new Aggiornamento(args));
        } catch (Exception e) {
            Nota("errore: " + e.Message);
        }
    }

    Aggiornamento(string[] args) {
        pidVecchio = 0;
        int.TryParse(args[0], out pidVecchio);
        installer = args[1];
        eseguibile = args[2];
        versione = args.Length > 3 ? args[3] : "";
        claude = args.Length > 4 ? args[4] : "";
        notaClaude = args.Length > 5 ? args[5] : "";
        int porta = 47640;
        if (args.Length > 6) int.TryParse(args[6], out porta);
        spiaVersione = versione;
        AvviaSpia(porta);

        Color sfondo = Color.FromArgb(11, 12, 14);
        Color chiaro = Color.FromArgb(223, 227, 231);
        Color tenue = Color.FromArgb(154, 161, 169);

        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(460, 300);
        BackColor = sfondo;
        TopMost = true;
        ShowInTaskbar = true;
        Text = "SierraDeck Update";

        PictureBox logo = new PictureBox();
        logo.SetBounds(198, 26, 64, 64);
        logo.BackColor = Color.Transparent;
        Bitmap b = new Bitmap(64, 64);
        Graphics g = Graphics.FromImage(b);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        Faccia(g, new float[] { 268,92, 392,306, 268,306 }, Color.FromArgb(223,227,231));
        Faccia(g, new float[] { 268,92, 132,306, 268,306 }, Color.FromArgb(125,133,141));
        Faccia(g, new float[] { 132,306, 268,306, 200,412 }, Color.FromArgb(82,90,98));
        Faccia(g, new float[] { 268,306, 392,306, 326,412 }, Color.FromArgb(54,61,68));
        Faccia(g, new float[] { 200,412, 326,412, 268,306 }, Color.FromArgb(37,43,49));
        Faccia(g, new float[] { 268,92, 312,168, 268,168 }, Color.FromArgb(84,192,122));
        g.Dispose();
        logo.Image = b;
        Controls.Add(logo);

        // La stessa immagine come icona della finestra: senza, nella barra
        // delle applicazioni compare il rettangolo bianco di Windows - che di
        // tutto il programma e' l'unica cosa che si vede da laggiu'.
        try {
            Icon = System.Drawing.Icon.FromHandle(b.GetHicon());
        } catch {
            // Senza icona resta il rettangolo bianco di Windows: brutto, non
            // grave. Un aggiornamento non si ferma per un ornamento.
        }

        Label titolo = new Label();
        titolo.Text = "SIERRADECK UPDATE";
        titolo.ForeColor = tenue;
        titolo.Font = new Font("Segoe UI", 10);
        titolo.TextAlign = ContentAlignment.MiddleCenter;
        titolo.SetBounds(0, 100, 460, 24);
        Controls.Add(titolo);

        fase = new Label();
        fase.Text = "Chiusura di SierraDeck...";
        fase.ForeColor = chiaro;
        fase.Font = new Font("Segoe UI", 11);
        fase.TextAlign = ContentAlignment.MiddleCenter;
        fase.SetBounds(0, 138, 460, 26);
        Controls.Add(fase);

        binario = new Panel();
        binario.SetBounds(70, 186, 320, 6);
        binario.BackColor = Color.FromArgb(27, 31, 35);
        Controls.Add(binario);

        barra = new Panel();
        barra.SetBounds(0, 0, 0, 6);
        barra.BackColor = Color.FromArgb(74, 163, 255);
        binario.Controls.Add(barra);

        percento = new Label();
        percento.Text = "0%";
        percento.ForeColor = chiaro;
        percento.Font = new Font("Segoe UI", 20);
        percento.TextAlign = ContentAlignment.MiddleCenter;
        percento.SetBounds(0, 206, 460, 44);
        Controls.Add(percento);

        battito = new Timer();
        battito.Interval = 200;
        battito.Tick += new EventHandler(Batte);
        battito.Start();
        Nota("finestra pronta, versione attesa " + versione);
    }

    static void Faccia(Graphics g, float[] p, Color c) {
        float s = 64f / 512f;
        PointF[] punti = new PointF[p.Length / 2];
        for (int i = 0; i < punti.Length; i++) punti[i] = new PointF(p[i*2] * s, p[i*2+1] * s);
        g.FillPolygon(new SolidBrush(c), punti);
    }

    /**
     * Da dove parte e dove arriva la barra in ogni fase.
     *
     * Ogni fase comincia dove finisce la precedente: cosi' la barra non salta
     * mai. I numeri non sono arbitrari - dicono quanto pesa davvero ciascuna
     * attesa, e l'installazione, che e' la piu' lunga, prende lo spazio piu'
     * largo.
     */
    int Da() {
        if (passo == 0) return 0;
        if (passo == 1) return 15;
        if (passo == 5) return 70;
        if (passo == 2) return 90;
        return 99;
    }
    int A() {
        if (passo == 0) return 15;
        if (passo == 1) return 70;
        if (passo == 5) return 90;
        if (passo == 2) return 99;
        return 100;
    }
    // Quanto dura di solito ogni fase, in giri da 200ms. Non e' una promessa:
    // e' il ritmo con cui la barra attraversa il suo tratto.
    int Previsti() {
        if (passo == 0) return 20;    // 4s: chiudere le finestre
        if (passo == 1) return 175;   // 35s: l'installer
        if (passo == 5) return 150;   // 30s: la ricerca e l aggiornamento di Claude Code
        if (passo == 2) return 25;    // 5s: la nuova istanza che nasce
        return 5;
    }

    /**
     * Dove sta la barra adesso.
     *
     * Cresce sempre e non si ferma mai: si avvicina alla fine del tratto senza
     * raggiungerla, rallentando quando la fase dura piu' del previsto. La barra
     * che restava ferma al 65 per trenta secondi e poi saltava al 100 diceva
     * due bugie in fila - che fosse bloccata, e che avesse appena fatto un
     * terzo del lavoro in un istante.
     */
    int Avanzamento() {
        double t = giriPasso;
        double previsti = Previsti();
        // A t = previsti la frazione vale 0,8: il tratto e' quasi finito ma
        // resta spazio per un'attesa piu' lunga, senza mai fermarsi.
        double frazione = t / (t + previsti * 0.25);
        int da = Da();
        return da + (int)((A() - da) * frazione);
    }

    /**
     * Passa a una fase nuova.
     *
     * Azzerare il cronometro della fase e' il punto di tutto: la barra misura
     * quanto sta durando **questo** tratto, non quanto e' passato dall'inizio.
     * Senza, la fase piu' lunga si mangiava il tempo di tutte le altre e loro
     * comparivano gia' finite.
     */
    void Vai(int prossimo) {
        passo = prossimo;
        giriPasso = 0;
        // La barra non torna indietro: il tratto nuovo comincia dove finisce
        // quello vecchio, e se si era arrivati piu' avanti si resta li'.
        if (valore < Da()) valore = Da();
    }

    void Batte(object mittente, EventArgs e) {
        giri++;
        giriPasso++;
        int calcolato = Avanzamento();
        // Mai indietro: al cambio di fase il valore nuovo parte dal fondo del
        // tratto precedente, e un attimo di aritmetica non deve far arretrare
        // quello che si e' gia' visto.
        if (calcolato > valore) valore = calcolato;

        if (passo == 0) {
            int rimasti = ChiudiTutte();
            fase.Text = rimasti > 1
                ? "Chiusura di SierraDeck (" + rimasti + " finestre)..."
                : "Chiusura di SierraDeck...";
            // Due giri a zero, non uno: un processo che sta uscendo sparisce
            // dall'elenco un istante prima di rilasciare davvero i suoi file, e
            // partire in quell'istante e' esattamente il conflitto da evitare.
            if (rimasti == 0) vuoti++; else vuoti = 0;
            // Tre giri a zero di fila: un processo che sta uscendo sparisce
            // dall'elenco un istante prima di rilasciare i suoi file, e
            // partire in quell'istante e' il conflitto da evitare.
            if (vuoti >= 3) {
                Nota("nessuna istanza rimasta: lancio l'installer");
                Installa();
                Vai(1);
            }
        } else if (passo == 1) {
            fase.Text = versione.Length > 0
                ? "Installazione della versione " + versione + "..."
                : "Installazione in corso...";
            // Uscire non e' riuscire. Un'installazione nulla vuol dire che
            // Installa() non e' nemmeno partito (Process.Start ha lanciato); un
            // codice d'uscita diverso da zero vuol dire che l'installer e' uscito
            // ma ha fallito (file in uso, disinstallazione non riuscita). In
            // entrambi i casi proseguire riaprirebbe il binario VECCHIO dicendo
            // «Pronto», e l'utente resterebbe indietro senza saperlo: e' il difetto
            // per cui «si e' riavviato ancora con la versione vecchia». Solo il
            // codice d'uscita zero e' un successo.
            if (installazione == null || (installazione.HasExited && installazione.ExitCode != 0)) {
                battito.Stop();
                string dettaglio = installazione == null
                    ? "Non sono riuscito ad avviare l'installazione."
                    : "L'aggiornamento non e' riuscito (codice " + installazione.ExitCode + ").";
                fase.Text = dettaglio + " Riapro la versione attuale.";
                Nota(installazione == null
                    ? "installer non avviato: aggiornamento fallito"
                    : "installer fallito, codice " + installazione.ExitCode);
                // Si ridA' all'utente la sua versione: l'installazione fallita non
                // l'ha toccata, ed e' meglio del nulla dopo aver chiuso tutto. La
                // barra resta al valore vero, non 100: niente bugia «Pronto».
                Avvia();
                barra.Width = (int)(320.0 * valore / 100.0);
                percento.Text = valore + "%";
                Chiudi();
                return;
            }
            if (installazione.HasExited) {
                Nota("installer terminato (codice 0)");
                // Claude Code prima della riapertura, sempre: quando c'e' da
                // aggiornarlo lo si aggiorna, quando non c'e' lo si dice.
                // Riaprire senza averlo guardato lascerebbe il dubbio, e il
                // dubbio si risolve solo riaggiornando a mano.
                AggiornaClaude();
                Vai(5);
            }
        } else if (passo == 5) {
            // Claude Code: si aggiorna adesso, che nessuna chat lo tiene
            // aperto. E' l'unico momento in cui si puo' fare senza chiedere
            // all'utente di chiudere tutto a mano.
            if (claudeInCorso == null) {
                // Nessun comando da eseguire: non si e' potuto nemmeno cercare.
                // Lo si dice - una fase che passa in silenzio si legge come una
                // fase che non e' avvenuta, ed e' proprio il dubbio da togliere.
                fase.Text = notaClaude.Length > 0 ? notaClaude : "Claude Code non verificato.";
                // Niente return: la barra va comunque ridisegnata in fondo a
                // questo giro, altrimenti resta indietro di un battito.
                if (giriPasso >= 10) {
                    Avvia();
                    Vai(2);
                }
            } else if (claudeInCorso.HasExited) {
                // Finito: si tiene un istante la scritta «aggiornato» - con la
                // versione se l'abbiamo letta dall'output - o passerebbe troppo
                // in fretta per leggerla, e il terzo passo non si vedrebbe.
                if (claudeFinitoAGiro < 0) {
                    claudeFinitoAGiro = giri;
                    Nota("claude code aggiornato" + (claudeVersioneVista.Length > 0 ? " alla " + claudeVersioneVista : ""));
                }
                fase.Text = claudeVersioneVista.Length > 0
                    ? "Claude Code aggiornato alla versione " + claudeVersioneVista + "."
                    : "Claude Code aggiornato.";
                if (giri - claudeFinitoAGiro >= 8) {
                    Avvia();
                    Vai(2);
                }
            } else {
                // Prima «cerco», poi - appena l'output rivela il numero nuovo -
                // «aggiornamento alla versione X». La console non si vede piu':
                // e' questa riga a raccontare cosa sta succedendo la' dietro.
                fase.Text = claudeVersioneVista.Length > 0
                    ? "Aggiornamento di Claude Code alla versione " + claudeVersioneVista + "..."
                    : "Cerco aggiornamenti di Claude Code...";
            }
        } else if (passo == 2) {
            fase.Text = "Avvio della nuova versione...";
            // Si aspetta che la nuova istanza sia davvero in piedi prima di
            // dire «Pronto»: dirlo mentre sta ancora nascendo e' la stessa
            // bugia della barra ferma all'82.
            // I giri di questa fase e non quelli totali: con il totale, i giri
            // minimi erano gia' passati da un pezzo e la finestra diceva
            // «Pronto» nello stesso istante in cui cominciava ad aspettare -
            // la bugia per cui restava al 82% dicendo di aver finito.
            if (NuovaViva() || giriPasso > GIRI_AVVIO) Vai(3);
        } else {
            fase.Text = "Pronto.";
            valore = 100;
            if (giri > GIRI_MINIMI) {
                battito.Stop();
                // Si disegna il 100 **prima** di uscire: con il return subito
                // dopo lo stop, l'ultimo disegno era quello del giro prima e la
                // finestra si chiudeva dicendo «Pronto» accanto a un 82%.
                barra.Width = 320;
                percento.Text = "100%";
                Nota("finito");
                Chiudi();
                return;
            }
        }

        // Un'installazione che non finisce piu' non deve lasciare una finestra
        // orfana sullo schermo per sempre.
        if (giri > GIRI_MASSIMI) {
            fase.Text = "L'installazione sta impiegando troppo: controlla SierraDeck.";
            battito.Stop();
            barra.Width = (int)(320.0 * valore / 100.0);
            percento.Text = valore + "%";
            Nota("tempo scaduto");
            Chiudi();
            return;
        }

        barra.Width = (int)(320.0 * valore / 100.0);
        percento.Text = valore + "%";
        spiaTesto = fase.Text;
        spiaPercento = valore;
    }

    /**
     * La spia: **questo** programma risponde al telefono mentre SierraDeck e' morto.
     *
     * E' l'idea che risolve un problema che sembrava insolubile. Dal telefono,
     * durante l'installazione, non c'era nessuno a cui chiedere a che punto si
     * fosse: SierraDeck e' chiuso, ed e' proprio lui che parla col telefono. La
     * schermata sull'app raccontava quindi una storia **parallela**, dedotta dal
     * silenzio — e le due percentuali non coincidevano mai.
     *
     * Ma c'e' un programma vivo esattamente in quei trenta secondi, ed e'
     * questo. La porta del Client e' libera proprio perche' SierraDeck l'ha
     * lasciata. Quindi la si prende in prestito: stessa porta, stesso indirizzo,
     * stessa rotta '/api/aggiornamento'. Il telefono continua a chiedere le
     * stesse cose allo stesso posto, e per quei trenta secondi risponde
     * l'installer con **le sue** parole e la **sua** percentuale. Non piu' due
     * racconti da tenere allineati: uno solo, con due schermi davanti.
     *
     * Un 'TcpListener' e non 'HttpListener': il secondo, su Windows, vuole una
     * prenotazione dell'URL o i diritti di amministratore, e un aggiornamento
     * non e' il momento di chiederli. La risposta e' abbastanza semplice da
     * scriverla a mano.
     *
     * Non dice niente di segreto — un testo e un numero — e vive un minuto. Ma
     * soprattutto **non puo' far fallire l'aggiornamento**: gira in un thread a
     * parte, in un try che ingoia tutto, e se la porta non si prende nessuno se
     * ne accorge. Un aggiornamento che si rompe per mostrare una percentuale
     * sarebbe il peggior baratto possibile.
     */
    static void AvviaSpia(int porta) {
        try {
            System.Threading.Thread t = new System.Threading.Thread(delegate() { Spia(porta); });
            t.IsBackground = true;
            t.Start();
        } catch (Exception e) {
            Nota("spia non avviata: " + e.Message);
        }
    }

    static void Spia(int porta) {
        TcpListener ascolto = null;
        // La porta puo' essere ancora di SierraDeck, che sta uscendo: si
        // riprova finche' non la lascia, e non piu' di un minuto.
        for (int tentativi = 0; tentativi < 120 && ascolto == null && spiaViva; tentativi++) {
            try {
                ascolto = new TcpListener(IPAddress.Any, porta);
                ascolto.Start();
            } catch (Exception) {
                ascolto = null;
                System.Threading.Thread.Sleep(500);
            }
        }
        if (ascolto == null) { Nota("spia: porta mai libera"); return; }
        Nota("spia in ascolto sulla porta " + porta);
        while (spiaViva) {
            try {
                if (!ascolto.Pending()) { System.Threading.Thread.Sleep(100); continue; }
                using (TcpClient cliente = ascolto.AcceptTcpClient()) {
                    cliente.ReceiveTimeout = 1500;
                    cliente.SendTimeout = 1500;
                    NetworkStream flusso = cliente.GetStream();
                    byte[] entrata = new byte[2048];
                    try { flusso.Read(entrata, 0, entrata.Length); } catch (Exception) { }
                    string richiesta = Encoding.UTF8.GetString(entrata);
                    string corpo = richiesta.Contains("/api/aggiornamento") ? Stato() : "{}";
                    string testa =
                        "HTTP/1.1 200 OK" + CRLF +
                        "Content-Type: application/json; charset=utf-8" + CRLF +
                        "Content-Length: " + Encoding.UTF8.GetByteCount(corpo) + CRLF +
                        "Connection: close" + CRLF + CRLF;
                    byte[] uscita = Encoding.UTF8.GetBytes(testa + corpo);
                    flusso.Write(uscita, 0, uscita.Length);
                    flusso.Flush();
                }
            } catch (Exception) {
                // Una richiesta storta non e' un motivo per smettere di
                // rispondere alle prossime.
            }
        }
        try { ascolto.Stop(); } catch (Exception) { }
    }

    /**
     * Lo stato, nella stessa forma che manda SierraDeck.
     *
     * Costruito con VIRG e BARRA invece che con le sequenze di fuga: questo
     * sorgente C# vive dentro una stringa TypeScript, quindi ogni barra
     * rovesciata attraversa due linguaggi prima di arrivare al compilatore e
     * ne perde uno strato per strada. E' successo, e il risultato erano dieci
     * errori di "nuova riga nella costante". Con i caratteri per numero non
     * c'e' niente da far sopravvivere al viaggio.
     */
    static readonly char VIRG = (char)34;
    static readonly char BARRA = (char)92;
    static readonly string CRLF = ((char)13).ToString() + ((char)10).ToString();

    static string Stato() {
        return "{" + Campo("fase") + Testo("installo") + "," +
            Campo("versione") + Testo(spiaVersione) + "," +
            Campo("percento") + spiaPercento + "," +
            Campo("testo") + Testo(spiaTesto) + "}";
    }

    static string Campo(string nome) { return VIRG + nome + VIRG + ":"; }
    static string Testo(string valore) { return VIRG + Fuggi(valore) + VIRG; }

    /** Le virgolette e le barre nel JSON scritto a mano. */
    static string Fuggi(string testo) {
        if (testo == null) return "";
        string b = BARRA.ToString();
        string uno = testo.Replace(b, b + b);
        return uno.Replace(VIRG.ToString(), b + VIRG.ToString());
    }

    void Chiudi() {
        Timer fine = new Timer();
        fine.Interval = 1600;
        fine.Tick += delegate { fine.Stop(); spiaViva = false; Close(); };
        fine.Start();
    }

    /**
     * Chiude ogni istanza di SierraDeck e dice quante ne restano.
     *
     * Non basta aspettare quella che ci ha lanciati: una seconda finestra
     * aperta su un altro monitor, o un'istanza dimenticata, tiene aperti gli
     * stessi file - e l'installer si ferma con «impossibile disinstallare i
     * vecchi file». E' successo, ed e' il motivo per cui questo metodo esiste.
     *
     * Prima si chiede con gentilezza, cosi' il programma salva quello che deve;
     * dopo qualche secondo, chi non se ne va viene chiuso comunque. Aspettare
     * all'infinito una finestra che non risponde vorrebbe dire non aggiornare
     * mai.
     */
    int ChiudiTutte() {
        string nome = Path.GetFileNameWithoutExtension(eseguibile);
        if (nome == null || nome.Length == 0) nome = "SierraDeck";
        Process[] trovati;
        // Se non si riesce a contarle, si assume che ce ne sia una: «non lo so»
        // deve fermare, non far partire. Rispondere zero qui significherebbe
        // lanciare l'installer su file che potrebbero essere in uso, ed e'
        // precisamente il conflitto che questo metodo esiste per evitare.
        try { trovati = Process.GetProcessesByName(nome); } catch { return 1; }

        int mio = Process.GetCurrentProcess().Id;
        int vivi = 0;
        foreach (Process p in trovati) {
            try {
                if (p.HasExited) continue;
                // Se stessi non ci si chiude: l'updater ha un nome diverso, ma
                // un confronto in piu' costa nulla e vale per sempre.
                if (p.Id == mio) continue;
                vivi++;
                // La richiesta gentile si ripete a ogni giro finche' serve: una
                // sola volta bastava per la finestra che risponde subito, e
                // lasciava aperte quelle che stavano ancora salvando - e' cosi'
                // che ne restava una viva mentre l'installer partiva.
                if (giri < GIRI_GENTILI) {
                    // CloseMainWindow non fa niente quando la finestra
                    // principale non c'e' ancora - e non lo dice, restituisce
                    // false. Per questo si insiste a ogni giro e per questo, se
                    // il tempo di grazia passa, si chiude comunque.
                    p.CloseMainWindow();
                } else {
                    Nota("chiudo a forza il processo " + p.Id + " (" + nome + ")");
                    p.Kill();
                }
            } catch {
                // Un processo che sparisce fra l elenco e la chiusura: e
                // esattamente quello che stiamo aspettando che succeda, e
                // segnalarlo come guasto sarebbe segnalare un successo.
            }
        }
        // Quante ne ha viste, scritto una volta sola: e' l'informazione che
        // mancava quando «ne ha chiusa una sola» e' rimasto un mistero.
        if (vivi != vistiUnaVolta) {
            Nota("istanze di " + nome + " ancora aperte: " + vivi);
            vistiUnaVolta = vivi;
        }
        return vivi;
    }

    void Installa() {
        try {
            ProcessStartInfo p = new ProcessStartInfo(installer);
            // Silenzioso: la finestra che si vede e' questa. L'installer di
            // electron-builder riavvia da solo, quindi glielo si vieta: a
            // riaprire il programma ci pensiamo noi, dopo, quando siamo sicuri
            // che l'installazione e' finita davvero.
            p.Arguments = "/S --update-if-installed";
            p.UseShellExecute = false;
            installazione = Process.Start(p);
        } catch (Exception e) {
            Nota("installer non partito: " + e.Message);
            fase.Text = "Non sono riuscito a installare: apri l'installer a mano.";
        }
    }

    /** La nuova versione e' gia' a schermo? */
    bool NuovaViva() {
        try {
            string nome = Path.GetFileNameWithoutExtension(eseguibile);
            if (nome == null || nome.Length == 0) return false;
            return Process.GetProcessesByName(nome).Length > 0;
        } catch { return false; }
    }

    /**
     * Aggiorna Claude Code con il suo stesso comando.
     *
     * Non si reinstalla e non si scarica niente da noi: «claude update» sa
     * come farlo, e affidarglielo significa non dover inseguire il modo in cui
     * si aggiorna quando cambiera'.
     */
    void AggiornaClaude() {
        // Senza comando non c'e' niente da aggiornare: il programma ha gia'
        // guardato e ha trovato Claude Code alla versione buona. Resta a null,
        // e la finestra lo dice invece di tacere.
        if (claude.Length == 0) { Nota("claude code gia aggiornato, niente da fare"); return; }
        try {
            // Le virgolette doppie qui dentro vanno raddoppiate: questo testo
            // vive in un template JavaScript, e una virgoletta scappata con la
            // barra rovescia arriverebbe al compilatore C# senza la barra.
            ProcessStartInfo p = new ProcessStartInfo("cmd.exe", "/c \\"" + claude + "\\" update");
            p.UseShellExecute = false;
            // NIENTE console. Prima si vedeva la finestra nera di «claude update»
            // sfilare accanto alla nostra: due finestre per una cosa sola. Ora
            // gira nascosta e cio' che fa lo raccontiamo noi, nella stessa
            // finestra, con lo stato e la versione lette dal suo output.
            p.CreateNoWindow = true;
            p.RedirectStandardOutput = true;
            p.RedirectStandardError = true;
            // Lo stdin chiuso subito: se «claude update» provasse a leggere da
            // tastiera — non lo fa, ma per prudenza — troverebbe la fine e non
            // resterebbe appeso ad aspettare una risposta che non arriva.
            p.RedirectStandardInput = true;
            claudeInCorso = new Process();
            claudeInCorso.StartInfo = p;
            claudeInCorso.OutputDataReceived += new DataReceivedEventHandler(RigaClaude);
            claudeInCorso.ErrorDataReceived += new DataReceivedEventHandler(RigaClaude);
            claudeInCorso.Start();
            claudeInCorso.BeginOutputReadLine();
            claudeInCorso.BeginErrorReadLine();
            try { claudeInCorso.StandardInput.Close(); } catch { }
            Nota("aggiorno Claude Code (nascosto): " + claude);
        } catch (Exception e) {
            Nota("Claude Code non aggiornato: " + e.Message);
        }
    }

    /**
     * Una riga dall'output di «claude update». Gira su un thread del pool, non
     * su quello della finestra: qui si tocca solo un campo stringa (assegnarlo
     * e' atomico), e la finestra lo legge al suo battito. Niente controlli da
     * aggiornare da qui, o servirebbe un Invoke.
     */
    void RigaClaude(object mittente, DataReceivedEventArgs ev) {
        if (ev == null || ev.Data == null) return;
        Nota("claude> " + ev.Data);
        // La versione bersaglio: il numero piu' alto che compare. «claude update»
        // stampa sia l'attuale sia la nuova, e la nuova e' sempre la maggiore.
        foreach (Match m in Regex.Matches(ev.Data, "\\\\d+\\\\.\\\\d+\\\\.\\\\d+")) {
            if (PiuGrande(m.Value, claudeVersioneVista)) claudeVersioneVista = m.Value;
        }
    }

    /** true se la prima versione «x.y.z» e' maggiore della seconda ("" = nessuna). */
    static bool PiuGrande(string a, string b) {
        if (b.Length == 0) return a.Length > 0;
        string[] pa = a.Split('.');
        string[] pb = b.Split('.');
        for (int i = 0; i < 3; i++) {
            int na = 0; int nb = 0;
            if (i < pa.Length) int.TryParse(pa[i], out na);
            if (i < pb.Length) int.TryParse(pb[i], out nb);
            if (na != nb) return na > nb;
        }
        return false;
    }

    void Avvia() {
        // **La porta si molla prima di riaprire**, e non alla fine.
        //
        // La spia sta in ascolto sulla porta del Client, che e' libera solo
        // perche' SierraDeck e' chiuso. Se la tenesse ancora mentre la nuova
        // versione parte, quella troverebbe la porta occupata e resterebbe senza
        // Client: il telefono non lo vedrebbe piu' fino al riavvio successivo.
        // Un aggiornamento che rompe la cosa che stavi guardando dal telefono e'
        // esattamente il contrario di quello che questa spia doveva fare.
        //
        // Il ciclo della spia controlla questo flag ogni decimo di secondo,
        // quindi la porta e' libera molto prima che il programma nuovo arrivi a
        // chiederla.
        spiaViva = false;
        Nota("spia spenta: la porta torna a SierraDeck");
        try {
            if (File.Exists(eseguibile)) {
                ProcessStartInfo p = new ProcessStartInfo(eseguibile);
                p.UseShellExecute = true;
                Process.Start(p);
                Nota("nuova versione avviata");
            } else {
                Nota("eseguibile non trovato: " + eseguibile);
            }
        } catch (Exception e) {
            Nota("avvio fallito: " + e.Message);
        }
    }
}
`
}
