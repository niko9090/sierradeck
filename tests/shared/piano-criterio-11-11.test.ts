import { describe, it, expect } from 'vitest'
import { aggiungi, codaVuota, type Coda } from '@shared/coda-richieste'
import { pianoVuoto, scriviPiano } from '@shared/piano-orchestratore'
import { esaminaComando, esaminaCriterio, titoloDiNota } from '@shared/controllo-comandi'

/**
 * 11/11 (k-129): `piano_scrivi` accettava un criterio che il cancello respinge sempre
 * (un comando che legge solo `.sierradeck/`): il compito non poteva diventare verde.
 */

const ADESSO = '2026-11-11T09:00:00.000Z'
const coda = (): Coda => aggiungi(codaVuota('Lavoro'), { testo: 'una cosa', quando: ADESSO }).coda
const scrivi = (titolo: string, criterio: string): string => {
  const e = scriviPiano(pianoVuoto(), coda(), [{ id: 'k-1', richiesta: 'r-1', titolo, criterio }], ADESSO)
  return e.ok ? 'ok' : e.errore
}

describe('il piano non accetta un criterio che il cancello respinge sempre', () => {
  const SULLE_NOTE = 'la nota c’è: `grep -q 20261110165020 .sierradeck/quaderno/errori-arrivati.md`'

  it('un comando che legge solo le note, per un compito che non è una nota: rifiutato subito, e dice come fare', () => {
    const errore = scrivi('Correggere il salvataggio', SULLE_NOTE)
    expect(errore).toContain('il compito k-1: il comando del criterio')
    expect(errore).toContain('controlla solo file sotto .sierradeck/')
    expect(errore).toContain('dillo nel titolo')
  })

  it('lo stesso comando, per un compito che è proprio una nota: accettato', () => {
    expect(scrivi('Nota nel quaderno errori-arrivati.md per i gruppi del lotto', SULLE_NOTE)).toBe('ok')
    expect(scrivi('Rapporto della prova', 'il rapporto c’è: `test -f .sierradeck/rapporto-prova.md`')).toBe('ok')
  })

  it('virgolette che non si chiudono: rifiutato anche per una nota', () => {
    expect(scrivi('Sistema la barra', 'passa: `node -e "console.log(1)`')).toContain('Le virgolette non si chiudono')
    expect(scrivi('Nota nel quaderno', 'c’è: `grep -q "lotto .sierradeck/quaderno/x.md`')).toContain('Le virgolette non si chiudono')
  })

  it('un criterio a parole, o un comando che misura il codice, passano come prima', () => {
    expect(scrivi('Sistema la barra', 'si vede la barra nuova')).toBe('ok')
    expect(scrivi('Sistema la barra', 'passa `npx vitest run tests/shared/barra.test.ts`')).toBe('ok')
  })

  it('esaminaCriterio: come esaminaComando, tranne le note per un compito che è una nota', () => {
    const cmd = 'grep -q x .sierradeck/quaderno/lezioni.md'
    expect(esaminaComando(cmd).ok).toBe(false)
    expect(esaminaCriterio(cmd, 'Correggere il salvataggio').ok).toBe(false)
    expect(esaminaCriterio(cmd, 'Nota nel quaderno sulle lezioni').ok).toBe(true)
    expect(esaminaCriterio('npm test', 'qualunque').ok).toBe(true)
    expect(titoloDiNota('Scheda del collaudo nel quaderno')).toBe(true)
    expect(titoloDiNota('Annotazioni automatiche del servizio: correzione')).toBe(false)
  })
})
