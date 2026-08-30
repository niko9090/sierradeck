import { describe, it, expect } from 'vitest'
import { analizzaMarkdown, analizzaInline, urlSicuro, type NodoInline } from '../../src/shared/markdown'

/** Il testo piatto di una sequenza di nodi in riga, per asserire più corto. */
function testoDi(nodi: NodoInline[]): string {
  return nodi.map((n) => {
    if (n.tipo === 'testo' || n.tipo === 'codice') return n.testo
    if (n.tipo === 'link') return n.testo
    return testoDi(n.figli)
  }).join('')
}

describe('urlSicuro', () => {
  it('lascia passare http, https, mailto e i percorsi relativi', () => {
    expect(urlSicuro('https://esempio.it')).toBe('https://esempio.it')
    expect(urlSicuro('http://x')).toBe('http://x')
    expect(urlSicuro('mailto:a@b.it')).toBe('mailto:a@b.it')
    expect(urlSicuro('./nota.md')).toBe('./nota.md')
    expect(urlSicuro('cartella/file')).toBe('cartella/file')
  })

  it('rifiuta javascript: e data: e ogni altro schema', () => {
    // È la riga che impedisce a un link di eseguire codice.
    expect(urlSicuro('javascript:alert(1)')).toBeUndefined()
    expect(urlSicuro('JavaScript:alert(1)')).toBeUndefined()
    expect(urlSicuro('data:text/html,<script>')).toBeUndefined()
    expect(urlSicuro('file:///etc/passwd')).toBeUndefined()
  })
})

describe('inline', () => {
  it('riconosce grassetto, corsivo e codice', () => {
    const n = analizzaInline('un **grassetto**, un *corsivo* e del `codice`')
    expect(n.find((x) => x.tipo === 'forte')).toBeDefined()
    expect(n.find((x) => x.tipo === 'enfasi')).toBeDefined()
    expect(n.find((x) => x.tipo === 'codice')).toBeDefined()
    expect(testoDi(n)).toBe('un grassetto, un corsivo e del codice')
  })

  it('il grassetto vince sul corsivo: ** non diventa due *', () => {
    const n = analizzaInline('**forte**')
    expect(n).toHaveLength(1)
    expect(n[0]?.tipo).toBe('forte')
  })

  it('un link sicuro diventa link, uno pericoloso resta testo', () => {
    const sicuro = analizzaInline('vai [qui](https://esempio.it)')
    const link = sicuro.find((x) => x.tipo === 'link')
    expect(link).toEqual({ tipo: 'link', testo: 'qui', url: 'https://esempio.it' })

    const pericoloso = analizzaInline('[clic](javascript:alert(1))')
    expect(pericoloso.find((x) => x.tipo === 'link')).toBeUndefined()
    // Non sparisce: resta il testo così com'era.
    expect(testoDi(pericoloso)).toContain('javascript:alert(1)')
  })

  it('dentro il codice in riga non si interpreta altro', () => {
    const n = analizzaInline('`**non grassetto**`')
    expect(n).toHaveLength(1)
    expect(n[0]).toEqual({ tipo: 'codice', testo: '**non grassetto**' })
  })
})

describe('blocchi', () => {
  it('titoli di vari livelli', () => {
    const b = analizzaMarkdown('# Uno\n## Due\n### Tre')
    expect(b.map((x) => x.tipo === 'titolo' ? x.livello : 0)).toEqual([1, 2, 3])
  })

  it('un blocco di codice tiene il testo com è, senza interpretarlo', () => {
    const b = analizzaMarkdown('prima\n\n```ts\nconst x = **1**\n```\n\ndopo')
    const codice = b.find((x) => x.tipo === 'codice')
    expect(codice).toEqual({ tipo: 'codice', testo: 'const x = **1**', lingua: 'ts' })
  })

  it('un elenco puntato raccoglie le sue voci', () => {
    const b = analizzaMarkdown('- uno\n- due\n- tre')
    const elenco = b[0]
    expect(elenco?.tipo).toBe('elenco')
    if (elenco?.tipo === 'elenco') {
      expect(elenco.ordinato).toBe(false)
      expect(elenco.voci.map(testoDi)).toEqual(['uno', 'due', 'tre'])
    }
  })

  it('un elenco numerato è distinto da uno puntato', () => {
    const b = analizzaMarkdown('1. primo\n2. secondo')
    expect(b[0]?.tipo).toBe('elenco')
    if (b[0]?.tipo === 'elenco') expect(b[0].ordinato).toBe(true)
  })

  it('una citazione diventa un blocco con dentro i suoi blocchi', () => {
    const b = analizzaMarkdown('> una nota\n> su due righe')
    expect(b[0]?.tipo).toBe('citazione')
  })

  it('la riga orizzontale è un blocco a sé', () => {
    const b = analizzaMarkdown('sopra\n\n---\n\nsotto')
    expect(b.some((x) => x.tipo === 'riga')).toBe(true)
  })

  it('l HTML nel testo non viene interpretato: resta testo di un paragrafo', () => {
    // La sicurezza per costruzione: non si produce mai HTML, quindi un tag nel
    // sorgente è solo testo. React poi lo mette a schermo neutralizzato.
    const b = analizzaMarkdown('<img src=x onerror=alert(1)>')
    expect(b[0]?.tipo).toBe('paragrafo')
    if (b[0]?.tipo === 'paragrafo') expect(testoDi(b[0].figli)).toBe('<img src=x onerror=alert(1)>')
  })

  it('un testo vuoto non produce blocchi, senza errori', () => {
    expect(analizzaMarkdown('')).toEqual([])
    expect(analizzaMarkdown('\n\n  \n')).toEqual([])
  })
})

describe('urlSicuro e i caratteri di controllo', () => {
  const TAB = String.fromCharCode(9)
  const ACAPO = String.fromCharCode(10)
  const NULLO = String.fromCharCode(0)

  it('non lascia passare uno schema spezzato da un carattere di controllo', () => {
    // Il browser butta via tab, a capo e nulli quando legge un indirizzo:
    // `java<TAB>script:` diventa `javascript:` al momento del clic. Qui non
    // somigliava a uno schema, e passava per percorso relativo.
    for (const mezzo of [TAB, ACAPO, NULLO]) {
      expect(urlSicuro(`java${mezzo}script:alert(1)`)).toBeUndefined()
    }
  })

  it('lascia passare un indirizzo buono, ripulito', () => {
    expect(urlSicuro(`https://esempio.it/a${TAB}b`)).toBe('https://esempio.it/ab')
    expect(urlSicuro('./scheda.md')).toBe('./scheda.md')
  })
})
