import { describe, it, expect } from 'vitest'
import { comandoSblocco, daUscita, valutaFirewall } from '../../src/main/firewall-windows'
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
