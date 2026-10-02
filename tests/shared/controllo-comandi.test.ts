import { describe, it, expect } from 'vitest'
import { dollariNonProtetti, esaminaComando, fileLetti, messaggioCriterio, scriptNode, vagliaCriteri, virgoletteAperte } from '@shared/controllo-comandi'

/**
 * 0.44.0: i comandi dei criteri controllati quando si scrivono. I casi veri
 * del 01/10 (quaderno: trappola dei comandi con bash -c tra virgolette
 * doppie): il criterio corretto dal supervisore nel dialogo (dal file
 * dell'autopilota, decisione «criterio corretto») e la forma `f=$(find …);
 * grep … $f` della chat NexoraOS.
 */
const VERO_0110_VERSIONE = `bash -c "v=$(node -p \\"require('./package.json').version\\") && echo $v | grep -qE '^0\\.37\\.[0-9]+$' && grep -qF '0.37.0' src/shared/novita.ts && grep -qF \\"$v\\" src/shared/novita.ts"`
const VERO_0110_FIND = `bash -c "f=$(find /root/nexora-build -path '*usr/lib/systemd/system/gdm.service' 2>/dev/null | head -1); grep -n 'Conflicts' $f"`
// I criteri buoni che usa oggi il supervisore (consegne c-1/c-2): devono passare.
const BUONO_VERSIONE = `node -e "const v=require('./package.json').version;const n=require('fs').readFileSync('src/shared/novita.ts','utf8');const m=/^0[.]([0-9]+)[.][0-9]+$/.exec(v);process.exit(m&&+m[1]>=47&&n.includes(v)?0:1)"`
const BUONO_GIT = `bash -c 'git fetch -q && test -z "$(git status --porcelain)" && test -z "$(git rev-list origin/main..HEAD)"'`
const BUONO_RELEASE = `node -e "const v=require('./package.json').version;const r=require('child_process').execSync('gh release view v'+v+' --json assets,isDraft,body').toString();const j=JSON.parse(r);const a=j.assets.map(x=>x.name);process.exit(!j.isDraft&&j.body.length>50&&a.includes('latest.yml')&&a.includes('app-android.json')&&a.some(x=>x.endsWith('.apk'))?0:1)"`

describe('i casi veri del 01/10 si fermano alla scrittura', () => {
  it('$v e $(…) dentro bash -c tra virgolette doppie', () => {
    const e = esaminaComando(VERO_0110_VERSIONE)
    expect(e.ok).toBe(false)
    const d = e.problemi.find((p) => p.tipo === 'dollaro')
    expect(d?.messaggio).toContain('$(…)')
    expect(d?.messaggio).toContain('$v')
    expect(d?.messaggio).toContain('la trappola del 01/10')
  })
  it('f=$(find …); grep … $f', () => {
    const e = esaminaComando(VERO_0110_FIND)
    expect(e.ok).toBe(false)
    expect(e.problemi.find((p) => p.tipo === 'dollaro')?.messaggio).toContain('$f')
  })
})

describe('i criteri buoni passano', () => {
  it('node -e tra doppie con $/ della regex, bash -c tra apici singoli, gh release', () => {
    for (const c of [BUONO_VERSIONE, BUONO_GIT, BUONO_RELEASE, 'npm test', 'npm run typecheck', 'cd android && gradle testDebugUnitTest assembleDebug --no-daemon']) {
      expect(esaminaComando(c), c).toEqual({ ok: true, problemi: [] })
    }
  })
})

describe('gli altri errori', () => {
  it('virgolette sbilanciate', () => {
    expect(virgoletteAperte(`grep -q 'ciao src/a.ts`)).toBe("'")
    expect(virgoletteAperte(`echo "a\\"b"`)).toBeUndefined()
    const e = esaminaComando(`node -e "process.exit(0)`)
    expect(e.ok).toBe(false)
    expect(e.problemi[0]?.tipo).toBe('virgolette')
  })
  it('node -e malformato, letto come lo passa la shell', () => {
    expect(scriptNode(`node -e "console.log(\\"x\\")"`)).toEqual([{ modo: 'e', script: 'console.log("x")' }])
    const rotto = esaminaComando(`node -e "const a = require('fs'; process.exit(0)"`)
    expect(rotto.ok).toBe(false)
    expect(rotto.problemi[0]?.tipo).toBe('node')
    expect(esaminaComando(`node -p "require('./package.json').version"`).ok).toBe(true)
  })
  it('i $ che la shell espande, e quelli che no', () => {
    expect(dollariNonProtetti('echo $v ${x} $(ls) $1')).toEqual(['$v', '${…}', '$(…)', '$1'])
    expect(dollariNonProtetti("grep -E '^a$' \\$v /^0[.]$/")).toEqual([])
  })
})

describe('i file', () => {
  it('quali file legge un comando', () => {
    expect(fileLetti(`test -f .sierradeck/quaderno/progetto.md && node scripts/x.mjs && grep -q foo src/a.ts`).sort())
      .toEqual(['.sierradeck/quaderno/progetto.md', 'scripts/x.mjs', 'src/a.ts'].sort())
    expect(fileLetti(BUONO_VERSIONE).sort()).toEqual(['./package.json', 'src/shared/novita.ts'])
  })
  it('un file che non c’è è un avviso, non un errore: può essere il lavoro a crearlo', () => {
    const e = esaminaComando('test -f .sierradeck/quaderno/nuovo.md', () => false)
    expect(e.ok).toBe(true)
    expect(e.problemi).toMatchObject([{ gravita: 'avviso', tipo: 'file' }])
    expect(esaminaComando('test -f package.json', (p) => p === 'package.json').problemi).toEqual([])
  })
})

describe('il vaglio dei criteri, con il messaggio per chi li scrive', () => {
  it('quelli sbagliati restano fuori, gli altri entrano; gli avvisi passano e si dicono', () => {
    const v = vagliaCriteri([
      { descrizione: 'versione', comando: VERO_0110_VERSIONE },
      { descrizione: 'test', comando: 'npm test' },
      { descrizione: 'lo giudica lui' },
      { descrizione: 'scheda', comando: 'test -f .sierradeck/quaderno/x.md' }
    ], () => false)
    expect(v.buoni.map((c) => c.descrizione)).toEqual(['test', 'lo giudica lui', 'scheda'])
    expect(v.scartati[0]?.messaggio).toContain('Il comando del criterio «versione» non va bene e non l\'ho preso')
    expect(v.avvisi[0]).toContain('ha un avviso')
  })
  it('il messaggio dice il criterio, il comando e cosa fare', () => {
    const m = messaggioCriterio('versione', VERO_0110_VERSIONE, esaminaComando(VERO_0110_VERSIONE))
    expect(m).toContain('«versione»')
    expect(m).toContain(VERO_0110_VERSIONE)
    expect(m).toContain('apici singoli')
  })
})
