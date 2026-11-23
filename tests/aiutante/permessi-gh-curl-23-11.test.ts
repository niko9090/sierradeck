import { describe, it, expect } from 'vitest'
import { VIETATI_AIUTO } from '../../src/shared/aiuto-rete'

/** Come la CLI legge un divieto: `Tool(glob)`, con `*` per qualsiasi testo e `prefisso:*` per «il prefisso, con o senza argomenti». */
function negato(strumento: 'Bash' | 'PowerShell', comando: string): boolean {
  return VIETATI_AIUTO.some((v) => {
    const m = /^(\w+)\((.*)\)$/u.exec(v)
    if (m === null || m[1] !== strumento) return false
    const glob = (m[2] ?? '').replace(/:\*$/u, '*')
    const re = new RegExp(`^${glob.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/gu, '\\$&')).join('.*')}$`, 'u')
    return re.test(comando)
  })
}

const STRUMENTI = ['Bash', 'PowerShell'] as const

describe('permessi gh e curl degli specialisti (23/11)', () => {
  it.each([
    'gh release view v1.2.3',
    'gh release view v1.2.3 --json isDraft,assets',
    'gh release list --limit 2',
    'gh repo view',
    'gh repo view owner/nome --json name',
    'gh api repos/owner/nome/releases',
    'gh api repos/owner/nome/releases/latest --jq .tag_name',
    'curl https://example.com/x.json',
    'curl -s -L -o out.json https://example.com/x.json',
    'curl -I https://example.com',
    'curl.exe -s https://example.com',
    'curl -X GET https://example.com'
  ])('legge: %s', (comando) => {
    for (const s of STRUMENTI) expect(negato(s, comando)).toBe(false)
  })

  it.each([
    'gh release create v1 --draft',
    'gh release upload v1 file.exe',
    'gh release delete v1',
    'gh release edit v1 --draft=false',
    'gh pr create --fill',
    'gh pr merge 3',
    'gh issue create --title x',
    'gh repo create nome',
    'gh repo delete nome',
    'gh api repos/o/n/releases -X POST',
    'gh api repos/o/n/releases --method POST',
    'gh api repos/o/n/issues -f title=x',
    'gh api repos/o/n/issues -F title=x',
    'gh api repos/o/n/releases --input corpo.json',
    'curl -d a=b https://example.com',
    'curl --data-binary @f https://example.com',
    'curl -F file=@f https://example.com',
    'curl -X POST https://example.com',
    'curl -X PUT https://example.com',
    'curl -X DELETE https://example.com',
    'curl --upload-file f https://example.com',
    'curl -T f https://example.com',
    'curl.exe -X POST https://example.com',
    'git push origin main'
  ])('scrive, negato: %s', (comando) => {
    for (const s of STRUMENTI) expect(negato(s, comando)).toBe(true)
  })

  it('installare SierraDeck resta vietato', () => {
    expect(VIETATI_AIUTO).toContain('Bash(npm install:*)')
    expect(VIETATI_AIUTO).toContain('Bash(npm run pubblica:*)')
  })
})
