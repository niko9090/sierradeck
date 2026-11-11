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
 * Conta anche il resto (m-collegamento): una regola che blocca il programma (nasce
 * premendo «Annulla» alla domanda di Windows) vince su ogni permesso, e «Blocca tutte
 * le connessioni in ingresso» non lo scavalca nessuno.
 *
 * Qui solo la valutazione (pura) e la lettura da PowerShell. Non si apre niente
 * da soli: creare la regola vuole l'amministratore, e la regola proposta lascia
 * entrare soltanto la rete locale (`LocalSubnet`), mai internet.
 */

/**
 * Il nome fisso della regola: lo stesso che crea l'installatore (`build/installer.nsh`)
 * e che propone il comando di ripiego. Una regola con questo nome è «a posto».
 */
export const NOME_REGOLA_FIREWALL = 'SierraDeck (rete locale)'

export type ProfiloRete = {
  /** Nome della scheda (`Wi-Fi`, `Ethernet`, `Tailscale`...). */
  scheda: string
  /** `Public`, `Private` o `DomainAuthenticated`. */
  categoria: string
}

export type RegolaIngresso = {
  /** Nome visibile della regola in Windows. */
  nome?: string
  /** Maschera dei profili di Windows: 0 o 0x7FFFFFFF = tutti, 1 = dominio, 2 = privato, 4 = pubblico. */
  profili: number
  /** Percorso del programma a cui si applica, se la regola è per programma. */
  programma?: string
  /** Porte locali della regola (`Any`, `*` o un elenco), se la regola è per porta. */
  porte?: string
  /** Da chi accetta (`*`, `LocalSubnet`, indirizzi): assente = da tutti. */
  remoti?: string
  /** 0 = blocca, 1 = lascia passare (come nel firewall di Windows). Assente = lascia passare. */
  azione?: number
}

/** Le impostazioni di un profilo (1 dominio, 2 privato, 4 pubblico) che contano più delle regole. */
export type StatoProfilo = {
  profilo: number
  /** Il firewall su quel profilo è acceso. */
  acceso: boolean
  /** «Blocca tutte le connessioni in ingresso»: nessuna regola la scavalca. */
  bloccaTutto: boolean
  /** Cosa fa con chi non ha una regola: 0 blocca (il normale), 1 lascia passare. */
  predefinita: number
}

/** Perché è bloccato: manca la regola, una regola lo blocca, o il profilo blocca tutto. */
export type MotivoBlocco = 'senza-regola' | 'regola-di-blocco' | 'blocca-tutto'

export type EsitoFirewall =
  | { stato: 'ok' }
  | { stato: 'sconosciuto' }
  | { stato: 'bloccato'; scheda: string; categoria: string; messaggio: string; comando: string; motivo?: MotivoBlocco; regola?: string }

const MASCHERA: Record<string, number> = { DomainAuthenticated: 1, Private: 2, Public: 4 }
const NOME_PROFILO: Record<number, string> = { 1: 'Domain', 2: 'Private', 4: 'Public' }

function eVpn(scheda: string): boolean {
  return /tailscale|zerotier|wireguard|vpn|tap-|tunnel/i.test(scheda)
}

/** La porta sta nell'elenco della regola? Vuoto, `*` o `Any` vuol dire tutte. */
function portaNellElenco(porte: string | undefined, porta: number): boolean {
  const lista = (porte ?? '').split(',').map((p) => p.trim()).filter((p) => p !== '')
  if (lista.length === 0 || lista.some((p) => p === '*' || p.toLowerCase() === 'any')) return true
  return lista.some((p) => {
    if (p === String(porta)) return true
    const m = /^(\d+)-(\d+)$/.exec(p)
    return m !== null && porta >= Number(m[1]) && porta <= Number(m[2])
  })
}

/** Una regola con indirizzi precisi non riguarda il telefono, che quegli indirizzi di solito non ha. */
function perTuttiOLaReteLocale(remoti: string | undefined): boolean {
  const r = (remoti ?? '').trim()
  return r === '' || r === '*' || /localsubnet/i.test(r)
}

function regolaCopre(r: RegolaIngresso, programma: string, porta: number): boolean {
  if (r.nome === NOME_REGOLA_FIREWALL && r.azione !== 0) return true
  if (!perTuttiOLaReteLocale(r.remoti)) return false
  const senzaProgramma = r.programma === undefined || r.programma === '' || r.programma.toLowerCase() === 'any'
  if (!senzaProgramma) return (r.programma as string).toLowerCase() === programma.toLowerCase() && portaNellElenco(r.porte, porta)
  // Una regola per porta vale se non è legata a un altro programma, e solo se le porte le dice.
  return (r.porte ?? '').trim() !== '' && portaNellElenco(r.porte, porta)
}

/** Il comando (da PowerShell come amministratore) che lascia entrare la sola rete locale. */
export function comandoSblocco(programma: string): string {
  return `New-NetFirewallRule -DisplayName "${NOME_REGOLA_FIREWALL}" -Direction Inbound -Action Allow -Program "${programma}" -Profile Any -RemoteAddress LocalSubnet`
}

/** Il comando che toglie «Blocca tutte le connessioni in ingresso» da un profilo (solo da mostrare: non lo esegue nessuno da solo). */
export function comandoBloccaTutto(categoria: string): string {
  return `Set-NetFirewallProfile -Profile ${NOME_PROFILO[MASCHERA[categoria] ?? 4] ?? 'Public'} -AllowInboundRules True`
}

/**
 * Dice se la rete di casa del PC può raggiungere la porta. Si guardano le schede
 * di rete vere (non le VPN), profilo per profilo, nell'ordine di Windows: firewall
 * spento → passa; «blocca tutto» → no; una regola di blocco → no (vince su ogni
 * permesso); una regola che lascia passare → sì; altrimenti l'azione predefinita.
 * Senza gli `stati` (letture di prima) si guardano solo le regole.
 */
export function valutaFirewall(profili: ProfiloRete[], regole: RegolaIngresso[], programma: string, porta: number, stati: StatoProfilo[] = []): EsitoFirewall {
  const vere = profili.filter((p) => !eVpn(p.scheda) && MASCHERA[p.categoria] !== undefined)
  if (vere.length === 0) return { stato: 'sconosciuto' }
  const permessi = regole.filter((r) => r.azione !== 0 && regolaCopre(r, programma, porta))
  const blocchi = regole.filter((r) => r.azione === 0 && regolaCopre(r, programma, porta))
  const sulProfilo = (r: RegolaIngresso, m: number): boolean => r.profili === 0 || (r.profili & m) !== 0
  for (const p of vere) {
    const m = MASCHERA[p.categoria] as number
    const st = stati.find((s) => s.profilo === m)
    if (st !== undefined && !st.acceso) continue
    if (st?.bloccaTutto === true) return bloccato(p, programma, 'blocca-tutto')
    const blocco = blocchi.find((r) => sulProfilo(r, m))
    if (blocco !== undefined) return bloccato(p, programma, 'regola-di-blocco', blocco.nome)
    if (permessi.some((r) => sulProfilo(r, m))) continue
    if (st?.predefinita === 1) continue
    return bloccato(p, programma, 'senza-regola')
  }
  return { stato: 'ok' }
}

function bloccato(p: ProfiloRete, programma: string, motivo: MotivoBlocco, regola?: string): EsitoFirewall {
  const nomeRete = p.categoria === 'Public' ? 'Pubblica' : p.categoria === 'Private' ? 'Privata' : 'di dominio'
  const base = { stato: 'bloccato' as const, scheda: p.scheda, categoria: p.categoria, motivo, ...(regola !== undefined && regola !== '' ? { regola } : {}) }
  if (motivo === 'blocca-tutto') {
    return {
      ...base,
      messaggio:
        `Windows blocca tutte le connessioni in ingresso sulla rete «${p.scheda}» (profilo ${nomeRete}: «Blocca tutte le connessioni in ingresso» in Sicurezza di Windows → Firewall). ` +
        `Nessuna regola lo scavalca: il telefono sul wifi di casa, senza Tailscale, non si collega. Rimedio: togli quella spunta, oppure lancia il comando qui sotto da PowerShell come amministratore.`,
      comando: comandoBloccaTutto(p.categoria)
    }
  }
  if (motivo === 'regola-di-blocco') {
    return {
      ...base,
      messaggio:
        `Una regola del firewall di Windows${regola !== undefined && regola !== '' ? ` («${regola}»)` : ''} blocca SierraDeck sulla rete «${p.scheda}» (profilo ${nomeRete}) e vince su ogni permesso: ` +
        `il telefono sul wifi di casa, senza Tailscale, non si collega. Di solito nasce premendo «Annulla» alla domanda di Windows. Rimedio: «Sistema» (chiede il permesso di amministratore) la spegne e lascia entrare solo la rete locale; oppure lancia il comando qui sotto da PowerShell come amministratore.`,
      comando: comandoElevato(programma)
    }
  }
  return {
    ...base,
    messaggio:
      `Il firewall di Windows non lascia entrare SierraDeck dalla rete «${p.scheda}» (profilo ${nomeRete}): ` +
      `il telefono sul wifi di casa, senza Tailscale, non si collega. L'installatore crea la regola da solo quando gira come amministratore; qui no. Rimedio: apri PowerShell come amministratore e lancia il comando qui sotto ` +
      `(lascia entrare solo la rete locale), oppure imposta la rete di casa su «Privata» in Impostazioni di Windows → Rete.`,
    comando: comandoSblocco(programma)
  }
}

/**
 * La lettura (m-collegamento): dall'oggetto del firewall di Windows (COM), una sola
 * passata sulle regole. Prima si chiedevano a PowerShell i filtri regola per regola:
 * misurato 114 s su un PC vero contro 20 s di limite, cioè sempre «sconosciuto».
 * Così ~1-3 s. Il programma arriva da una variabile d'ambiente, non dentro il testo.
 * Solo regole in ingresso accese, TCP o tutti i protocolli, non legate a un servizio
 * o a un'app dello Store; di quelle si tengono la nostra per nome, quelle del nostro
 * programma e quelle per porta senza programma. Anche le regole di blocco.
 */
const SCRIPT = [
  "$ErrorActionPreference='Stop'",
  '$prog=([Environment]::ExpandEnvironmentVariables([string]$env:SD_PROGRAMMA)).ToLowerInvariant()',
  '$fw=New-Object -ComObject HNetCfg.FwPolicy2',
  '$p=@(Get-NetConnectionProfile | ForEach-Object { @{scheda=[string]$_.InterfaceAlias;categoria=[string]$_.NetworkCategory} })',
  '$s=@(1,2,4 | ForEach-Object { @{profilo=$_;acceso=[bool]$fw.FirewallEnabled($_);bloccaTutto=[bool]$fw.BlockAllInboundTraffic($_);predefinita=[int]$fw.DefaultInboundAction($_)} })',
  '$r=New-Object System.Collections.ArrayList',
  'foreach ($x in $fw.Rules) {',
  ' if ($x.Direction -ne 1 -or -not $x.Enabled) { continue }',
  ' $pr=[int]$x.Protocol',
  ' if ($pr -ne 6 -and $pr -ne 256) { continue }',
  ' if ([string]$x.ServiceName -or [string]$x.LocalAppPackageId) { continue }',
  ' $a=[string]$x.ApplicationName',
  " $ae=if ($a) { ([Environment]::ExpandEnvironmentVariables($a)).ToLowerInvariant() } else { '' }",
  ' $q=[string]$x.LocalPorts',
  ' $n=[string]$x.Name',
  ` if ($n -eq '${NOME_REGOLA_FIREWALL}' -or ($ae -ne '' -and $ae -eq $prog) -or ($ae -eq '' -and $q -ne '')) {`,
  '  [void]$r.Add(@{nome=$n;profili=[int]$x.Profiles;programma=$ae;porte=$q;remoti=[string]$x.RemoteAddresses;azione=[int]$x.Action})',
  ' }',
  '}',
  '@{profili=$p;stato=$s;regole=$r} | ConvertTo-Json -Depth 4 -Compress'
].join('\n')

/** Gli argomenti di powershell.exe per la lettura (il testo codificato: niente virgolette da sistemare). */
export function argomentiLettura(): string[] {
  return ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')]
}

/** Legge profili, stati e regole da PowerShell, senza bloccare niente. Fuori da Windows o in errore: `sconosciuto`. */
export function leggiFirewall(programma: string, porta: number, timeoutMs = 20_000): Promise<EsitoFirewall> {
  if (process.platform !== 'win32') return Promise.resolve({ stato: 'sconosciuto' })
  return new Promise((risolvi) => {
    execFile(
      'powershell.exe',
      argomentiLettura(),
      { encoding: 'utf8', windowsHide: true, timeout: timeoutMs, env: { ...process.env, SD_PROGRAMMA: programma } },
      (err, stdout) => {
        if (err !== null) return risolvi({ stato: 'sconosciuto' })
        risolvi(daUscita(stdout, programma, porta))
      }
    )
  })
}

/**
 * Il comando che si esegue con l'elevazione: spegne (non cancella) le regole che
 * bloccano in ingresso proprio questo programma, toglie l'omonima (niente doppioni)
 * e crea la regola che lascia entrare la sola rete locale.
 */
export function comandoElevato(programma: string): string {
  const prog = programma.toLowerCase().replace(/'/g, "''")
  const spegniBlocchi =
    `$fw=New-Object -ComObject HNetCfg.FwPolicy2; foreach ($x in @($fw.Rules)) { if ($x.Direction -eq 1 -and $x.Action -eq 0 -and $x.Enabled -and [string]$x.ApplicationName -and ` +
    `([Environment]::ExpandEnvironmentVariables([string]$x.ApplicationName)).ToLowerInvariant() -eq '${prog}') { $x.Enabled = $false } }`
  return `${spegniBlocchi}; Remove-NetFirewallRule -DisplayName '${NOME_REGOLA_FIREWALL}' -ErrorAction SilentlyContinue; ${comandoSblocco(programma)}`
}

/** Gli argomenti di powershell.exe che chiedono il permesso (UAC) e lanciano la regola, senza finestra. */
export function argomentiElevazione(programma: string): string[] {
  const interno = Buffer.from(comandoElevato(programma), 'utf16le').toString('base64')
  const esterno =
    "$ErrorActionPreference='Stop';" +
    `Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${interno}'`
  return ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', esterno]
}

export type EsecutoreElevato = (argomenti: string[]) => Promise<boolean>

const esecutoreVero: EsecutoreElevato = (argomenti) =>
  new Promise((risolvi) => {
    if (process.platform !== 'win32') return risolvi(false)
    execFile('powershell.exe', argomenti, { windowsHide: true, timeout: 120_000 }, (err) => risolvi(err === null))
  })

/**
 * Crea la regola con l'elevazione. Va chiamata SOLO da un clic dell'utente: mai
 * da sola. Se il permesso è negato non dà errore: ricontrolla e restituisce
 * l'esito, che resta «bloccato» se non è cambiato niente.
 */
export async function sbloccaConElevazione(
  programma: string,
  porta: number,
  esegui: EsecutoreElevato = esecutoreVero,
  rileggi: (programma: string, porta: number) => Promise<EsitoFirewall> = leggiFirewall
): Promise<EsitoFirewall> {
  await esegui(argomentiElevazione(programma)).catch(() => false)
  return rileggi(programma, porta)
}

/** Dal JSON di PowerShell all'esito (separata per provarla senza Windows). */
export function daUscita(stdout: string, programma: string, porta: number): EsitoFirewall {
  try {
    const j = JSON.parse(stdout) as { profili?: unknown; regole?: unknown; stato?: unknown }
    const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : v === undefined || v === null ? [] : [v as T])
    const profili = lista<{ scheda?: string; categoria?: string }>(j.profili).map((p) => ({ scheda: String(p.scheda ?? ''), categoria: String(p.categoria ?? '') }))
    const regole = lista<{ nome?: string; profili?: number; programma?: string; porte?: string; remoti?: string; azione?: number }>(j.regole).map((r): RegolaIngresso => ({
      nome: r.nome,
      profili: Number(r.profili ?? 0),
      programma: r.programma,
      porte: r.porte,
      ...(typeof r.remoti === 'string' ? { remoti: r.remoti } : {}),
      ...(typeof r.azione === 'number' ? { azione: r.azione } : {})
    }))
    const stati = lista<{ profilo?: number; acceso?: boolean; bloccaTutto?: boolean; predefinita?: number }>(j.stato)
      .filter((s) => typeof s.profilo === 'number')
      .map((s): StatoProfilo => ({ profilo: s.profilo as number, acceso: s.acceso !== false, bloccaTutto: s.bloccaTutto === true, predefinita: Number(s.predefinita ?? 0) }))
    return valutaFirewall(profili, regole, programma, porta, stati)
  } catch {
    return { stato: 'sconosciuto' }
  }
}
