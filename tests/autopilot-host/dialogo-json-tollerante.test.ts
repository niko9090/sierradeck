import { describe, it, expect } from 'vitest'
import { leggiEsitoDialogo } from '../../src/autopilot-host/dialogo'
import { campoTestoTollerante, riparaJson, ultimoOggettoCon } from '../../src/autopilot-host/json-tollerante'

/**
 * 0.72.1: due risposte dell'autopilota a Nicholas (15/10) sono finite in
 * «Non sono riuscito a leggere la mia stessa risposta». Erano JSON lunghi, con
 * ✓, «…» e comandi dei criteri pieni di `\"` e `$(…)`; il guasto vero erano
 * le virgolette dritte non protette in `perLaChat`, citate dalle sue parole.
 */

const CRITERIO_GIT = String.raw`bash -c 'git fetch -q && test -z \"$(git status --porcelain)\" && test -z \"$(git rev-list origin/main..HEAD)\"'`
const CRITERIO_NODE = String.raw`node -e \"const v=require('./package.json').version;process.exit(/^0[.]72[.]1$/.test(v)?0:1)\"`

/** Ricostruita come quelle del 15/10: lunga, con ✓, «», \n, criteri e virgolette non protette. */
function rispostaCome15Ottobre(): string {
  const risposta = String.raw`Hai ragione su tutte e due.\n\n**1. Le righe «consegnato alle…».** Un messaggio arrivato avrà solo una piccola spunta ✓, e l'ora la vedi se ci passi sopra.\n\n` +
    String.raw`**2. Le Domande.** Ogni domanda diventa una scheda semplice. ` + 'Esce come 0.72.1. '.repeat(40)
  const perLaChat = 'NUOVO LAVORO. Le sue parole: «vedo ancora un sacco di messaggi "consegnato alle" che occupano tutto lo spazio»\\n\\nA. Righe. ' + 'Dettaglio del lavoro. '.repeat(150)
  return [
    '{',
    `  "risposta": "${risposta}",`,
    `  "perLaChat": "${perLaChat}",`,
    '  "cambio": {',
    '    "obiettivo": "0.72.1: righe «consegnato alle» sostituite da una spunta ✓",',
    '    "criteri": [',
    `      {"descrizione": "Versione 0.72.1", "comando": "${CRITERIO_NODE}"},`,
    '      {"descrizione": "I test del programma passano", "comando": "npm test"},',
    `      {"descrizione": "Tutto è in commit e mandato su origin", "comando": "${CRITERIO_GIT}"}`,
    '    ],',
    '    "compitiDaFare": ["Righe «consegnato alle»: spunta ✓", "Domande essenziali"]',
    '  },',
    '  "comando": "riprendi"',
    '}'
  ].join('\n')
}

describe('la risposta dell autopilota alla scheda si legge anche se è lunga o ha caratteri speciali', () => {
  it('quella del 15/10 (virgolette non protette, ✓, \\" nei comandi, 6000+ caratteri) si legge tutta', () => {
    const testo = rispostaCome15Ottobre()
    expect(testo.length).toBeGreaterThan(5000)
    expect(() => JSON.parse(testo)).toThrow()
    const e = leggiEsitoDialogo(testo)!
    expect(e).toBeDefined()
    expect(e.restoIlleggibile).toBeUndefined()
    expect(e.risposta).toContain('spunta ✓')
    expect(e.perLaChat).toContain('messaggi "consegnato alle" che')
    expect(e.comando).toBe('riprendi')
    expect(e.cambio?.criteri?.map((c) => c.comando)).toEqual([
      CRITERIO_NODE.replace(/\\"/g, '"'), 'npm test', CRITERIO_GIT.replace(/\\"/g, '"')
    ])
    expect(e.cambio?.compitiDaFare).toEqual(['Righe «consegnato alle»: spunta ✓', 'Domande essenziali'])
  })

  it('un \\ che non è un escape JSON (\\$, \\|, \\.) non fa perdere la risposta', () => {
    const e = leggiEsitoDialogo(String.raw`{"risposta": "Fatto ✓", "cambio": {"criteri": [{"descrizione": "grep", "comando": "grep -E 'a\|b' x && echo \$HOME"}]}}`)!
    expect(e.risposta).toBe('Fatto ✓')
    expect(e.cambio?.criteri?.[0]?.comando).toBe(String.raw`grep -E 'a\|b' x && echo \$HOME`)
  })

  it('a capo crudi dentro una stringa e una } dentro un comando', () => {
    const e = leggiEsitoDialogo('Ragiono {prima}.\n```json\n{"risposta": "Riga uno\nriga due", "cambio": {"criteri": [{"descrizione": "awk", "comando": "awk \'{print $1}\' f"}]}}\n```')!
    expect(e.risposta).toBe('Riga uno\nriga due')
    expect(e.cambio?.criteri?.[0]?.comando).toBe("awk '{print $1}' f")
  })

  it('se il resto non si legge, la risposta arriva lo stesso e non si applica niente', () => {
    const rotto = '{"risposta": "Ho capito, ci penso io.", "perLaChat": "testo", "cambio": {"criteri": [{"descrizione": "x", "comando": '
    const e = leggiEsitoDialogo(rotto)!
    expect(e).toEqual({ risposta: 'Ho capito, ci penso io.', restoIlleggibile: true })
  })

  it('senza nessuna risposta resta illeggibile', () => {
    expect(leggiEsitoDialogo('niente json')).toBeUndefined()
    expect(leggiEsitoDialogo('{"perLaChat": "x"}')).toBeUndefined()
  })

  it('vince l ultimo oggetto con la chiave', () => {
    expect(ultimoOggettoCon('{"risposta": "prima"} poi {"risposta": "seconda"}', 'risposta')).toEqual({ risposta: 'seconda' })
  })

  it('riparaJson non tocca il JSON già valido', () => {
    const valido = JSON.stringify({ a: 'x "y" \\ z ✓', b: [1, { c: '\n' }] })
    expect(riparaJson(valido)).toBe(valido)
  })

  it('campoTestoTollerante prende il campo anche in mezzo a un oggetto rotto', () => {
    expect(campoTestoTollerante('{"risposta": "Ecco \\"qui\\" e «là»", "cambio": {rotto', 'risposta')).toBe('Ecco "qui" e «là»')
  })
})
