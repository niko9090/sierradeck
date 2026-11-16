import { describe, expect, it } from 'vitest'
import { motivoPerRestareQui } from '@shared/aiuto-rete'

const PROGETTO = 'E:\\Documents\\Progetti SierraDeck\\fionda apl'

describe('compiti che restano su questo PC (16/11)', () => {
  it('il caso vero: aprire la guida HTML nel browser di Nicholas', () => {
    expect(motivoPerRestareQui('Il verificatore — aprire la guida HTML nel browser di Nicholas', PROGETTO)).toBeDefined()
    expect(motivoPerRestareQui('Apri docs/rete/guida.html nel browser', PROGETTO)).toBeDefined()
    expect(motivoPerRestareQui('lancia Start-Process sul file', PROGETTO)).toBeDefined()
  })

  it('un file di questo PC fuori dal progetto resta qui', () => {
    expect(motivoPerRestareQui('leggi la chiave da C:\\Users\\asus\\cloudflare-token.txt e crea la regola', PROGETTO)).toMatch(/cloudflare-token\.txt/u)
  })

  it('i file del progetto (anche con spazi nel percorso) e il codice di interfaccia possono andare altrove', () => {
    expect(motivoPerRestareQui(`correggi ${PROGETTO}\\docs\\rete\\guida-chiave-cloudflare.html, poi i test`, PROGETTO)).toBeUndefined()
    expect(motivoPerRestareQui(`leggi ${PROGETTO.replace(/\\/gu, '/')}/docs/x.md`, PROGETTO)).toBeUndefined()
    expect(motivoPerRestareQui('il tasto apre una finestra con le impostazioni; mostra il riquadro sullo schermo piccolo', PROGETTO)).toBeUndefined()
    expect(motivoPerRestareQui('scrivi la funzione e i suoi test', PROGETTO)).toBeUndefined()
  })

  it('un percorso che comincia come il progetto ma è un’altra cartella conta come esterno', () => {
    expect(motivoPerRestareQui(`leggi ${PROGETTO}-vecchio\\x.txt`, PROGETTO)).toBeDefined()
  })
})
