import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { NOME_REGOLA_FIREWALL, argomentiElevazione, argomentiLettura, comandoElevato, sbloccaConElevazione, comandoSblocco, daUscita, valutaFirewall } from '../../src/main/firewall-windows'
import { indirizziPerApp } from '../../src/main/rete-telefono'
import { indirizziDaAnnunciare } from '../../src/main/client-server'

// Percorsi e indirizzi di esempio, mai quelli di una macchina vera.
const EXE = 'C:\\Programmi\\App\\SierraDeck.exe'
const PORTA = 47640

describe('firewall di Windows davanti alla porta', () => {
  it('rete Pubblica senza regola in ingresso: bloccato, con il rimedio e senza aprire a internet', () => {
    const r = valutaFirewall([{ scheda: 'Wi-Fi', categoria: 'Public' }], [{ profili: 2, programma: EXE }], EXE, PORTA)
    expect(r.stato).toBe('bloccato')
    if (r.stato !== 'bloccato') return
    expect(r.scheda).toBe('Wi-Fi')
    expect(r.messaggio).toContain('Pubblica')
    expect(r.comando).toContain('-RemoteAddress LocalSubnet')
    expect(r.comando).toContain(EXE)
    expect(comandoSblocco(EXE)).toBe(r.comando)
  })

  it('una regola per il programma sul profilo Pubblico lascia passare', () => {
    expect(valutaFirewall([{ scheda: 'Wi-Fi', categoria: 'Public' }], [{ profili: 4, programma: EXE }], EXE, PORTA).stato).toBe('ok')
    expect(valutaFirewall([{ scheda: 'Wi-Fi', categoria: 'Public' }], [{ profili: 0, programma: EXE.toLowerCase() }], EXE, PORTA).stato).toBe('ok')
  })

  it('la regola per porta, anche in gamma, vale se non e di un altro programma', () => {
    const wifi = [{ scheda: 'Wi-Fi', categoria: 'Private' }]
    expect(valutaFirewall(wifi, [{ profili: 2, programma: 'Any', porte: String(PORTA) }], EXE, PORTA).stato).toBe('ok')
    expect(valutaFirewall(wifi, [{ profili: 2, programma: 'Any', porte: '47000-48000' }], EXE, PORTA).stato).toBe('ok')
    expect(valutaFirewall(wifi, [{ profili: 2, programma: 'C:\\altro.exe', porte: String(PORTA) }], EXE, PORTA).stato).toBe('bloccato')
  })

  it('le schede VPN non contano: Tailscale non nasconde una rete di casa bloccata', () => {
    const r = valutaFirewall(
      [{ scheda: 'Tailscale', categoria: 'Private' }, { scheda: 'Ethernet', categoria: 'Public' }],
      [{ profili: 2, programma: EXE }], EXE, PORTA
    )
    expect(r.stato).toBe('bloccato')
    if (r.stato === 'bloccato') expect(r.scheda).toBe('Ethernet')
  })

  it('senza reti vere non si sa: nessun falso allarme', () => {
    expect(valutaFirewall([], [], EXE, PORTA).stato).toBe('sconosciuto')
    expect(valutaFirewall([{ scheda: 'Tailscale', categoria: 'Private' }], [], EXE, PORTA).stato).toBe('sconosciuto')
  })

  it('legge il JSON di PowerShell, anche con un solo elemento, e non cade su testo rotto', () => {
    const j = JSON.stringify({ profili: { scheda: 'Wi-Fi', categoria: 'Public' }, regole: [{ profili: 2, programma: EXE, porte: 'Any' }] })
    expect(daUscita(j, EXE, PORTA).stato).toBe('bloccato')
    expect(daUscita('non e json', EXE, PORTA).stato).toBe('sconosciuto')
  })
})

describe('lettura veloce, regole di blocco e stato dei profili (m-collegamento)', () => {
  const pubblica = [{ scheda: 'Wi-Fi', categoria: 'Public' }]
  const tuttiProfili = 0x7fffffff
  const acceso = (profilo: number, extra: Partial<{ bloccaTutto: boolean; predefinita: number; acceso: boolean }> = {}) => ({ profilo, acceso: true, bloccaTutto: false, predefinita: 0, ...extra })
  const stati = [acceso(1), acceso(2), acceso(4)]

  it('una regola che blocca il programma vince sul permesso, e il rimedio la spegne', () => {
    const regole = [{ profili: tuttiProfili, programma: EXE.toLowerCase(), porte: '*', remoti: '*', azione: 1 }, { nome: 'sierradeck.exe', profili: 4, programma: EXE.toLowerCase(), porte: '*', remoti: '*', azione: 0 }]
    const r = valutaFirewall(pubblica, regole, EXE, PORTA, stati)
    expect(r.stato).toBe('bloccato')
    if (r.stato !== 'bloccato') return
    expect(r.motivo).toBe('regola-di-blocco')
    expect(r.regola).toBe('sierradeck.exe')
    expect(r.messaggio).toContain('«sierradeck.exe»')
    expect(r.comando).toBe(comandoElevato(EXE))
    // Sul profilo Privato quella regola non c'è: passa.
    expect(valutaFirewall([{ scheda: 'Wi-Fi', categoria: 'Private' }], regole, EXE, PORTA, stati).stato).toBe('ok')
  })

  it('il blocco per un altro programma o per altri indirizzi non conta', () => {
    const permesso = { profili: 4, programma: EXE, azione: 1 }
    expect(valutaFirewall(pubblica, [permesso, { profili: 4, programma: 'C:\\altro.exe', azione: 0 }], EXE, PORTA, stati).stato).toBe('ok')
    expect(valutaFirewall(pubblica, [permesso, { profili: 4, programma: EXE, remoti: '10.9.8.7/255.255.255.255', azione: 0 }], EXE, PORTA, stati).stato).toBe('ok')
  })

  it('«blocca tutto» non lo scavalca nessuno; il comando proposto non si esegue da solo', () => {
    const r = valutaFirewall(pubblica, [{ nome: NOME_REGOLA_FIREWALL, profili: 0, azione: 1 }], EXE, PORTA, [acceso(4, { bloccaTutto: true })])
    expect(r.stato).toBe('bloccato')
    if (r.stato !== 'bloccato') return
    expect(r.motivo).toBe('blocca-tutto')
    expect(r.comando).toBe('Set-NetFirewallProfile -Profile Public -AllowInboundRules True')
  })

  it('firewall spento o azione predefinita «lascia passare»: passa anche senza regola', () => {
    expect(valutaFirewall(pubblica, [], EXE, PORTA, [acceso(4, { acceso: false })]).stato).toBe('ok')
    expect(valutaFirewall(pubblica, [], EXE, PORTA, [acceso(4, { predefinita: 1 })]).stato).toBe('ok')
    expect(valutaFirewall(pubblica, [], EXE, PORTA, stati).stato).toBe('bloccato')
  })

  it('la regola del programma vale solo per le sue porte; quella per porta con «*» vale per tutte', () => {
    expect(valutaFirewall(pubblica, [{ profili: 4, programma: EXE, porte: '8080', azione: 1 }], EXE, PORTA, stati).stato).toBe('bloccato')
    expect(valutaFirewall(pubblica, [{ profili: 4, programma: '', porte: '*', remoti: 'LocalSubnet', azione: 1 }], EXE, PORTA, stati).stato).toBe('ok')
    expect(valutaFirewall(pubblica, [{ profili: 4, programma: '', porte: '', azione: 1 }], EXE, PORTA, stati).stato).toBe('bloccato')
  })

  it('legge il JSON nuovo (stato dei profili, azione, indirizzi) e quello di prima', () => {
    const j = JSON.stringify({
      profili: pubblica,
      stato: [acceso(1), acceso(2), acceso(4)],
      regole: [{ nome: 'x', profili: tuttiProfili, programma: EXE.toLowerCase(), porte: '*', remoti: '*', azione: 1 }, { nome: 'blocco', profili: 4, programma: EXE.toLowerCase(), porte: '*', remoti: '*', azione: 0 }]
    })
    const r = daUscita(j, EXE, PORTA)
    expect(r.stato === 'bloccato' && r.motivo).toBe('regola-di-blocco')
    // Senza «azione» una regola lascia passare, come nelle letture di prima.
    expect(daUscita(JSON.stringify({ profili: pubblica, regole: [{ profili: 4, programma: EXE }] }), EXE, PORTA).stato).toBe('ok')
  })

  it('il testo per PowerShell va codificato, porta il nome fisso e prende il programma dall ambiente', () => {
    const args = argomentiLettura()
    expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand'])
    const testo = Buffer.from(args[3] ?? '', 'base64').toString('utf16le')
    expect(testo).toContain('HNetCfg.FwPolicy2')
    expect(testo).toContain(`'${NOME_REGOLA_FIREWALL}'`)
    expect(testo).toContain('$env:SD_PROGRAMMA')
    expect(testo).toContain('BlockAllInboundTraffic')
    // Solo lettura: niente che cambi una regola.
    expect(testo).not.toMatch(/Enabled\s*=|New-NetFirewallRule|Remove-NetFirewallRule|Set-NetFirewall|Disable-NetFirewall/)
  })

  it('il comando elevato spegne soltanto i blocchi in ingresso di questo programma, poi crea la regola', () => {
    const c = comandoElevato("C:\\Programmi\\L'App\\SierraDeck.exe")
    expect(c).toContain("-eq 'c:\\programmi\\l''app\\sierradeck.exe'")
    expect(c).toContain('$x.Direction -eq 1 -and $x.Action -eq 0')
    expect(c).toContain('$x.Enabled = $false')
    expect(c).not.toMatch(/\.Delete|Remove-NetFirewallRule -Program|Rules\.Remove/)
    expect(c.indexOf('$x.Enabled = $false')).toBeLessThan(c.indexOf('New-NetFirewallRule'))
  })
})

describe('regola del firewall creata dall installatore', () => {
  const nsh = readFileSync('build/installer.nsh', 'utf8')
  const yml = readFileSync('electron-builder.yml', 'utf8')
  const netsh = nsh.split('\n').filter((r) => r.includes('netsh advfirewall'))

  it('la configurazione include il file con le macro', () => {
    expect(yml).toMatch(/include:\s*build\/installer\.nsh/)
    expect(nsh).toContain('!macro customInstall')
    expect(nsh).toContain('!macro customUnInstall')
  })

  it('crea la regola in ingresso col nome fisso, per il programma, solo LocalSubnet', () => {
    const aggiunte = netsh.filter((r) => r.includes('add rule'))
    expect(aggiunte).toHaveLength(1)
    expect(aggiunte[0]).toContain(`name="${NOME_REGOLA_FIREWALL}"`)
    expect(aggiunte[0]).toContain('dir=in')
    expect(aggiunte[0]).toContain('remoteip=LocalSubnet')
    expect(aggiunte[0]).toContain('${APP_EXECUTABLE_FILENAME}')
  })

  it('niente apertura a internet', () => {
    for (const r of netsh) if (r.includes('remoteip')) expect(r).toMatch(/remoteip=LocalSubnet(\s|')/)
    expect(nsh).not.toMatch(/remoteip=(any|\*|0\.0\.0\.0)/i)
  })

  it('prima di aggiungere toglie la regola omonima e alla disinstallazione la toglie', () => {
    const iUn = nsh.indexOf('!macro customUnInstall')
    const install = nsh.slice(nsh.indexOf('!macro customInstall'), iUn)
    expect(install.indexOf('delete rule')).toBeGreaterThan(-1)
    expect(install.indexOf('delete rule')).toBeLessThan(install.indexOf('add rule'))
    expect(nsh.slice(iUn)).toContain(`delete rule name="${NOME_REGOLA_FIREWALL}"`)
  })

  it('il comando di ripiego usa lo stesso nome e la stessa limitazione', () => {
    expect(comandoSblocco(EXE)).toContain(`"${NOME_REGOLA_FIREWALL}"`)
    expect(comandoSblocco(EXE)).toContain('-RemoteAddress LocalSubnet')
  })

  it('una regola col nome dell installatore vale come a posto, anche se il percorso non combacia', () => {
    const wifi = [{ scheda: 'Wi-Fi', categoria: 'Public' }]
    const r = { nome: NOME_REGOLA_FIREWALL, profili: 0, programma: 'D:\\Altro\\SierraDeck.exe' }
    expect(valutaFirewall(wifi, [r], EXE, PORTA).stato).toBe('ok')
    expect(valutaFirewall(wifi, [{ ...r, profili: 2 }], EXE, PORTA).stato).toBe('bloccato')
    const j = JSON.stringify({ profili: wifi, regole: [{ nome: NOME_REGOLA_FIREWALL, profili: 0, programma: 'Any', porte: 'Any' }] })
    expect(daUscita(j, EXE, PORTA).stato).toBe('ok')
  })
})

describe('ripiego con elevazione, solo dal clic', () => {
  const decodifica = (args: string[]): string => {
    const m = /'-EncodedCommand','([^']+)'/.exec(args[args.length - 1] ?? '')
    return Buffer.from(m?.[1] ?? '', 'base64').toString('utf16le')
  }

  it('il comando e costruito con nome fisso, programma e LocalSubnet, mai Any', () => {
    const args = argomentiElevazione(EXE)
    expect(args[args.length - 1]).toContain('-Verb RunAs')
    expect(args[args.length - 1]).toContain('-WindowStyle Hidden')
    const interno = decodifica(args)
    expect(interno).toContain(`-DisplayName "${NOME_REGOLA_FIREWALL}"`)
    expect(interno).toContain(`-Program "${EXE}"`)
    expect(interno).toContain('-RemoteAddress LocalSubnet')
    expect(interno).toContain('Remove-NetFirewallRule')
    expect(interno).not.toMatch(/RemoteAddress\s+(Any|\*|Internet)/i)
    expect(interno).toBe(comandoElevato(EXE))
  })

  it('non si eleva niente al solo controllo o alla valutazione', () => {
    let chiamate = 0
    const esegui = async (): Promise<boolean> => { chiamate++; return true }
    valutaFirewall([{ scheda: 'Wi-Fi', categoria: 'Public' }], [], EXE, PORTA)
    daUscita('{}', EXE, PORTA)
    expect(chiamate).toBe(0)
    void esegui
  })

  it('con il clic esegue una sola volta e poi ricontrolla', async () => {
    let chiamate = 0
    let riletture = 0
    const esito = await sbloccaConElevazione(EXE, PORTA, async () => { chiamate++; return true }, async () => { riletture++; return { stato: 'ok' } })
    expect(chiamate).toBe(1)
    expect(riletture).toBe(1)
    expect(esito.stato).toBe('ok')
  })

  it('permesso rifiutato: nessun errore, la riga resta com era', async () => {
    const bloccato = { stato: 'bloccato' as const, scheda: 'Wi-Fi', categoria: 'Public', messaggio: 'm', comando: 'c' }
    expect((await sbloccaConElevazione(EXE, PORTA, async () => false, async () => bloccato)).stato).toBe('bloccato')
    expect((await sbloccaConElevazione(EXE, PORTA, async () => { throw new Error('annullato') }, async () => bloccato)).stato).toBe('bloccato')
  })

  it('l elevazione parte solo dal tasto: in index.ts e solo nel gestore del clic', () => {
    const src = readFileSync('src/main/index.ts', 'utf8')
    const usi = src.split('\n').filter((r) => r.includes('sbloccaConElevazione('))
    expect(usi).toHaveLength(1)
    const i = src.indexOf("ipcMain.handle('client:sistemaFirewall'")
    expect(i).toBeGreaterThan(-1)
    expect(src.slice(i, i + 300)).toContain('sbloccaConElevazione(')
  })
})

describe('solo rete di casa, niente Tailscale', () => {
  const scheda = (address: string, mac = 'aa:bb:cc:00:00:01') => ({ address, family: 'IPv4' as const, internal: false, netmask: '255.255.255.0', mac, cidr: null })

  it('il PC annuncia l indirizzo del wifi e non quello della scheda virtuale', () => {
    const ip = indirizziDaAnnunciare({ 'vEthernet (Default Switch)': [scheda('172.20.0.1', '00:15:5d:00:00:01')], 'Wi-Fi': [scheda('192.168.10.7')] }, '192.168.10.7')
    expect(ip).toEqual(['192.168.10.7'])
    expect(indirizziPerApp(ip, PORTA, 'pc-1').indirizzi).toEqual([`http://192.168.10.7:${PORTA}`])
  })

  it('con Tailscale acceso la rete di casa resta davanti', () => {
    const ip = indirizziDaAnnunciare({ Tailscale: [scheda('100.100.1.2')], Ethernet: [scheda('192.168.10.7')] }, '192.168.10.7')
    expect(indirizziPerApp(ip, PORTA, 'pc-1').indirizzi).toEqual([`http://192.168.10.7:${PORTA}`, `http://100.100.1.2:${PORTA}`])
  })
})
