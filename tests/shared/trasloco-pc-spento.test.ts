import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { copieDopo, ferma, fermoChiaro, nuovoTrasloco, pcFermo, prossimoPasso, vaiAvantiSenza, type Trasloco } from '@shared/trasloco'

/**
 * Lo spostamento fermo per un PC spento (0.71.1). Nicholas (13/10): «ho
 * provato a spostare un progetto ma rimane fermo». Il motivo era tecnico e
 * tagliato; ora si dice in chiaro, con il nome scelto, e si sceglie fra
 * «Aspetta quel PC» e «Vai avanti senza». Niente si perde.
 */
const ORA = '2026-10-13T15:07:15.000Z'
const base = (): Trasloco => nuovoTrasloco({
  id: 'trasloco-spento', progetto: 'p1', nome: 'SierraDeck-prova-spento', verso: { pc: 'pc-qui', nome: 'PC-ESEMPIO' },
  chiesto: { da: 'pc-qui', come: 'residente' }, altrove: [{ pc: 'pc-port', nome: 'PORTATILE-ESEMPIO' }, { pc: 'pc-desk', nome: 'DESK-ESEMPIO' }], adesso: ORA
})
// Il motivo com'era scritto dalla 0.71.0, con il nome tecnico in testa.
const MOTIVO_VECCHIO = 'PORTATILE-ESEMPIO non risponde (Con il collegamento lento via Drive non si può fare questa operazione su PORTATILE-ESEMPIO: si può solo leggere lo schermo e mandare un messaggio. Per il resto serve una strada diretta (rete di casa, Tailscale o WebRTC), oppure lascia un’azione nella cassetta.): senza la sua copia aggiornata non confronto. Riprendo da qui quando torna.'

/** L'esempio che l'app legge in TraslocoTest: fermo per un PC spento, con il motivo in chiaro. */
function esempioSpento(): Trasloco {
  const t = ferma(base(), 'raccolta', MOTIVO_VECCHIO, true, ORA, 'pc-port')
  return { ...t, fermoChiaro: fermoChiaro(t, (pc) => (pc === 'pc-port' ? 'Portatile di casa' : undefined))! }
}

describe('un PC spento ferma lo spostamento: motivo in chiaro e due scelte', () => {
  it('il PC si riconosce anche nei traslochi di prima, dove non era scritto', () => {
    const vecchio = ferma(base(), 'raccolta', MOTIVO_VECCHIO, true, ORA)
    expect(pcFermo(vecchio)?.pc).toBe('pc-port')
    expect(pcFermo(ferma(base(), 'analisi', 'il Drive ha detto 403', false, ORA))).toBeUndefined()
  })

  it('il motivo dice il nome scelto, cosa serve e le due scelte; niente gergo tecnico', () => {
    const c = fermoChiaro(ferma(base(), 'raccolta', MOTIVO_VECCHIO, true, ORA, 'pc-port'), () => 'Portatile di casa')!
    expect(c.pc).toEqual({ pc: 'pc-port', nome: 'Portatile di casa' })
    expect(c.scelte).toBe(true)
    expect(c.testo).toContain('«Portatile di casa» è spento')
    expect(c.testo).toContain('Niente si perde')
    expect(c.testo).not.toMatch(/WebRTC|Tailscale|cassetta|collegamento lento/)
    // Senza nome scelto, quello che il trasloco conosce.
    expect(fermoChiaro(ferma(base(), 'raccolta', MOTIVO_VECCHIO, true, ORA, 'pc-port'))!.testo).toContain('«PORTATILE-ESEMPIO»')
    // Un fermo che non è un PC spento resta com'è, senza scelte.
    expect(fermoChiaro(ferma(base(), 'analisi', 'il Drive ha detto 403', false, ORA))).toEqual({ testo: 'il Drive ha detto 403', scelte: false })
  })

  it('«Vai avanti senza»: il passo fermo riparte, il PC è segnato, le scelte spariscono', () => {
    const t = vaiAvantiSenza(ferma(base(), 'raccolta', MOTIVO_VECCHIO, true, ORA, 'pc-port'), 'pc-port', ORA)
    expect(t.fermo).toBeUndefined()
    expect(prossimoPasso(t)).toBe('raccolta')
    expect(t.passi.raccolta.stato).toBe('da-fare')
    expect(t.altrove.find((a) => a.pc === 'pc-port')?.senza).toBe(ORA)
    expect(t.altrove.find((a) => a.pc === 'pc-desk')?.senza).toBeUndefined()
    // Se si rifermasse per lo stesso PC, non si richiede la scelta.
    expect(fermoChiaro(ferma(t, 'vecchie', 'PORTATILE-ESEMPIO non risponde', true, ORA, 'pc-port'))!.scelte).toBe(false)
  })

  it('le copie da sistemare quando il PC torna', () => {
    const t: Trasloco = { ...base(), finitoIl: ORA, altrove: [{ pc: 'pc-port', nome: 'PORTATILE-ESEMPIO', esito: 'dopo' }, { pc: 'pc-desk', nome: 'DESK-ESEMPIO', esito: 'nel-recupero' }] }
    expect(copieDopo(t).map((a) => a.pc)).toEqual(['pc-port'])
    expect(copieDopo({ ...t, annullatoIl: ORA })).toEqual([])
  })

  it('l’esempio è quello che l’app legge nei suoi test', () => {
    const file = join(__dirname, '..', '..', 'android', 'app', 'src', 'test', 'resources', 'trasloco', 'trasloco-pc-spento-0.71.1.json')
    const atteso = `${JSON.stringify(esempioSpento(), null, 2)}\n`
    if (process.env.AGGIORNA === '1' || !existsSync(file)) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, atteso) }
    expect(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).toBe(atteso)
  })
})
