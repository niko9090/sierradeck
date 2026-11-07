import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { NOME_REGOLA_FIREWALL, argomentiElevazione, comandoElevato, sbloccaConElevazione, comandoSblocco, daUscita, valutaFirewall } from '../../src/main/firewall-windows'
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
