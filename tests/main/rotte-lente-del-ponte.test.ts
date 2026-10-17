import { describe, it, expect } from 'vitest'
import { ROTTE_LENTE } from '../../src/main/pc-remoto'

/**
 * Il controllo a tappeto del 12/10 (0.68.0): dal telefono «Riprendi» di un
 * altro PC rispondeva 504 dopo 4 secondi, perché l'elenco delle conversazioni
 * là ci mette di più. Le rotte che fanno lavorare davvero l'altro PC aspettano
 * di più.
 */
describe('le rotte lente del ponte', () => {
  it('l’elenco delle conversazioni, la ripresa e l’avvio in sottofondo di un altro PC', () => {
    for (const r of ['/api/sessioni', '/api/sessioni/riprendi', '/api/sottofondo/avvia', '/api/file/progetti', '/api/drive/pannello']) expect(ROTTE_LENTE).toContain(r)
  })

  it('la gestione delle chat di un altro PC (0.79.0): misurare, eliminare, ripristinare e svuotare ci mettono più di 4 secondi', () => {
    for (const r of ['spazio', 'azione', 'ripristina', 'svuota']) expect(ROTTE_LENTE).toContain(`/api/chat/gestione/${r}`)
  })
})
