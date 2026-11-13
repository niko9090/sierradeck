import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'

/**
 * Gli hook di React vanno chiamati sempre, nello stesso ordine: mai dopo un
 * `return` anticipato del componente. La 0.106.0 è partita con
 * `useMisuraTrascinabile` dopo `if (!pronto) return …` in App: alla prima
 * schermata vera React contava più hook di prima e si fermava (errore #310),
 * il programma non si apriva. Il progetto non ha eslint-plugin-react-hooks
 * (e TypeScript 7 non ha più l'API JavaScript): questa prova legge ogni file
 * del renderer con il parser di Babel e cerca, nel corpo di ogni funzione,
 * una chiamata `useXxx(` di primo livello che venga dopo un `if` di primo
 * livello con dentro un `return`.
 */

type Nodo = { type: string; loc?: { start: { line: number } }; [k: string]: unknown }

function fileDelRenderer(dir: string): string[] {
  const out: string[] = []
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out.push(...fileDelRenderer(p))
    else if (/\.(tsx|ts)$/.test(n) && !n.endsWith('.d.ts')) out.push(p)
  }
  return out
}

const FUNZIONI = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod'])

function figli(n: Nodo): Nodo[] {
  const out: Nodo[] = []
  for (const [k, v] of Object.entries(n)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra' || k.endsWith('Comments')) continue
    if (Array.isArray(v)) { for (const x of v) if (x !== null && typeof x === 'object' && typeof (x as Nodo).type === 'string') out.push(x as Nodo) }
    else if (v !== null && typeof v === 'object' && typeof (v as Nodo).type === 'string') out.push(v as Nodo)
  }
  return out
}

/** Cerca dentro `n` senza entrare nelle funzioni annidate. */
function cerca(n: Nodo, prova: (x: Nodo) => boolean): Nodo | undefined {
  if (prova(n)) return n
  for (const f of figli(n)) {
    if (FUNZIONI.has(f.type)) continue
    const t = cerca(f, prova)
    if (t !== undefined) return t
  }
  return undefined
}

function nomeHook(c: Nodo): string | undefined {
  if (c.type !== 'CallExpression') return undefined
  const e = c.callee as Nodo
  const id = e.type === 'Identifier' ? (e.name as string) : e.type === 'MemberExpression' && (e.property as Nodo).type === 'Identifier' ? ((e.property as Nodo).name as string) : ''
  return /^use[A-Z]/.test(id) ? id : undefined
}

export function hookDopoReturn(file: string, testo: string): string[] {
  const ast = parse(testo, { sourceType: 'module', plugins: ['typescript', 'jsx'] }) as unknown as Nodo
  const errori: string[] = []
  const visita = (n: Nodo): void => {
    if (FUNZIONI.has(n.type) && (n.body as Nodo | undefined)?.type === 'BlockStatement') {
      let dopoReturn: number | undefined
      for (const s of ((n.body as Nodo).body as Nodo[])) {
        if (dopoReturn !== undefined) {
          const h = cerca(s, (x) => nomeHook(x) !== undefined)
          if (h !== undefined) errori.push(`${file}:${s.loc?.start.line} ${nomeHook(h)} dopo il return della riga ${dopoReturn}`)
        }
        if (dopoReturn === undefined && s.type === 'IfStatement' && cerca(s, (x) => x.type === 'ReturnStatement') !== undefined) dopoReturn = s.loc?.start.line
      }
    }
    for (const f of figli(n)) visita(f)
  }
  visita(ast)
  return errori
}

describe('regole degli hook di React', () => {
  it('la prova riconosce un hook dopo un return anticipato', () => {
    const brutto = 'function A({ p }: { p: boolean }) {\n  const [a] = useState(0)\n  if (!p) return null\n  const b = useMisura("x")\n  return <div>{a}{b}</div>\n}\n'
    expect(hookDopoReturn('a.tsx', brutto)).toHaveLength(1)
    const buono = 'function A({ p }: { p: boolean }) {\n  const [a] = useState(0)\n  const b = useMisura("x")\n  if (!p) return null\n  return <div>{a}{b}</div>\n}\n'
    expect(hookDopoReturn('a.tsx', buono)).toHaveLength(0)
  })
  it('nessun componente del renderer chiama un hook dopo un return', () => {
    const errori = fileDelRenderer(join('src', 'renderer')).flatMap((f) => hookDopoReturn(f, readFileSync(f, 'utf8')))
    expect(errori).toEqual([])
  })
})
