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
 * **Dal 16/11 (versione 14) è la stessa finestra degli aggiornamenti.** Prima
 * nasceva al centro dello schermo, con un aspetto suo. Nicholas: «voglio che
 * tutto l'aggiornamento venga fatto e visualizzato nella finestra a destra».
 * Ora nasce esattamente dove stava la finestra degli aggiornamenti del
 * programma (il rettangolo arriva nei parametri), della stessa misura, con gli
 * stessi colori, la stessa testata col simbolo, la stessa barra e «Cosa cambia»:
 * a chi guarda sembra la stessa finestra che continua mentre il programma è
 * chiuso. Si toglie quando il programma riaperto ha di nuovo una finestra
 * sullo schermo, così il passaggio non lascia buchi. La usa anche l'Aiutante.
 *
 * Il sorgente sta qui e viene compilato al primo avvio con il compilatore C#
 * che ogni Windows ha già: nessuna dipendenza da aggiungere, nessun secondo
 * eseguibile da firmare e distribuire. Quando questo testo cambia, l'updater si
 * ricompila da solo — è il modo in cui si aggiorna senza che nessuno lo
 * sostituisca mentre sta lavorando.
 *
 * Il testo comincia con il BOM: è così che il compilatore lo legge come UTF-8 e
 * le frasi a schermo possono avere accenti e simboli veri.
 */

/**
 * Cambia a ogni modifica del sorgente: è il segno che fa ricompilare l'updater.
 *
 * A mano e non calcolata dal testo: una versione che cambia da sola a ogni
 * spazio aggiunto farebbe ricompilare per niente, e chi la alza qui sta anche
 * dicendo «ho cambiato qualcosa che conta».
 */
export const VERSIONE_UPDATER = 14

/** Il file delle novità, accanto all'eseguibile: una riga per voce («# 0.108.0», «- testo»). */
export const FILE_NOTE_UPDATER = 'aggiornamento-note.txt'

export function sorgenteUpdater(): string {
  return '﻿' + `using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

// SierraDeck Update - installa una versione nuova mentre il programma e' chiuso.
// Argomenti: <pid> <installer> <eseguibile> <versione> [claude] [nota] [porta]
//            [nome] [rettangolo x,y,w,h] [versione di partenza]
//
// Il quinto, se c'e', e' il comando di Claude Code da aggiornare: si fa qui e
// non nel programma perche' qui il programma e' gia' chiuso, e Claude Code non
// si lascia sostituire mentre le sue chat lo tengono aperto.
class Aggiornamento : Form {
    static string percorsoDiario;

    // I colori della finestra degli aggiornamenti del programma (console.css).
    static readonly Color CHASSIS = Color.FromArgb(20, 22, 26);
    static readonly Color CHASSIS_ALTO = Color.FromArgb(26, 28, 32);
    static readonly Color CHASSIS_ACCESO = Color.FromArgb(33, 35, 39);
    static readonly Color FONDO_CUPO = Color.FromArgb(7, 9, 13);
    static readonly Color BORDO = Color.FromArgb(30, 32, 36);
    static readonly Color TESTO = Color.FromArgb(226, 228, 232);
    static readonly Color QUIETO = Color.FromArgb(160, 162, 166);
    static readonly Color ACCENTO = Color.FromArgb(74, 163, 255);
    static readonly Color VERDE = Color.FromArgb(84, 192, 122);
    static readonly Color ROSSO = Color.FromArgb(220, 95, 95);

    Font fontApp = new Font("Segoe UI", 8.25f);
    Font fontTitolo = new Font("Segoe UI Semibold", 12.75f);
    Font fontVersioni = new Font("Segoe UI", 9f);
    Font fontTesto = new Font("Segoe UI", 9.75f);
    Font fontPiccolo = new Font("Segoe UI", 9f);
    Font fontSezione = new Font("Segoe UI Semibold", 8.25f);
    Font fontSegni = new Font("Segoe UI Symbol", 9.75f);

    Timer battito;
    RichTextBox novita;

    int passo = 0;      // 0 attesa uscita, 1 installazione, 5 Claude Code, 2 avvio, 3 finito
    int valore = 0;
    // Il testo della fase, disegnato a ogni battito.
    string faseTesto = "Chiudo SierraDeck…";
    // 0 lavoro (blu), 1 riuscito (verde), 2 non riuscito (rosso).
    int tono = 0;

    /**
     * Quello che la spia racconta a chi guarda da fuori.
     *
     * 'volatile' perche' li scrive il thread dell'interfaccia e li legge quello
     * della spia: senza, il secondo potrebbe leggere all'infinito una copia
     * ferma nella sua cache.
     */
    static volatile string spiaTesto = "Chiudo SierraDeck…";
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
    string nome = "SierraDeck";
    string daVersione = "";
    // Il passo di Claude Code c'e' solo per il programma completo: l'Aiutante
    // non passa ne' comando ne' nota, e per lui sarebbe una riga vuota.
    bool conClaude;
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
    // sparisce in un lampo non e' apparsa.
    const int GIRI_MINIMI = 45;
    // Quanto si aspetta prima di smettere di chiedere per favore: cinque
    // secondi bastano a una finestra per salvare e sparire.
    const int GIRI_GENTILI = 25;
    int vuoti = 0;
    // I giri passati **in questa fase**: la barra misura il tempo di ogni
    // tratto, non quello totale.
    int giriPasso = 0;
    int vistiUnaVolta = -1;
    const int GIRI_MASSIMI = 3000;
    // Quanto si aspetta che la nuova istanza si faccia viva prima di dire
    // «fatto» comunque: trenta secondi.
    const int GIRI_AVVIO = 150;
    // Il passaggio di mano: dal giro in cui si e' finito (bene o male) si
    // aspetta che il programma riaperto abbia una finestra a schermo, almeno
    // per questi giri e non oltre quelli.
    int giroFinale = -1;
    int finaleMinimo = 8;
    const int FINALE_MASSIMO = 100;
    bool chiudendo = false;

    [DllImport("user32.dll")] static extern bool ReleaseCapture();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr finestra, int messaggio, int w, int l);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr finestra);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr finestra, out uint pid);
    delegate bool Visita(IntPtr finestra, IntPtr dato);
    [DllImport("user32.dll")] static extern bool EnumWindows(Visita visita, IntPtr dato);
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr finestra, int attributo, ref int valore, int grandezza);

    /**
     * I parametri scritti accanto all'eseguibile, uno per riga.
     */
    static string[] DaFile() {
        try {
            string mio = Path.GetDirectoryName(Application.ExecutablePath);
            string f = Path.Combine(mio, "aggiornamento.txt");
            if (!File.Exists(f)) { Nota("nessun aggiornamento.txt accanto a me"); return new string[0]; }
            string[] righe = File.ReadAllLines(f, Encoding.UTF8);
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
        if (args.Length > 7 && args[7].Trim().Length > 0) nome = args[7].Trim();
        string rettangolo = args.Length > 8 ? args[8] : "";
        daVersione = args.Length > 9 ? args[9].Trim() : "";
        conClaude = claude.Length > 0 || notaClaude.Length > 0;
        faseTesto = "Chiudo " + nome + "…";
        spiaTesto = faseTesto;
        spiaVersione = versione;
        // Porta zero: nessun telefono da servire (l'Aiutante). La spia resta spenta.
        if (porta > 0) AvviaSpia(porta);

        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        Bounds = Dove(rettangolo);
        BackColor = CHASSIS;
        DoubleBuffered = true;
        TopMost = true;
        ShowInTaskbar = true;
        Text = nome + " · Aggiornamento";

        // Il simbolo come icona della finestra: senza, nella barra delle
        // applicazioni compare il rettangolo bianco di Windows.
        try {
            Bitmap b = new Bitmap(64, 64);
            using (Graphics g = Graphics.FromImage(b)) {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                Simbolo(g, 0, 0, 64);
            }
            Icon = System.Drawing.Icon.FromHandle(b.GetHicon());
        } catch {
            // Senza icona resta il rettangolo bianco: brutto, non grave.
        }

        novita = new RichTextBox();
        novita.BorderStyle = BorderStyle.None;
        novita.ReadOnly = true;
        novita.TabStop = false;
        novita.DetectUrls = false;
        novita.ScrollBars = RichTextBoxScrollBars.None;
        novita.BackColor = CHASSIS;
        novita.ForeColor = TESTO;
        novita.Font = fontTesto;
        novita.Cursor = Cursors.Default;
        Controls.Add(novita);
        ScriviNovita();
        Disponi();
        Resize += delegate { Disponi(); Invalidate(); };
        // Si trascina dalla testata, come quella del programma.
        MouseDown += delegate(object o, MouseEventArgs e) {
            if (e.Button == MouseButtons.Left && e.Y < 76) {
                ReleaseCapture();
                SendMessage(Handle, 0xA1, 2, 0);
            }
        };

        battito = new Timer();
        battito.Interval = 200;
        battito.Tick += new EventHandler(Batte);
        battito.Start();
        Nota("finestra pronta in " + Bounds.ToString() + ", versione attesa " + versione);
    }

    protected override void OnHandleCreated(EventArgs e) {
        base.OnHandleCreated(e);
        // Gli angoli arrotondati di Windows 11, come le finestre del programma.
        // Su Windows 10 la chiamata non esiste o non fa niente: angoli dritti.
        try {
            int tondi = 2;
            DwmSetWindowAttribute(Handle, 33, ref tondi, 4);
        } catch {
            // Un ornamento: un aggiornamento non si ferma per lui.
        }
    }

    /**
     * Dove nasce: dove stava la finestra degli aggiornamenti del programma.
     *
     * Il rettangolo arriva da SierraDeck, che sa dov'era (o dove sarebbe) la
     * sua finestra. Senza, o se e' fuori da ogni schermo, l'angolo in basso a
     * destra dello schermo principale con la misura di sempre: mai il centro.
     */
    static Rectangle Dove(string testo) {
        try {
            string[] p = (testo ?? "").Split(',');
            if (p.Length == 4) {
                Rectangle r = new Rectangle(int.Parse(p[0].Trim()), int.Parse(p[1].Trim()), int.Parse(p[2].Trim()), int.Parse(p[3].Trim()));
                if (r.Width >= 300 && r.Height >= 300) {
                    foreach (Screen s in Screen.AllScreens) {
                        if (s.WorkingArea.IntersectsWith(r)) return r;
                    }
                }
            }
        } catch {
            // Un rettangolo storto vale come nessun rettangolo.
        }
        Rectangle area = Screen.PrimaryScreen.WorkingArea;
        int larga = Math.Min(520, area.Width - 24);
        int alta = Math.Min(640, area.Height - 24);
        return new Rectangle(area.Right - 12 - larga, area.Bottom - 12 - alta, larga, alta);
    }

    // Dove stanno le parti, a misura della finestra.
    const int TESTA = 76;
    const int STATO_Y = 88;
    const int STATO_ALTO = 112;
    const int RIGA_PASSO = 24;
    const int PIEDE = 44;

    string[] Passi() {
        string installo = versione.Length > 0 ? "Installo la versione " + versione : "Installo la versione nuova";
        if (conClaude) return new string[] { "Chiudo " + nome, installo, "Controllo Claude Code", "Riapro " + nome };
        return new string[] { "Chiudo " + nome, installo, "Riapro " + nome };
    }

    /** Quale passo e' in corso, nell'elenco di Passi(); la lunghezza = tutti fatti. */
    int PassoInCorso() {
        int n = Passi().Length;
        if (passo == 0) return 0;
        if (passo == 1) return 1;
        if (passo == 5) return 2;
        if (passo == 2) return n - 1;
        return n;
    }

    int NovitaY() {
        return STATO_Y + STATO_ALTO + 14 + Passi().Length * RIGA_PASSO + 14;
    }

    void Disponi() {
        if (novita == null) return;
        int y = NovitaY() + 22;
        novita.SetBounds(16, y, Math.Max(10, ClientSize.Width - 32), Math.Max(10, ClientSize.Height - PIEDE - 10 - y));
    }

    /**
     * «Cosa cambia»: le novita' che il programma ha scritto accanto a noi.
     * Una riga «# 0.108.0» apre una versione, «- testo» e' una voce.
     */
    void ScriviNovita() {
        string[] righe = new string[0];
        try {
            string f = Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), "${FILE_NOTE_UPDATER}");
            if (File.Exists(f)) righe = File.ReadAllLines(f, Encoding.UTF8);
        } catch (Exception e) {
            Nota("novita non lette: " + e.Message);
        }
        bool qualcosa = false;
        foreach (string grezza in righe) {
            string r = grezza.TrimEnd();
            if (r.Trim().Length == 0) continue;
            if (r.StartsWith("# ")) {
                if (qualcosa) Aggiungi(Environment.NewLine, fontTesto, TESTO);
                Aggiungi(r.Substring(2).Trim() + Environment.NewLine, fontTitolo, TESTO);
            } else if (r.StartsWith("## ")) {
                Aggiungi(r.Substring(3).Trim() + Environment.NewLine, fontSezione, QUIETO);
            } else if (r.StartsWith("- ")) {
                Aggiungi("•  ", fontTesto, ACCENTO);
                Aggiungi(r.Substring(2).Trim() + Environment.NewLine, fontTesto, TESTO);
            } else {
                Aggiungi(r.Trim() + Environment.NewLine, fontTesto, QUIETO);
            }
            qualcosa = true;
        }
        if (!qualcosa) {
            Aggiungi("Le novità le trovi nella finestra degli aggiornamenti appena " + nome + " si riapre.", fontTesto, QUIETO);
        }
        novita.SelectionStart = 0;
        novita.SelectionLength = 0;
    }

    void Aggiungi(string testo, Font font, Color colore) {
        novita.SelectionStart = novita.TextLength;
        novita.SelectionLength = 0;
        novita.SelectionFont = font;
        novita.SelectionColor = colore;
        novita.AppendText(testo);
    }

    /** Il simbolo di SierraDeck: i cinque piani del cristallo con la scheggia verde. */
    static void Simbolo(Graphics g, float x, float y, float lato) {
        // Il disegno originale sta fra 80 e 440 (viewBox dell'SVG del programma).
        Faccia(g, x, y, lato, new float[] { 268,92, 392,306, 268,306 }, Color.FromArgb(223,227,231));
        Faccia(g, x, y, lato, new float[] { 268,92, 132,306, 268,306 }, Color.FromArgb(125,133,141));
        Faccia(g, x, y, lato, new float[] { 132,306, 268,306, 200,412 }, Color.FromArgb(82,90,98));
        Faccia(g, x, y, lato, new float[] { 268,306, 392,306, 326,412 }, Color.FromArgb(54,61,68));
        Faccia(g, x, y, lato, new float[] { 200,412, 326,412, 268,306 }, Color.FromArgb(37,43,49));
        Faccia(g, x, y, lato, new float[] { 268,92, 312,168, 268,168 }, Color.FromArgb(84,192,122));
    }

    static void Faccia(Graphics g, float x, float y, float lato, float[] p, Color c) {
        float s = lato / 360f;
        PointF[] punti = new PointF[p.Length / 2];
        for (int i = 0; i < punti.Length; i++) punti[i] = new PointF(x + (p[i*2] - 80) * s, y + (p[i*2+1] - 80) * s);
        using (SolidBrush pennello = new SolidBrush(c)) g.FillPolygon(pennello, punti);
    }

    static GraphicsPath Tondo(float x, float y, float l, float a, float r) {
        GraphicsPath p = new GraphicsPath();
        float d = r * 2;
        p.AddArc(x, y, d, d, 180, 90);
        p.AddArc(x + l - d, y, d, d, 270, 90);
        p.AddArc(x + l - d, y + a - d, d, d, 0, 90);
        p.AddArc(x, y + a - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    static void Riempi(Graphics g, Color c, float x, float y, float l, float a, float r) {
        if (l <= 0 || a <= 0) return;
        if (l < r * 2) r = l / 2;
        using (GraphicsPath p = Tondo(x, y, l, a, r))
        using (SolidBrush pennello = new SolidBrush(c)) g.FillPath(pennello, p);
    }

    Color ColoreTono() {
        if (tono == 1) return VERDE;
        if (tono == 2) return ROSSO;
        return ACCENTO;
    }

    string Titolo() {
        if (tono == 1) return versione.Length > 0 ? "Installata la versione " + versione : "Aggiornamento installato";
        if (tono == 2) return "Aggiornamento non riuscito";
        return versione.Length > 0 ? "Installo la versione " + versione : "Installo l'aggiornamento";
    }

    protected override void OnPaint(PaintEventArgs e) {
        Graphics g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
        int W = ClientSize.Width;
        int H = ClientSize.Height;
        TextFormatFlags riga = TextFormatFlags.NoPrefix | TextFormatFlags.EndEllipsis | TextFormatFlags.SingleLine;

        // La testata: lo stesso sfumato, il simbolo nel suo riquadro scuro.
        using (LinearGradientBrush sfumato = new LinearGradientBrush(new Rectangle(0, 0, W, TESTA), CHASSIS_ALTO, CHASSIS, 90f)) {
            g.FillRectangle(sfumato, 0, 0, W, TESTA);
        }
        Riempi(g, FONDO_CUPO, 16, 16, 40, 40, 10);
        Simbolo(g, 22, 22, 28);
        TextRenderer.DrawText(g, nome.ToUpperInvariant(), fontApp, new Rectangle(68, 14, W - 84, 16), QUIETO, riga);
        TextRenderer.DrawText(g, Titolo(), fontTitolo, new Rectangle(66, 29, W - 82, 26), TESTO, riga);
        string versioni = daVersione.Length > 0 && versione.Length > 0 ? daVersione + "  →  " + versione : versione;
        TextRenderer.DrawText(g, versioni, fontVersioni, new Rectangle(68, 54, W - 84, 18), QUIETO, riga);

        // Il riquadro dello stato: fase, barra, misure. Il bordo a sinistra
        // dice com'e' andata: blu lavoro, verde fatto, rosso non riuscito.
        int x = 16;
        int l = W - 32;
        Riempi(g, FONDO_CUPO, x, STATO_Y, l, STATO_ALTO, 8);
        using (SolidBrush lato = new SolidBrush(ColoreTono())) g.FillRectangle(lato, x, STATO_Y + 4, 3, STATO_ALTO - 8);
        TextRenderer.DrawText(g, faseTesto, fontTesto, new Rectangle(x + 14, STATO_Y + 10, l - 28, 40), TESTO,
            TextFormatFlags.NoPrefix | TextFormatFlags.WordBreak | TextFormatFlags.EndEllipsis);
        int binario = l - 28;
        Riempi(g, CHASSIS_ACCESO, x + 14, STATO_Y + 56, binario, 8, 4);
        Riempi(g, ColoreTono(), x + 14, STATO_Y + 56, (float)(binario * valore / 100.0), 8, 4);
        int n = Passi().Length;
        int corrente = Math.Min(PassoInCorso() + 1, n);
        TextRenderer.DrawText(g, valore + "%", fontPiccolo, new Rectangle(x + 14, STATO_Y + 70, 80, 18), QUIETO, riga);
        TextRenderer.DrawText(g, "passo " + corrente + " di " + n, fontPiccolo, new Rectangle(x + 14, STATO_Y + 70, binario, 18), QUIETO,
            riga | TextFormatFlags.Right);
        string sotto = tono == 2
            ? "I tuoi dati non sono stati toccati."
            : (tono == 1 ? nome + " si sta riaprendo." : "Non serve fare niente: riapro " + nome + " da solo.");
        TextRenderer.DrawText(g, sotto, fontPiccolo, new Rectangle(x + 14, STATO_Y + 88, binario, 18), QUIETO, riga);

        // I passi, uno per riga: fatto, in corso, da fare.
        int y = STATO_Y + STATO_ALTO + 14;
        string[] passi = Passi();
        int inCorso = PassoInCorso();
        for (int i = 0; i < passi.Length; i++) {
            string segno;
            Color colore;
            Color testo = TESTO;
            if (i < inCorso) { segno = "✓"; colore = VERDE; testo = QUIETO; }
            else if (i == inCorso && tono == 2) { segno = "✕"; colore = ROSSO; }
            else if (i == inCorso) { segno = "●"; colore = ACCENTO; }
            else { segno = "○"; colore = QUIETO; testo = QUIETO; }
            TextRenderer.DrawText(g, segno, fontSegni, new Rectangle(x + 4, y + i * RIGA_PASSO, 20, RIGA_PASSO), colore,
                TextFormatFlags.NoPrefix | TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            TextRenderer.DrawText(g, passi[i], fontTesto, new Rectangle(x + 30, y + i * RIGA_PASSO, l - 30, RIGA_PASSO), testo,
                riga | TextFormatFlags.VerticalCenter);
        }

        // «Cosa cambia», come nella finestra del programma.
        TextRenderer.DrawText(g, "COSA CAMBIA", fontSezione, new Rectangle(16, NovitaY(), W - 32, 18), QUIETO, riga);

        // Il piede, con la riga sopra.
        using (Pen linea = new Pen(BORDO)) {
            g.DrawLine(linea, 0, H - PIEDE, W, H - PIEDE);
            g.DrawRectangle(linea, 0, 0, W - 1, H - 1);
        }
        TextRenderer.DrawText(g, "Si chiude da sola quando " + nome + " è di nuovo aperto.", fontPiccolo,
            new Rectangle(16, H - PIEDE + 13, W - 32, 18), QUIETO, riga);
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
     * raggiungerla, rallentando quando la fase dura piu' del previsto.
     */
    int Avanzamento() {
        double t = giriPasso;
        double previsti = Previsti();
        double frazione = t / (t + previsti * 0.25);
        int da = Da();
        return da + (int)((A() - da) * frazione);
    }

    /**
     * Passa a una fase nuova.
     *
     * Azzerare il cronometro della fase e' il punto di tutto: la barra misura
     * quanto sta durando **questo** tratto, non quanto e' passato dall'inizio.
     */
    void Vai(int prossimo) {
        passo = prossimo;
        giriPasso = 0;
        // La barra non torna indietro.
        if (valore < Da()) valore = Da();
    }

    /**
     * Da qui si aspetta solo il passaggio di mano: com'e' andata e' deciso.
     * Minimo: quanti giri tenere comunque la finestra, perche' si legga.
     */
    void Finale(int minimo) {
        if (giroFinale >= 0) return;
        giroFinale = giri;
        finaleMinimo = minimo;
    }

    void Batte(object mittente, EventArgs e) {
        giri++;
        giriPasso++;

        if (giroFinale >= 0) {
            // Finito (bene o male): si resta finche' il programma riaperto non
            // ha di nuovo una finestra a schermo - la sua finestra degli
            // aggiornamenti nasce nello stesso angolo e prende il nostro posto.
            int passati = giri - giroFinale;
            bool pronto = passati >= finaleMinimo && giri > GIRI_MINIMI && FinestraNuova();
            if (!chiudendo && (pronto || passati > FINALE_MASSIMO)) {
                Nota(pronto ? "il programma ha di nuovo una finestra: mi tolgo" : "nessuna finestra del programma: mi tolgo lo stesso");
                Chiudi();
            }
            Aggiorna();
            return;
        }

        int calcolato = Avanzamento();
        if (calcolato > valore) valore = calcolato;

        if (passo == 0) {
            int rimasti = ChiudiTutte();
            faseTesto = rimasti > 1
                ? "Chiudo " + nome + " (" + rimasti + " finestre)…"
                : "Chiudo " + nome + "…";
            // Tre giri a zero di fila: un processo che sta uscendo sparisce
            // dall'elenco un istante prima di rilasciare i suoi file, e
            // partire in quell'istante e' il conflitto da evitare.
            if (rimasti == 0) vuoti++; else vuoti = 0;
            if (vuoti >= 3) {
                Nota("nessuna istanza rimasta: lancio l'installer");
                Installa();
                Vai(1);
            }
        } else if (passo == 1) {
            faseTesto = versione.Length > 0
                ? "Installo la versione " + versione + "…"
                : "Installo la versione nuova…";
            // Uscire non e' riuscire. Un'installazione nulla vuol dire che
            // Installa() non e' nemmeno partito; un codice d'uscita diverso da
            // zero vuol dire che l'installer e' uscito ma ha fallito (file in
            // uso, disinstallazione non riuscita). In entrambi i casi
            // proseguire riaprirebbe il binario VECCHIO dicendo «fatto». Solo il
            // codice d'uscita zero e' un successo.
            if (installazione == null || (installazione.HasExited && installazione.ExitCode != 0)) {
                faseTesto = installazione == null
                    ? "Non sono riuscito ad avviare l'installazione. Riapro la versione di prima."
                    : "L'installazione non è riuscita (codice " + installazione.ExitCode + "). Riapro la versione di prima.";
                Nota(installazione == null
                    ? "installer non avviato: aggiornamento fallito"
                    : "installer fallito, codice " + installazione.ExitCode);
                tono = 2;
                // Si ridA' all'utente la sua versione: l'installazione fallita non
                // l'ha toccata. La barra resta al valore vero, non 100.
                Avvia();
                Finale(40);
                Aggiorna();
                return;
            }
            if (installazione.HasExited) {
                Nota("installer terminato (codice 0)");
                // Claude Code prima della riapertura, sempre: quando c'e' da
                // aggiornarlo lo si aggiorna, quando non c'e' lo si dice.
                if (conClaude) {
                    AggiornaClaude();
                    Vai(5);
                } else {
                    Avvia();
                    Vai(2);
                }
            }
        } else if (passo == 5) {
            // Claude Code: si aggiorna adesso, che nessuna chat lo tiene aperto.
            if (claudeInCorso == null) {
                // Nessun comando da eseguire: lo si dice, una fase che passa in
                // silenzio si legge come una fase che non e' avvenuta.
                faseTesto = notaClaude.Length > 0 ? notaClaude : "Claude Code non verificato.";
                if (giriPasso >= 10) {
                    Avvia();
                    Vai(2);
                }
            } else if (claudeInCorso.HasExited) {
                if (claudeFinitoAGiro < 0) {
                    claudeFinitoAGiro = giri;
                    Nota("claude code aggiornato" + (claudeVersioneVista.Length > 0 ? " alla " + claudeVersioneVista : ""));
                }
                faseTesto = claudeVersioneVista.Length > 0
                    ? "Claude Code aggiornato alla versione " + claudeVersioneVista + "."
                    : "Claude Code aggiornato.";
                if (giri - claudeFinitoAGiro >= 8) {
                    Avvia();
                    Vai(2);
                }
            } else {
                faseTesto = claudeVersioneVista.Length > 0
                    ? "Aggiorno Claude Code alla versione " + claudeVersioneVista + "…"
                    : "Cerco aggiornamenti di Claude Code…";
            }
        } else if (passo == 2) {
            faseTesto = "Riapro " + nome + "…";
            // Si aspetta che la nuova istanza sia davvero in piedi prima di
            // dire «fatto». I giri di questa fase e non quelli totali.
            if (NuovaViva() || giriPasso > GIRI_AVVIO) Vai(3);
        } else {
            faseTesto = versione.Length > 0
                ? "Fatto: la versione " + versione + " è installata."
                : "Fatto: aggiornamento installato.";
            valore = 100;
            tono = 1;
            Nota("finito");
            Finale(8);
        }

        // Un'installazione che non finisce piu' non deve lasciare una finestra
        // orfana sullo schermo per sempre.
        if (giri > GIRI_MASSIMI && giroFinale < 0) {
            faseTesto = "L'installazione sta impiegando troppo: apri " + nome + " e controlla.";
            tono = 2;
            Nota("tempo scaduto");
            Finale(40);
        }

        Aggiorna();
    }

    void Aggiorna() {
        spiaTesto = faseTesto;
        spiaPercento = valore;
        Invalidate();
    }

    /**
     * La spia: **questo** programma risponde al telefono mentre SierraDeck e' morto.
     *
     * Dal telefono, durante l'installazione, non c'era nessuno a cui chiedere
     * a che punto si fosse: SierraDeck e' chiuso, ed e' proprio lui che parla
     * col telefono. Ma c'e' un programma vivo esattamente in quei trenta
     * secondi, ed e' questo. La porta del Client e' libera proprio perche'
     * SierraDeck l'ha lasciata: la si prende in prestito, stessa rotta
     * '/api/aggiornamento', e il telefono legge le **nostre** parole e la
     * **nostra** percentuale.
     *
     * Un 'TcpListener' e non 'HttpListener': il secondo, su Windows, vuole una
     * prenotazione dell'URL o i diritti di amministratore.
     *
     * Non puo' far fallire l'aggiornamento: gira in un thread a parte, in un
     * try che ingoia tutto.
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
     * ne perde uno strato per strada.
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

    /** Si toglie piano: mezzo secondo di dissolvenza, poi via. */
    void Chiudi() {
        if (chiudendo) return;
        chiudendo = true;
        battito.Stop();
        Invalidate();
        Timer fine = new Timer();
        fine.Interval = 40;
        fine.Tick += delegate {
            Opacity = Math.Max(0, Opacity - 0.08);
            if (Opacity <= 0.01) { fine.Stop(); spiaViva = false; Close(); }
        };
        fine.Start();
    }

    /**
     * Il programma riaperto ha una finestra visibile? E' il momento di passare
     * la mano: la sua finestra degli aggiornamenti nasce nello stesso angolo.
     */
    bool FinestraNuova() {
        try {
            string nomeExe = Path.GetFileNameWithoutExtension(eseguibile);
            if (nomeExe == null || nomeExe.Length == 0) return false;
            Process[] vivi = Process.GetProcessesByName(nomeExe);
            if (vivi.Length == 0) return false;
            System.Collections.Generic.HashSet<uint> pid = new System.Collections.Generic.HashSet<uint>();
            foreach (Process p in vivi) { if (p.Id != pidVecchio) pid.Add((uint)p.Id); }
            bool trovata = false;
            EnumWindows(delegate(IntPtr f, IntPtr d) {
                uint suo;
                GetWindowThreadProcessId(f, out suo);
                if (pid.Contains(suo) && IsWindowVisible(f)) { trovata = true; return false; }
                return true;
            }, IntPtr.Zero);
            return trovata;
        } catch { return false; }
    }

    /**
     * Chiude ogni istanza del programma e dice quante ne restano.
     *
     * Non basta aspettare quella che ci ha lanciati: una seconda finestra
     * aperta su un altro monitor tiene aperti gli stessi file - e l'installer
     * si ferma con «impossibile disinstallare i vecchi file».
     *
     * Prima si chiede con gentilezza, cosi' il programma salva quello che deve;
     * dopo qualche secondo, chi non se ne va viene chiuso comunque.
     */
    int ChiudiTutte() {
        string nomeExe = Path.GetFileNameWithoutExtension(eseguibile);
        if (nomeExe == null || nomeExe.Length == 0) nomeExe = "SierraDeck";
        Process[] trovati;
        // Se non si riesce a contarle, si assume che ce ne sia una: «non lo so»
        // deve fermare, non far partire.
        try { trovati = Process.GetProcessesByName(nomeExe); } catch { return 1; }

        int mio = Process.GetCurrentProcess().Id;
        int vivi = 0;
        foreach (Process p in trovati) {
            try {
                if (p.HasExited) continue;
                if (p.Id == mio) continue;
                vivi++;
                if (giri < GIRI_GENTILI) {
                    // CloseMainWindow non fa niente quando la finestra
                    // principale non c'e' ancora: si insiste a ogni giro e, se
                    // il tempo di grazia passa, si chiude comunque.
                    p.CloseMainWindow();
                } else {
                    Nota("chiudo a forza il processo " + p.Id + " (" + nomeExe + ")");
                    p.Kill();
                }
            } catch {
                // Un processo che sparisce fra l elenco e la chiusura: e
                // esattamente quello che stiamo aspettando che succeda.
            }
        }
        if (vivi != vistiUnaVolta) {
            Nota("istanze di " + nomeExe + " ancora aperte: " + vivi);
            vistiUnaVolta = vivi;
        }
        return vivi;
    }

    void Installa() {
        try {
            ProcessStartInfo p = new ProcessStartInfo(installer);
            // Silenzioso: la finestra che si vede e' questa. A riaprire il
            // programma ci pensiamo noi, dopo, quando siamo sicuri che
            // l'installazione e' finita davvero.
            p.Arguments = "/S --update-if-installed";
            p.UseShellExecute = false;
            installazione = Process.Start(p);
        } catch (Exception e) {
            Nota("installer non partito: " + e.Message);
        }
    }

    /** La nuova versione e' gia' partita? */
    bool NuovaViva() {
        try {
            string nomeExe = Path.GetFileNameWithoutExtension(eseguibile);
            if (nomeExe == null || nomeExe.Length == 0) return false;
            return Process.GetProcessesByName(nomeExe).Length > 0;
        } catch { return false; }
    }

    /**
     * Aggiorna Claude Code con il suo stesso comando.
     *
     * Non si reinstalla e non si scarica niente da noi: «claude update» sa
     * come farlo.
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
            // NIENTE console: gira nascosta e cio' che fa lo raccontiamo noi,
            // nella stessa finestra.
            p.CreateNoWindow = true;
            p.RedirectStandardOutput = true;
            p.RedirectStandardError = true;
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
     * Una riga dall'output di «claude update». Gira su un thread del pool: qui
     * si tocca solo un campo stringa, e la finestra lo legge al suo battito.
     */
    void RigaClaude(object mittente, DataReceivedEventArgs ev) {
        if (ev == null || ev.Data == null) return;
        Nota("claude> " + ev.Data);
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
        // **La porta si molla prima di riaprire**, e non alla fine: se la spia
        // la tenesse ancora mentre la nuova versione parte, quella resterebbe
        // senza Client e il telefono non la vedrebbe piu'.
        spiaViva = false;
        Nota("spia spenta: la porta torna al programma");
        try {
            if (File.Exists(eseguibile)) {
                ProcessStartInfo p = new ProcessStartInfo(eseguibile);
                p.UseShellExecute = true;
                // Il segno del rilancio: se la versione vecchia fosse ancora
                // viva, la nuova le arriva come seconda copia e lei mostra le
                // sue finestre invece di aprirne un'altra.
                p.Arguments = "--aggiornato";
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
