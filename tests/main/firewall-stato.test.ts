import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { creaControlloFirewall, FIREWALL_VALE_MS } from '../../src/main/firewall-stato'
import type { EsitoFirewall } from '../../src/main/firewall-windows'
import { componiSalute, voceFirewall, type IngressiSalute } from '@shared/salute'

/** L'esito del firewall tenuto da parte: nessuno aspetta la lettura, una sola alla volta, anche in `/api/salute`. */

const BLOCCATO: EsitoFirewall = { stato: 'bloccato', scheda: 'Wi-Fi', categoria: 'Public', messaggio: 'Il firewall non lascia entrare.', comando: 'New-NetFirewallRule …', motivo: 'senza-regola' }

function lettore(esiti: EsitoFirewall[]): { leggi: () => Promise<EsitoFirewall>; volte: () => number; finisci: () => void } {
  let volte = 0
  let finisci: () => void = () => undefined
  return {
    leggi: () => {
      volte += 1
      const e = esiti[Math.min(volte, esiti.length) - 1] as EsitoFirewall
      return new Promise((ok) => { finisci = () => ok(e) })
    },
    volte: () => volte,
    finisci: () => finisci()
  }
}

describe('il controllo del firewall', () => {
  it('subito non aspetta: la prima volta non sa, poi dà l’ultimo esito', async () => {
    const l = lettore([BLOCCATO])
    const c = creaControlloFirewall(l.leggi)
    expect(c.subito()).toBeUndefined()
    expect(c.subito()).toBeUndefined()
    expect(l.volte()).toBe(1)
    l.finisci()
    await c.controlla()
    expect(c.subito()?.stato).toBe('bloccato')
    expect(l.volte()).toBe(1)
  })

  it('vecchio dopo 2 minuti: dà quello che ha e rilegge in sottofondo', async () => {
    let t = 0
    const l = lettore([BLOCCATO, { stato: 'ok' }])
    const c = creaControlloFirewall(l.leggi, { adesso: () => t })
    const primo = c.controlla(); l.finisci(); await primo
    t = FIREWALL_VALE_MS + 1
    expect(c.subito()?.stato).toBe('bloccato')
    expect(l.volte()).toBe(2)
    l.finisci()
    await c.controlla()
    expect(c.subito()?.stato).toBe('ok')
  })

  it('una lettura che fallisce è «sconosciuto», non un errore', async () => {
    const c = creaControlloFirewall(() => Promise.reject(new Error('powershell assente')))
    expect((await c.controlla()).stato).toBe('sconosciuto')
  })

  it('l’esito del tasto «Sistema» vince su una lettura partita prima', async () => {
    const l = lettore([BLOCCATO])
    const c = creaControlloFirewall(l.leggi)
    const inVolo = c.controlla()
    c.imposta({ stato: 'ok' })
    l.finisci()
    expect((await inVolo).stato).toBe('ok')
    expect(c.subito()?.stato).toBe('ok')
  })

  it('in index.ts la sezione Client non aspetta più la lettura', () => {
    const src = readFileSync('src/main/index.ts', 'utf8')
    const i = src.indexOf("ipcMain.handle('client:stato'")
    const corpo = src.slice(i, src.indexOf('ipcMain.handle(', i + 10))
    expect(corpo).toContain('controlloFirewall.subito()')
    expect(corpo).not.toMatch(/await[^\n]*irewall/)
  })
})

describe('nella Salute', () => {
  const base: IngressiSalute = {
    adesso: Date.parse('2026-10-02T15:00:00.000Z'), versione: '1.0.0', oreErrori: 6,
    drive: { configurato: true, connesso: true }, pc: [], errori: [], consegne: [],
    io: { id: 'pc-prova', nome: 'Ufficio' }
  }

  it('bloccato: una voce da sistemare col nome del PC e il rimedio', () => {
    const s = componiSalute({ ...base, firewall: { messaggio: BLOCCATO.stato === 'bloccato' ? BLOCCATO.messaggio : '', comando: 'New-NetFirewallRule …' } })
    const v = s.voci.find((x) => x.chiave === 'firewall')
    expect(v?.tono).toBe('guasto')
    expect(v?.gruppo).toBe('pc')
    expect(v?.titolo).toContain('Ufficio')
    expect(v?.cosaFare).toContain('«Sistema»')
    expect(v?.cosaFare).toContain('New-NetFirewallRule')
    expect(s.tono).toBe('guasto')
  })

  it('«blocca tutto»: il rimedio è togliere la spunta, non «Sistema»', () => {
    expect(voceFirewall({ messaggio: 'm', comando: 'Set-NetFirewallProfile …', motivo: 'blocca-tutto' }, 'Ufficio').cosaFare).toContain('Blocca tutte le connessioni in ingresso')
  })

  it('senza blocco nessuna voce', () => {
    expect(componiSalute(base).voci.some((x) => x.chiave === 'firewall')).toBe(false)
  })
})
