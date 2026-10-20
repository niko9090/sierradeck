import { describe, it, expect } from 'vitest'
import { alberoChat } from '../../src/shared/harness'
import { paginaClient } from '../../src/main/client-pagina'

/** 0.71.0: il ruolo di ogni chat si vede uguale sul PC, nella pagina e nell'app (stesso albero dal PC). */
const ap = {
  id: 'ap-1', nome: 'Prova', obiettivo: 'o', stato: 'lavoro' as const, cicli: 3, cwd: 'C:/p',
  chats: [
    { id: 'c-1', compito: 'Salva la coda', stato: 'finita' as const, cicli: 2, ruolo: 'sviluppo' as const, ramo: 'ap/ap-1/c-1', approvata: true },
    { id: 'c-2', compito: 'Rivedi il ramo ap/ap-1/c-1 della chat c-1 («Salva la coda»)', stato: 'lavoro' as const, cicli: 1, ruolo: 'revisione' as const, revisioneDi: 'c-1' },
    { id: 'c-3', compito: 'Allinea la pagina', stato: 'lavoro' as const, cicli: 0, ruolo: 'interfaccia' as const }
  ]
}

describe('il ruolo nell’albero delle chat', () => {
  it('il PC mette nel nodo il ruolo con parola e colore, e se il ramo è approvato', () => {
    const t = alberoChat(ap)
    expect(t.figli.map((f) => f.ruolo?.parola)).toEqual(['sviluppo', 'revisione', 'interfaccia'])
    expect(t.figli[2]?.ruolo?.colore).toBe('viola')
    expect(t.figli[0]?.approvata).toBe(true)
    expect(t.figli[1]?.revisioneDi).toBe('c-1')
  })

  it('la pagina del telefono lo disegna con il suo colore', () => {
    const html = paginaClient()
    const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
    const estrai = (nome: string): string => {
      const inizio = script.indexOf(`function ${nome}(`)
      let p = 0
      for (let i = script.indexOf('{', inizio); i < script.length; i++) {
        if (script[i] === '{') p++
        else if (script[i] === '}' && --p === 0) return script.slice(inizio, i + 1)
      }
      throw new Error(nome)
    }
    const riga = (inizio: string): string => script.split(String.fromCharCode(10)).find((r) => r.startsWith(inizio)) ?? ''
    const albero = new Function(`${riga('const esc =')}\n${riga('var ATT = ')}\n${estrai('coloreNome')}\n${estrai('coloreRuolo')}\n${estrai('alberoHtml')}\nreturn alberoHtml`)() as (a: unknown) => string
    const h = albero({ stato: 'lavoro', ramoBase: 'main', albero: alberoChat(ap) })
    expect(h).toContain('>revisione</span>')
    expect(h).toContain('color:#b48cff')
    // 0.82.0: la Revisione ha il suo rosa, non più l'ambra di «aspetta te».
    expect(h).toContain('color:#f283c0')
    expect(h).toContain('approvato e unito')
  })
})
