import { spawn } from 'node:child_process'
import { DURATA_GETTONE_MS } from './accesso-claude'

/**
 * **«Rinnova l'accesso a Claude»: la sequenza** (16/11).
 *
 * Una finestra di PowerShell visibile (come «Collega Claude» dell'Aiutante):
 * 1. lancia `claude setup-token`: si apre il browser e Nicholas approva.
 *    È l'unico passo suo, una volta l'anno per PC: lo vuole Anthropic;
 * 2. cerca il gettone nello schermo della finestra (il testo che la CLI ha
 *    appena scritto). Se non lo trova (un terminale che non lascia leggere lo
 *    schermo) chiede di incollarlo, nascosto;
 * 3. lo cifra con DPAPI (vale solo per questo utente di Windows) e scrive
 *    `accesso-claude.json` (temporaneo + rinomina: mai un file a metà);
 * 4. dice fino a quando vale e si chiude da sola.
 *
 * Il servizio vede il file nuovo entro 15 secondi (`sorveglia-accesso.ts`) e
 * fa ripartire subito le chat ferme. Il gettone non passa mai dalla riga di
 * comando né da un file in chiaro.
 */

const q = (s: string): string => `'${s.replace(/'/gu, "''")}'`

export function scriptRinnovaAccesso(claude: string, file: string, titolo = 'SierraDeck - Rinnova l accesso a Claude'): string {
  const giorni = Math.round(DURATA_GETTONE_MS / (24 * 3600_000))
  return [
    "$ErrorActionPreference = 'Continue'",
    `$Host.UI.RawUI.WindowTitle = ${q(titolo)}`,
    "Write-Host 'Rinnovo dell accesso a Claude per un anno.' -ForegroundColor Cyan",
    "Write-Host 'Si apre il browser: approva con il tuo account Claude. Poi torna qui, al resto penso io.' -ForegroundColor Cyan",
    "Write-Host ''",
    `& ${q(claude)} setup-token`,
    "Write-Host ''",
    // 2. Il gettone dallo schermo: le ultime 400 righe, unite senza a capo (un gettone lungo va a capo).
    '$gettone = $null',
    'try {',
    '  $raw = $Host.UI.RawUI; $w = $raw.BufferSize.Width; $fine = $raw.CursorPosition.Y; $inizio = [Math]::Max(0, $fine - 400)',
    '  $celle = $raw.GetBufferContents((New-Object System.Management.Automation.Host.Rectangle 0, $inizio, ($w - 1), $fine))',
    '  $sb = New-Object System.Text.StringBuilder',
    '  for ($y = 0; $y -le ($fine - $inizio); $y++) { for ($x = 0; $x -lt $w; $x++) { $cella = $celle[$y, $x]; [void]$sb.Append($cella.Character) } }',
    "  $trovati = [regex]::Matches($sb.ToString(), 'sk-ant-oat\\d{2}-[A-Za-z0-9_-]{40,}')",
    '  if ($trovati.Count -gt 0) { $gettone = $trovati[$trovati.Count - 1].Value }',
    '} catch { }',
    'if (-not $gettone) {',
    "  Write-Host 'Non riesco a leggere il gettone dallo schermo.' -ForegroundColor Yellow",
    "  Write-Host 'Copialo da qui sopra (comincia con sk-ant-oat) e incollalo qui (resta nascosto), poi Invio.' -ForegroundColor Yellow",
    "  $s = Read-Host 'Gettone' -AsSecureString",
    '  $gettone = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)).Trim()',
    '}',
    "if (-not ($gettone -match '^sk-ant-oat\\d{2}-[A-Za-z0-9_-]{40,}$')) {",
    "  Write-Host 'Nessun gettone valido: non ho cambiato niente. Puoi riprovare quando vuoi.' -ForegroundColor Red",
    "  Write-Host 'Premi Invio per chiudere.'; [void](Read-Host); exit 1",
    '}',
    // 3. Cifrato con DPAPI e scritto per intero.
    'try {',
    '  Add-Type -AssemblyName System.Security',
    '  $cifrato = [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($gettone), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser))',
    '  $adesso = (Get-Date).ToUniversalTime()',
    `  $scade = $adesso.AddDays(${giorni})`,
    "  $json = @{ versione = 1; dpapi = $cifrato; creatoIl = $adesso.ToString('o'); scadeIl = $scade.ToString('o') } | ConvertTo-Json",
    `  $file = ${q(file)}`,
    '  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $file) | Out-Null',
    "  $tmp = \"$file.$([guid]::NewGuid()).tmp\"",
    '  [IO.File]::WriteAllText($tmp, $json, (New-Object Text.UTF8Encoding $false))',
    '  Move-Item -Force -LiteralPath $tmp -Destination $file',
    '  $gettone = $null',
    "  Write-Host ('Fatto: accesso a Claude valido fino al ' + $scade.ToLocalTime().ToString('dd/MM/yyyy') + '. Le chat ferme ripartono da sole.') -ForegroundColor Green",
    "  Write-Host 'Questa finestra si chiude fra 15 secondi.'",
    '  Start-Sleep -Seconds 15; exit 0',
    '} catch {',
    "  Write-Host ('Non sono riuscito a salvarlo: ' + $_.Exception.Message) -ForegroundColor Red",
    "  Write-Host 'Premi Invio per chiudere.'; [void](Read-Host); exit 1",
    '}'
  ].join('\n')
}

/**
 * Il comando da avviare: `cmd /c start` apre una console nuova e vera. Avviato
 * direttamente (staccato, `stdio: 'ignore'`) PowerShell non ha né tastiera né
 * schermo da leggere: non chiede il gettone e non lo trova (provato il 16/11).
 * Lo script viaggia in base64 (niente apici da sistemare); argomenti
 * verbatim, perché `start` vuole il titolo fra virgolette così com'è.
 */
export function comandoRinnovaAccesso(claude: string, file: string, titolo?: string): { comando: string; args: string[] } {
  const script = scriptRinnovaAccesso(claude, file, titolo)
  const codificato = Buffer.from(script, 'utf16le').toString('base64')
  return { comando: 'cmd.exe', args: ['/d', '/c', 'start', '"SierraDeck"', 'powershell.exe', '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', codificato] }
}

/** Apre la finestra del rinnovo. Non solleva: l'errore torna nel risultato. */
export function avviaRinnovaAccesso(
  claude: string,
  file: string,
  p: { titolo?: string; env?: NodeJS.ProcessEnv; avvia?: typeof spawn } = {}
): { ok: true } | { ok: false; messaggio: string } {
  try {
    const c = comandoRinnovaAccesso(claude, file, p.titolo)
    const figlio = (p.avvia ?? spawn)(c.comando, c.args, { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true, ...(p.env !== undefined ? { env: p.env } : {}) })
    figlio.on('error', (err) => console.error('[accesso-claude] finestra del rinnovo non aperta:', err))
    figlio.unref()
    return { ok: true }
  } catch (err) {
    return { ok: false, messaggio: err instanceof Error ? err.message : String(err) }
  }
}
