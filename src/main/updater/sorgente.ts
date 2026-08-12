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
export const VERSIONE_UPDATER = 2

export function sorgenteUpdater(): string {
  return `using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

// SierraDeck Update - installa una versione nuova mentre il programma e' chiuso.
// Argomenti: <pid> <installer> <eseguibile> <versione>
class Aggiornamento : Form {
    static string percorsoDiario;
    Label fase;
    Label percento;
    Panel barra;
    Panel binario;
    Timer battito;

    int passo = 0;      // 0 attesa uscita, 1 installazione, 2 avvio, 3 finito
    int valore = 0;
    int giri = 0;
    int pidVecchio;
    string installer;
    string eseguibile;
    string versione;
    Process installazione;
    // Sotto questi giri non si chiude comunque: una finestra che appare e
    // sparisce in un lampo, mentre lo schermo e' occupato dall'installer, non
    // e' apparsa.
    const int GIRI_MINIMI = 45;
    const int GIRI_MASSIMI = 3000;

    static void Nota(string testo) {
        try {
            if (percorsoDiario != null) {
                File.AppendAllText(percorsoDiario, DateTime.Now.ToString("HH:mm:ss") + " " + testo + Environment.NewLine);
            }
        } catch { }
    }

    [STAThread]
    static void Main(string[] args) {
        percorsoDiario = Path.Combine(Path.GetTempPath(), "sierradeck-update.log");
        Nota("avviato con " + args.Length + " argomenti");
        if (args.Length < 3) { Nota("argomenti insufficienti: esco"); return; }
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

    void Batte(object mittente, EventArgs e) {
        giri++;
        int tetto = passo == 0 ? 25 : passo == 1 ? 80 : passo == 2 ? 97 : 100;
        if (valore < tetto) valore = Math.Min(tetto, valore + 2);

        if (passo == 0) {
            fase.Text = "Chiusura di SierraDeck...";
            if (!VivoIlVecchio()) {
                Nota("il programma e' uscito: lancio l'installer");
                Installa();
                passo = 1;
            }
        } else if (passo == 1) {
            fase.Text = versione.Length > 0
                ? "Installazione della versione " + versione + "..."
                : "Installazione in corso...";
            if (installazione == null || installazione.HasExited) {
                Nota("installer terminato");
                Avvia();
                passo = 2;
            }
        } else if (passo == 2) {
            fase.Text = "Avvio della nuova versione...";
            if (giri > GIRI_MINIMI) passo = 3;
        } else {
            fase.Text = "Pronto.";
            valore = 100;
            if (giri > GIRI_MINIMI) { battito.Stop(); Nota("finito"); Chiudi(); return; }
        }

        // Un'installazione che non finisce piu' non deve lasciare una finestra
        // orfana sullo schermo per sempre.
        if (giri > GIRI_MASSIMI) {
            fase.Text = "L'installazione sta impiegando troppo: controlla SierraDeck.";
            battito.Stop();
            Nota("tempo scaduto");
            Chiudi();
            return;
        }

        barra.Width = (int)(320.0 * valore / 100.0);
        percento.Text = valore + "%";
    }

    void Chiudi() {
        Timer fine = new Timer();
        fine.Interval = 1600;
        fine.Tick += delegate { fine.Stop(); Close(); };
        fine.Start();
    }

    bool VivoIlVecchio() {
        if (pidVecchio <= 0) return false;
        try { Process.GetProcessById(pidVecchio); return true; } catch { return false; }
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

    void Avvia() {
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
