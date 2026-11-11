import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { soloLetturaInFila } from '../../src/autopilot-host/sola-lettura'
import { giudicaGuardiaOrchestratore, type ContestoGuardia } from '../../src/autopilot-host/guardia-orchestratore'
import { REGOLE_ORCHESTRATORE } from '../../src/autopilot-host/orchestratore'

/**
 * 11/11 (voce 5): l'orchestratore può leggere lo stato del progetto anche con
 * più comandi in fila. Un elenco di ammessi: tutto quello che non è un `cd`
 * nel progetto, un git che legge o un filtro dopo una pipe resta rifiutato.
 */

const RADICE = join(tmpdir(), 'progetto-di-prova')
const COPIA = join(RADICE, '.claude', 'worktrees', 'agent-a1')
/** La radice come la scrive Git Bash: `/c/…` al posto di `C:\…` (su Windows); altrove resta com'è. */
const BASH = /^[a-zA-Z]:/u.test(RADICE) ? `/${RADICE[0]!.toLowerCase()}${RADICE.slice(2).replace(/\\/g, '/')}` : RADICE
const si = (c: string): void => { expect(soloLetturaInFila(c, RADICE), c).toBe(true) }
const no = (c: string): void => { expect(soloLetturaInFila(c, RADICE), c).toBe(false) }

describe('letture in fila: quello che passa', () => {
  it('i comandi rifiutati davvero fra l’08 e l’11/11, che leggevano e basta', () => {
    si('git status --short && git log --oneline -3')
    si(`cd ${BASH} && git status --short && git diff --stat && git log --oneline -5 && git branch --list "worktree-agent-a6f5de87aff364423" -v`)
    si('git log --oneline -3 worktree-agent-a6c94a1263ad4cf08 && git diff --stat main...worktree-agent-a6c94a1263ad4cf08')
    si(`cd "${RADICE.replace(/\\/g, '/')}" && git status --short && git log --oneline -3 && git log --oneline main..worktree-agent-ac55d590f5c7d9b8f && git diff --stat main`)
    si('git branch -a --list "*main*"; git log --oneline -3 v0.97.0; git rev-list --count main..v0.97.0')
    si('git tag --list v0.97.0; git log --oneline -5; git branch -r | Select-Object -First 5; git status --short')
    si("git branch --list 'k309*' 'k315*' && git log --oneline -3 && git status --short | head")
    si('git log --oneline -25; git tag --list "v0.96*"; git diff --stat; git branch --list "ap/*" --no-merged main | Select-Object -First 30')
  })

  it('un git che legge, da solo o con un filtro dopo la pipe', () => {
    for (const c of [
      'git status', 'git --no-pager log -5', 'git log --format="%h %s" -n 5', "git for-each-ref --format='%(refname)' refs/heads",
      'git show --stat HEAD~1', 'git show HEAD:src/a.ts', 'git diff main...HEAD --name-only', 'git rev-parse HEAD', 'git ls-files src',
      'git describe --tags --abbrev=0', 'git blame -L 1,20 src/a.ts', 'git merge-base main HEAD', 'git rev-list --count main..HEAD',
      'git branch', 'git branch --show-current', 'git branch -vv', 'git branch --merged main', 'git tag', 'git tag -l "v0.9*"', 'git tag -n',
      'git worktree list', 'git worktree list --porcelain', 'git remote -v', 'git remote get-url origin', 'git stash list',
      'git log --oneline | head -20', 'git log --oneline | tail -n 5', 'git status --short | wc -l', 'git log --oneline | grep -i "fix"',
      'git log --oneline | grep -m 3 -E "fix|feat"', 'git branch -a | sort -r | uniq', 'git log --oneline | findstr /i unioni',
      'git log --oneline | Select-String -Pattern "fix" | Measure-Object -Line', 'git log --oneline | Select-Object -First 3 -Skip 1',
      'git.exe status --short', 'git status --short\ngit log --oneline -3', 'git status;', 'git status || git log -1'
    ]) si(c)
  })

  it('`cd` e `git -C` restano nel progetto, anche dentro la copia di uno specialista', () => {
    si(`git -C "${COPIA}" log --oneline -3`)
    si(`cd ${join('.claude', 'worktrees', 'agent-a1')} && git status --short`)
    si(`Set-Location -Path "${RADICE}"; git status --short`)
    si(`pushd "${COPIA}" && git diff --stat`)
  })
})

describe('letture in fila: quello che resta rifiutato', () => {
  it('ogni git che cambia qualcosa, anche in mezzo a letture', () => {
    for (const c of [
      'git status && git commit -m x', 'git add -A', 'git checkout main', 'git merge ramo', 'git reset --hard', 'git stash', 'git stash pop',
      'git stash list; git stash drop', 'git push', 'git pull', 'git fetch', 'git clean -fd', 'git rm a.txt', 'git restore .', 'git rebase main',
      'git branch nuovo', 'git branch -D vecchio', 'git branch -m a b', 'git branch -v nuovo', 'git branch --set-upstream-to=origin/main',
      'git tag v1.0.0', 'git tag -d v1.0.0', 'git tag -a v1 -m x', 'git worktree add ../x', 'git worktree remove x', 'git remote add x y',
      'git remote set-url origin z', 'git config user.name x', 'git gc', 'git update-ref refs/heads/x HEAD', 'git apply p.diff', 'git cherry-pick abc'
    ]) no(c)
  })

  it('ogni comando che non è git, `cd` o un filtro dopo la pipe', () => {
    for (const c of [
      'ls', 'dir', 'cat package.json', 'npm test', 'npx vitest run', 'node -e "1"', 'rm -rf x', 'Remove-Item x', 'echo ciao', 'gh release view v1',
      'git status && rm -rf x', 'git status; Remove-Item x -Recurse', 'git status && calc.exe', 'git log | tee registro.txt', 'git log | Out-File x.txt',
      'git log | sort -o x.txt', 'git log | sort --output=x.txt', 'git log | head -5 package.json', 'git log | grep -r segreto /', 'git log | grep -f modelli.txt',
      'git log | grep fix package.json', 'git log | xargs rm', 'git log | bash', 'git log | node', 'git log | Select-String fix -Path x.txt',
      'git log | ForEach-Object { $_ }', 'grep -m1 version package.json', 'head -5 package.json', 'git status | cd ..', 'cd . | git status', 'cd', ''
    ]) no(c)
  })

  it('rinvii, espansioni, parentesi, `&` da solo, virgolette aperte', () => {
    for (const c of [
      'git diff > modifiche.txt', 'git log >> x', 'git log 2>&1', 'git status < x', 'git log $(git describe --tags)..main', 'git log `git describe`',
      'git log "$(whoami)"', 'git log "`whoami`"', 'git status & calc', 'git status &', '(git status)', 'git log @{u}', 'git log $HOME',
      'git log --format="abc', "git log --format='abc", 'git log | Where-Object { $_ -match "x" }', 'git status && $x = 1', 'A=1 git status',
      'GIT_EXTERNAL_DIFF=calc git diff', '"git" status', "'git' status"
    ]) no(c)
  })

  it('niente configurazione al volo né file scritti da git', () => {
    for (const c of [
      'git -c core.fsmonitor=calc status', 'git -c core.pager=calc log', 'git status && git -c alias.x=!calc x', 'git diff --output=x.txt',
      'git log --output x.txt', 'git diff --ext-diff', 'git --git-dir=/altro/.git log', 'git --work-tree=/altro status', 'git --exec-path=/x status',
      'git -p log', 'git --paginate log', 'git log -c'
    ]) no(c)
  })

  it('fuori dal progetto no: né con `cd`, né con `git -C`', () => {
    no('cd .. && git status')
    no(`cd "${join(RADICE, '..', 'altro-progetto')}" && git log`)
    no('cd /c/Windows && git status')
    no('cd ~ && git status')
    no(`git -C "${join(RADICE, '..')}" log`)
    no('git -C /c/Altro log --oneline -3')
    no(`cd ${join('.claude', 'worktrees', 'agent-a1')} && cd ${join('..', '..', '..', '..')} && git status`)
  })
})

describe('nella guardia dell’orchestratore', () => {
  const ctx: ContestoGuardia = { radice: RADICE, specialistiSulPc: 0, tettoPc: 4 }
  const orchestratore = (tool_name: string, tool_input: Record<string, unknown>): Record<string, unknown> => ({ session_id: 's', cwd: RADICE, tool_name, tool_input })

  it('le letture in fila passano, da Bash e da PowerShell; il resto riceve il motivo, che adesso dice cosa può fare', () => {
    expect(giudicaGuardiaOrchestratore(orchestratore('Bash', { command: 'git status --short && git log --oneline -3' }), ctx)).toEqual({ ok: true })
    expect(giudicaGuardiaOrchestratore(orchestratore('PowerShell', { command: 'git status --short; git diff --stat | Select-Object -First 20' }), ctx)).toEqual({ ok: true })
    const g = giudicaGuardiaOrchestratore(orchestratore('Bash', { command: 'git status && git commit -m x' }), ctx)
    expect(g.ok).toBe(false)
    expect(!g.ok && g.motivo).toContain('git in sola lettura, anche in fila')
    expect(!g.ok && g.motivo).toContain('quaderno_annota')
    // Scrivere resta vietato, anche nella memoria di Claude.
    expect(giudicaGuardiaOrchestratore(orchestratore('Write', { file_path: join(tmpdir(), '.claude', 'projects', 'x', 'memory', 'MEMORY.md'), content: 'x' }), ctx).ok).toBe(false)
    expect(giudicaGuardiaOrchestratore(orchestratore('Edit', { file_path: join(RADICE, 'a.ts') }), ctx).ok).toBe(false)
  })

  it('per uno specialista non cambia niente: le sue regole sono altre', () => {
    const specialista = { session_id: 's', cwd: COPIA, agent_id: 'a1', agent_type: 'sviluppatore', tool_name: 'Bash', tool_input: { command: 'git add a.ts && git commit -m "x"' } }
    expect(giudicaGuardiaOrchestratore(specialista, ctx).ok).toBe(true)
  })

  it('le regole dell’orchestratore dicono dove va la memoria: nel quaderno, non nei file di Claude', () => {
    expect(REGOLE_ORCHESTRATORE).toContain('Non scrivere nella memoria di Claude')
    expect(REGOLE_ORCHESTRATORE).toContain('la tua memoria è il quaderno')
  })
})
