import { execFile } from 'node:child_process'

/**
 * Il firewall di Windows davanti alla porta del Client.
 *
 * Il telefono sul wifi di casa, senza Tailscale, bussa alla porta del PC dalla
 * rete locale. Se la rete del PC è «Pubblica» e Windows non ha una regola che
 * lasci entrare SierraDeck su quel profilo, il pacchetto viene scartato in
 * silenzio: dal telefono è un «non risponde» identico a un PC spento. Con
 * Tailscale funziona lo stesso, perché la sua scheda ha un profilo suo.
 *
 * Qui solo la valutazione (pura) e la lettura da PowerShell. Non si apre niente
 * da soli: creare la regola vuole l'amministratore, e la regola proposta lascia
 * entrare soltanto la rete locale (`LocalSubnet`), mai internet.
 */

export type ProfiloRete = {
  /** Nome della scheda (`Wi-Fi`, `Ethernet`, `Tailscale`...). */
  scheda: string
  /** `Public`, `Private` o `DomainAuthenticated`. */
  categoria: string
}

export type RegolaIngresso = {
  /** Maschera dei profili di Windows: 0 = tutti, 1 = dominio, 2 = privato, 4 = pubblico. */
  profili: number
  /** Percorso del programma a cui si applica, se la regola è per programma. */
  programma?: string
  /** Porte locali della regola (`Any` o un elenco), se la regola è per porta. */
  porte?: string
}

export type EsitoFirewall =
  | { stato: 'ok' }
  | { stato: 'sconosciuto' }
  | { stato: 'bloccato'; scheda: string; categoria: string; messaggio: string; comando: string }

const MASCHERA: Record<string, number> = { DomainAuthenticated: 1, Private: 2, Public: 4 }

function eVpn(scheda: string): boolean {
  return /tailscale|zerotier|wireguard|vpn|tap-|tunnel/i.test(scheda)
}

function regolaCopre(r: RegolaIngresso, programma: string, porta: number): boolean {
  if (r.programma !== undefined && r.programma !== '' && r.programma.toLowerCase() === programma.toLowerCase()) return true
  const porte = (r.porte ?? '').split(',').map((p) => p.trim())
  const nelleGamme = porte.some((p) => {
    const m = /^(\d+)-(\d+)$/.exec(p)
    return m !== null && porta >= Number(m[1]) && porta <= Number(m[2])
  })
  if (porte.includes(String(porta)) || nelleGamme) {
    // Una regola per porta vale se non è legata a un altro programma.
    return r.programma === undefined || r.programma === '' || r.programma.toLowerCase() === 'any'
  }
  return false
}

/** Il comando (da PowerShell come amministratore) che lascia entrare la sola rete locale. */
export function comandoSblocco(programma: string): string {
  return `New-NetFirewallRule -DisplayName "SierraDeck (rete locale)" -Direction Inbound -Action Allow -Program "${programma}" -Profile Private,Public -RemoteAddress LocalSubnet`
}

/**
 * Dice se la rete di casa del PC può raggiungere la porta. Si guardano le schede
 * di rete vere (non le VPN): se una è su un profilo senza regola in ingresso, è
 * lì che il telefono si ferma.
 */
export function valutaFirewall(profili: ProfiloRete[], regole: RegolaIngresso[], programma: string, porta: number): EsitoFirewall {
  const vere = profili.filter((p) => !eVpn(p.scheda) && MASCHERA[p.categoria] !== undefined)
  if (vere.length === 0) return { stato: 'sconosciuto' }
  const coperte = regole.filter((r) => regolaCopre(r, programma, porta))
  const scoperta = vere.find((p) => !coperte.some((r) => r.profili === 0 || (r.profili & (MASCHERA[p.categoria] ?? 0)) !== 0))
  if (scoperta === undefined) return { stato: 'ok' }
  const nomeRete = scoperta.categoria === 'Public' ? 'Pubblica' : scoperta.categoria === 'Private' ? 'Privata' : 'di dominio'
  return {
    stato: 'bloccato',
    scheda: scoperta.scheda,
    categoria: scoperta.categoria,
    messaggio:
      `Il firewall di Windows non lascia entrare SierraDeck dalla rete «${scoperta.scheda}» (profilo ${nomeRete}): ` +
      `il telefono sul wifi di casa, senza Tailscale, non si collega. Rimedio: apri PowerShell come amministratore e lancia il comando qui sotto ` +
      `(lascia entrare solo la rete locale), oppure imposta la rete di casa su «Privata» in Impostazioni di Windows → Rete.`,
    comando: comandoSblocco(programma)
  }
}

const SCRIPT =
  "$ErrorActionPreference='Stop';" +
  "$p=@(Get-NetConnectionProfile | ForEach-Object { @{scheda=[string]$_.InterfaceAlias;categoria=[string]$_.NetworkCategory} });" +
  "$r=@(Get-NetFirewallRule -Direction Inbound -Action Allow -Enabled True | ForEach-Object {" +
  " $a=($_ | Get-NetFirewallApplicationFilter).Program; $q=($_ | Get-NetFirewallPortFilter).LocalPort;" +
  " if (($a -ne 'Any') -or ($q -ne 'Any' -and $q)) { @{profili=[int]$_.Profile;programma=[string]$a;porte=(@($q) -join ',')} } });" +
  "@{profili=$p;regole=$r}|ConvertTo-Json -Depth 4 -Compress"

/** Legge profili e regole da PowerShell, senza bloccare niente. Fuori da Windows o in errore: `sconosciuto`. */
export function leggiFirewall(programma: string, porta: number, timeoutMs = 20_000): Promise<EsitoFirewall> {
  if (process.platform !== 'win32') return Promise.resolve({ stato: 'sconosciuto' })
  return new Promise((risolvi) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', SCRIPT],
      { encoding: 'utf8', windowsHide: true, timeout: timeoutMs },
      (err, stdout) => {
        if (err !== null) return risolvi({ stato: 'sconosciuto' })
        risolvi(daUscita(stdout, programma, porta))
      }
    )
  })
}

/** Dal JSON di PowerShell all'esito (separata per provarla senza Windows). */
export function daUscita(stdout: string, programma: string, porta: number): EsitoFirewall {
  try {
    const j = JSON.parse(stdout) as { profili?: unknown; regole?: unknown }
    const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : v === undefined || v === null ? [] : [v as T])
    const profili = lista<{ scheda?: string; categoria?: string }>(j.profili).map((p) => ({ scheda: String(p.scheda ?? ''), categoria: String(p.categoria ?? '') }))
    const regole = lista<{ profili?: number; programma?: string; porte?: string }>(j.regole).map((r) => ({
      profili: Number(r.profili ?? 0),
      programma: r.programma,
      porte: r.porte
    }))
    return valutaFirewall(profili, regole, programma, porta)
  } catch {
    return { stato: 'sconosciuto' }
  }
}
