import { spawn as spawnVero, type SpawnOptions, type ChildProcess } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * La finestra che accompagna l'aggiornamento, **fuori** da SierraDeck.
 *
 * Prima era una BrowserWindow del programma, e moriva con lui: l'installer
 * chiudeva SierraDeck, la finestra spariva insieme, e restava uno schermo vuoto
 * per tutto il tempo dell'installazione — cioè proprio nel momento in cui
 * serviva qualcosa da guardare. Una finestra che deve sopravvivere a chi la
 * apre non può vivere nel suo processo.
 *
 * Quindi un processo suo, che non condivide niente con l'app: PowerShell con
 * WinForms, presente su ogni Windows, senza file dell'installazione in mezzo —
 * l'eseguibile viene sostituito mentre lei è viva, e un processo che lo tenesse
 * aperto bloccherebbe l'installazione che sta guardando.
 *
 * Due cose imparate sbattendoci la testa, e scritte qui perché non si ripetano:
 *
 * - **`detached` non si usa.** Sembra la cosa da chiedere per un processo che
 *   deve sopravviverci, ma su Windows crea il processo senza console e
 *   PowerShell muore subito, in silenzio. È il motivo per cui la finestra non
 *   compariva.
 * - **Non si dà per scontato che sia nata.** Fra il momento in cui la si chiede
 *   e quello in cui esiste passano un avvio di PowerShell e il caricamento di
 *   WinForms: chi chiama chiude il programma un istante dopo, e senza aspettare
 *   la si spegne mentre sta nascendo. Ora la finestra scrive di esserci, e
 *   l'installazione parte solo dopo.
 *
 * E la percentuale non è più una finta sul tempo: segue le tre cose che
 * succedono davvero, una dopo l'altra, e la finestra si chiude quando la nuova
 * versione è partita per davvero — non un istante prima.
 */

/** Oltre questo la finestra si toglie da sola: meglio sparire che restare orfana. */
export const TIMEOUT_S = 600

const NOME_SCRIPT = 'sierradeck-aggiornamento.ps1'
const NOME_DATI = 'sierradeck-aggiornamento.json'
const NOME_LANCIO = 'sierradeck-lancio.ps1'
const NOME_DIARIO = 'sierradeck-finestra.log'
/** Quanto si aspetta, e a che passo, che la finestra si faccia viva. */
const PASSO_MS = 250
const TENTATIVI = 20

export type Avvio = (
  comando: string,
  argomenti: string[],
  opzioni: SpawnOptions
) => Pick<ChildProcess, 'unref'> & { on?: ChildProcess['on'] }

export type DatiFinestra = {
  /** L'eseguibile installato, quello che l'installer sostituirà. */
  esePath: string
  /** La versione attesa: è così che si riconosce che la sostituzione è avvenuta. */
  versione: string
  /** Il processo che sta per morire: la prima fase aspetta che sia finito. */
  pidVecchio: number
}

/**
 * Lo script della finestra.
 *
 * Nessun dato ci entra per interpolazione: percorso, versione e pid arrivano
 * come parametri. Un percorso con un apice, o peggio, non deve poter diventare
 * codice — e i percorsi di Windows contengono di tutto.
 */
export function scriptFinestraAggiornamento(): string {
  // Il BOM non è un vezzo: senza, Windows PowerShell legge il file come ANSI e
  // ogni accento in questo testo arriva a schermo storto.
  return `﻿# I dati arrivano da un file accanto, non dalla riga di comando: passando
# per WMI la riga di comando andrebbe composta a mano, e un percorso di Windows
# con un apice dentro smetterebbe di essere un percorso.
$dati = Get-Content -LiteralPath (Join-Path $PSScriptRoot '${NOME_DATI}') -Raw -Encoding UTF8 | ConvertFrom-Json
$Exe = [string]$dati.esePath
$Versione = [string]$dati.versione
$PidVecchio = [int]$dati.pidVecchio
$TimeoutS = ${TIMEOUT_S}

$ErrorActionPreference = 'SilentlyContinue'
$diario = Join-Path $PSScriptRoot 'sierradeck-finestra.log'
function Nota($testo) {
  # Un giorno «non si vede la finestra» dovra' essere distinguibile da «non e'
  # partita»: senza una traccia sono la stessa frase, e si tira a indovinare.
  Add-Content -LiteralPath $diario -Value ((Get-Date -Format 'HH:mm:ss') + ' ' + $testo) -ErrorAction SilentlyContinue
}
Nota 'finestra avviata'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$sfondo = [System.Drawing.Color]::FromArgb(11, 12, 14)
$chiaro = [System.Drawing.Color]::FromArgb(223, 227, 231)
$tenue  = [System.Drawing.Color]::FromArgb(154, 161, 169)
$scuro  = [System.Drawing.Color]::FromArgb(27, 31, 35)
$blu    = [System.Drawing.Color]::FromArgb(74, 163, 255)

$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.StartPosition = 'CenterScreen'
$form.Size = New-Object System.Drawing.Size(460, 300)
$form.BackColor = $sfondo
$form.TopMost = $true
$form.ShowInTaskbar = $false

# Il logo, disegnato invece che caricato: un file da leggere sarebbe un file da
# trovare, e durante un aggiornamento le cartelle del programma stanno cambiando
# sotto i piedi. Sono gli stessi cinque piani del cristallo, con la scheggia
# verde in cima.
$logo = New-Object System.Windows.Forms.PictureBox
$logo.SetBounds(198, 26, 64, 64)
$logo.BackColor = [System.Drawing.Color]::Transparent
$disegno = New-Object System.Drawing.Bitmap 64, 64
$g = [System.Drawing.Graphics]::FromImage($disegno)
$g.SmoothingMode = 'AntiAlias'
$scala = 64.0 / 512.0
function Faccia($punti, $colore) {
  $poly = @()
  foreach ($p in $punti) {
    $poly += New-Object System.Drawing.PointF (($p[0] * $scala), ($p[1] * $scala))
  }
  $g.FillPolygon((New-Object System.Drawing.SolidBrush $colore), [System.Drawing.PointF[]]$poly)
}
Faccia @(@(268,92), @(392,306), @(268,306)) ([System.Drawing.Color]::FromArgb(223,227,231))
Faccia @(@(268,92), @(132,306), @(268,306)) ([System.Drawing.Color]::FromArgb(125,133,141))
Faccia @(@(132,306), @(268,306), @(200,412)) ([System.Drawing.Color]::FromArgb(82,90,98))
Faccia @(@(268,306), @(392,306), @(326,412)) ([System.Drawing.Color]::FromArgb(54,61,68))
Faccia @(@(200,412), @(326,412), @(268,306)) ([System.Drawing.Color]::FromArgb(37,43,49))
Faccia @(@(268,92), @(312,168), @(268,168)) ([System.Drawing.Color]::FromArgb(84,192,122))
$g.Dispose()
$logo.Image = $disegno
$form.Controls.Add($logo)

$titolo = New-Object System.Windows.Forms.Label
$titolo.Text = 'SIERRADECK UPDATE'
$titolo.ForeColor = $tenue
$titolo.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Regular)
$titolo.TextAlign = 'MiddleCenter'
$titolo.SetBounds(0, 100, 460, 24)
$form.Controls.Add($titolo)

$fase = New-Object System.Windows.Forms.Label
$fase.Text = 'Chiusura in corso...'
$fase.ForeColor = $chiaro
$fase.Font = New-Object System.Drawing.Font('Segoe UI', 11)
$fase.TextAlign = 'MiddleCenter'
$fase.SetBounds(0, 138, 460, 26)
$form.Controls.Add($fase)

$binario = New-Object System.Windows.Forms.Panel
$binario.SetBounds(70, 186, 320, 6)
$binario.BackColor = $scuro
$form.Controls.Add($binario)

$barra = New-Object System.Windows.Forms.Panel
$barra.SetBounds(0, 0, 0, 6)
$barra.BackColor = $blu
$binario.Controls.Add($barra)

$percento = New-Object System.Windows.Forms.Label
$percento.Text = '0%'
$percento.ForeColor = $chiaro
$percento.Font = New-Object System.Drawing.Font('Segoe UI', 20)
$percento.TextAlign = 'MiddleCenter'
$percento.SetBounds(0, 206, 460, 44)
$form.Controls.Add($percento)

# Lo stato vive in una tabella condivisa: dentro il tick del timer le variabili
# semplici sarebbero copie, e la percentuale non si muoverebbe mai.
$s = @{ v = 0; fase = 1; giri = 0; finita = $false; nuovoPid = 0 }
# Sotto questi giri non si chiude, qualunque cosa succeda: se l'installazione
# vola - e a volte vola - la finestra farebbe in tempo solo a lampeggiare
# mentre lo schermo e' occupato dall'installer, cioe' non sarebbe apparsa.
$giriMinimi = 40

$aggiorna = {
  $s.giri++
  # Un tetto per fase: la barra sale mentre si aspetta, ma non entra mai nel
  # territorio della fase successiva finche' quella non e' cominciata davvero.
  $tetto = switch ($s.fase) { 1 { 30 } 2 { 80 } 3 { 99 } default { 100 } }
  # Un passo per volta, mai un salto: una barra che va da 0 a 100 in un
  # fotogramma non dice niente a chi guarda, e sembra un difetto.
  if ($s.v -lt $tetto) { $s.v = [Math]::Min($tetto, $s.v + 2) }

  switch ($s.fase) {
    1 {
      $fase.Text = 'Chiusura di SierraDeck...'
      $vecchio = Get-Process -Id $PidVecchio -ErrorAction SilentlyContinue
      if ($null -eq $vecchio) { $s.fase = 2 }
    }
    2 {
      $fase.Text = 'Installazione della versione ' + $Versione + '...'
      $installata = (Get-Item -LiteralPath $Exe -ErrorAction SilentlyContinue).VersionInfo.ProductVersion
      if ($installata -and $installata.StartsWith($Versione)) { $s.fase = 3 }
    }
    3 {
      $fase.Text = 'Avvio della nuova versione...'
      $vivo = Get-Process -Name ([System.IO.Path]::GetFileNameWithoutExtension($Exe)) -ErrorAction SilentlyContinue |
        Where-Object { $_.Id -ne $PidVecchio }
      if ($vivo) { $s.fase = 4 }
    }
    4 {
      if ($s.fase4 -ne $true) { $s.fase4 = $true; Nota 'la nuova versione e partita' }
      $fase.Text = 'Pronto.'
      if ($s.giri -ge $giriMinimi) { $s.finita = $true }
    }
  }

  $barra.Width = [int](320 * $s.v / 100)
  $percento.Text = [string]$s.v + '%'

  # Il tempo scaduto non e' un motivo per restare li' per sempre: si dice cosa
  # e' successo e si sparisce, perche' una finestra orfana e' peggio del nulla.
  if ($s.giri -gt ($TimeoutS * 5)) {
    $fase.Text = "L'installazione sta impiegando troppo: controlla SierraDeck."
    $s.finita = $true
  }

  if ($s.finita) {
    $timer.Stop()
    $chiusura = New-Object System.Windows.Forms.Timer
    $chiusura.Interval = 1500
    $chiusura.Add_Tick({ $chiusura.Stop(); $form.Close() })
    $chiusura.Start()
  }
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$timer.Add_Tick($aggiorna)
$timer.Start()

Nota 'mostro la finestra'
[void]$form.ShowDialog()
Nota 'finestra chiusa'
`
}

/**
 * Il lanciatore: l'unica cosa che avviamo noi, e vive un istante.
 *
 * Chiede al servizio di sistema di creare la finestra, così il processo nasce
 * da lui e non da noi — nessun job ereditato, nessuna morte in compagnia. Se
 * WMI non risponde si ripiega su un avvio normale: una finestra che *forse*
 * sopravvive è meglio di nessuna finestra.
 */
export function scriptLancio(): string {
  return `﻿$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot '${NOME_SCRIPT}'
$riga = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $script + '"'
try {
  $esito = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $riga }
  if ($esito.ReturnValue -ne 0) { throw "Win32_Process ha risposto $($esito.ReturnValue)" }
} catch {
  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', $script
  )
}
`
}

/** Dove finisce lo script: una cartella temporanea, riscritta a ogni volta. */
export function percorsoScript(cartellaTemp: string = tmpdir()): string {
  return join(cartellaTemp, NOME_SCRIPT)
}

export function percorsoDati(cartellaTemp: string = tmpdir()): string {
  return join(cartellaTemp, NOME_DATI)
}

export function percorsoLancio(cartellaTemp: string = tmpdir()): string {
  return join(cartellaTemp, NOME_LANCIO)
}

export function argomentiFinestra(lancio: string): string[] {
  return [
    '-NoProfile',
    // Lo script lo abbiamo appena scritto noi: la politica di esecuzione della
    // macchina non c'entra, e senza questo non partirebbe su un PC qualunque.
    '-ExecutionPolicy', 'Bypass',
    '-WindowStyle', 'Hidden',
    '-File', lancio
  ]
}

/**
 * Apre la finestra e se ne dimentica.
 *
 * `detached` più `unref` è tutto il punto: il processo entra in un gruppo suo e
 * non viene tirato giù quando SierraDeck muore, che è esattamente ciò che
 * accade un istante dopo.
 */
/**
 * Dove sta PowerShell, per nome intero.
 *
 * Non `'powershell.exe'` e basta: quello si affida al `PATH` del processo, e il
 * `PATH` di un'applicazione impacchettata non è quello del terminale in cui si
 * fanno le prove. Un avvio che fallisce così non dà errore a schermo — la
 * finestra semplicemente non compare, che è precisamente il sintomo osservato.
 */
export function percorsoPowerShell(ambiente: NodeJS.ProcessEnv = process.env): string {
  const radice = ambiente.SystemRoot ?? ambiente.windir ?? 'C:\Windows'
  return join(radice, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/** Dove la finestra scrive di essere viva: è così che si sa che c'è davvero. */
export function percorsoDiario(cartellaTemp: string = tmpdir()): string {
  return join(cartellaTemp, NOME_DIARIO)
}

/**
 * Apre la finestra e **aspetta di vederla viva**.
 *
 * L'attesa non è prudenza: è la lezione di tre tentativi falliti. La finestra
 * nasce in un processo suo, e fra il momento in cui la si chiede e quello in cui
 * esiste passano un avvio di PowerShell e il caricamento di WinForms. Chi
 * chiama, subito dopo, chiude il programma e lancia l'installer: se non si
 * aspetta, si finisce per spegnere tutto mentre la finestra sta ancora
 * nascendo — e non nasce più.
 *
 * Due strade, provate in ordine. Prima quella diretta, che è la più semplice e
 * quella che funziona quando nessuno ci mette lo zampino. Poi, se non si è
 * fatta viva, il lanciatore che passa dal servizio di sistema — serve dove un
 * *job* di Windows ucciderebbe i figli insieme al padre.
 */
export async function avviaFinestraAggiornamento(
  dati: DatiFinestra,
  avvia: Avvio = spawnVero,
  cartellaTemp?: string,
  attendi: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<boolean> {
  try {
    writeFileSync(percorsoScript(cartellaTemp), scriptFinestraAggiornamento(), 'utf8')
    writeFileSync(percorsoDati(cartellaTemp), JSON.stringify(dati), 'utf8')
    writeFileSync(percorsoLancio(cartellaTemp), scriptLancio(), 'utf8')
    // Il diario di un aggiornamento precedente direbbe che questa finestra è
    // viva quando non è ancora nata.
    try { rmSync(percorsoDiario(cartellaTemp), { force: true }) } catch { /* non c'era */ }

    const powershell = existsSync(percorsoPowerShell()) ? percorsoPowerShell() : 'powershell.exe'
    const parti = (script: string): void => {
      const figlio = avvia(powershell, argomentiFinestra(script), {
        // **Niente `detached`**, per quanto sembri la cosa giusta da chiedere
        // per un processo che deve sopravviverci: su Windows quel flag crea il
        // processo *senza console*, e PowerShell muore all'istante senza dire
        // niente. È la ragione per cui la finestra non compariva — misurato:
        // senza il flag nasce in 750 ms, con il flag non nasce mai.
        //
        // A sopravvivere ci pensa Windows, che non uccide i figli quando il
        // padre esce; dove un *job* lo farebbe, c'è il lanciatore qui sotto.
        stdio: 'ignore',
        windowsHide: true
      })
      // `spawn` non solleva quando il comando non esiste: lo dice più tardi, su
      // un evento. Senza questo ascolto il fallimento resta muto, e dal di
      // fuori sembra soltanto una finestra che non compare.
      figlio.on?.('error', (err: unknown) => {
        console.error('[aggiornamenti] avvio della finestra fallito:', err)
      })
      figlio.unref()
    }

    parti(percorsoScript(cartellaTemp))
    if (await viva(cartellaTemp, attendi)) return true

    console.warn('[aggiornamenti] la finestra non si e fatta viva: provo dal servizio di sistema')
    parti(percorsoLancio(cartellaTemp))
    return await viva(cartellaTemp, attendi)
  } catch (err) {
    // Restare senza finestra è brutto; non aggiornarsi perché la finestra non
    // si è aperta sarebbe assurdo. Si va avanti lo stesso.
    console.error('[aggiornamenti] finestra di installazione non avviata:', err)
    return false
  }
}

/** Attende che la finestra scriva di esserci. Oltre l'attesa, non c'è. */
async function viva(
  cartellaTemp: string | undefined,
  attendi: (ms: number) => Promise<void>
): Promise<boolean> {
  for (let i = 0; i < TENTATIVI; i += 1) {
    await attendi(PASSO_MS)
    if (existsSync(percorsoDiario(cartellaTemp))) return true
  }
  return false
}
