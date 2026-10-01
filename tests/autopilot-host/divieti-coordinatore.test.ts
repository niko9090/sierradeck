import { describe, it, expect } from 'vitest'
import { bersagliCancellazione, giudicaMossa, giudicaStrumento, leggiMosse, rispostaPreTool } from '../../src/autopilot-host/divieti'
import {
  daMettereInPausa, daRiprendere, domandaGemella, driveDelProgetto, leggiStatoProgramma, riassuntoProgramma, somiglianza
} from '../../src/autopilot-host/coordinatore'
import { frenoDaiLimiti } from '@shared/harness'

const PROGETTO = 'E:\\Progetti\\sito'
const WT = 'E:\\Progetti\\sito.sierradeck-wt'
const bash = (command: string, cwd = PROGETTO) => ({ tool_name: 'Bash', tool_input: { command }, cwd })

describe('i divieti, fatti rispettare dal programma (T4)', () => {
  it('una chat cancella dentro le sue cartelle, non fuori', () => {
    expect(giudicaStrumento(bash('rm -rf dist'), [PROGETTO, WT]).ok).toBe(true)
    expect(giudicaStrumento(bash('rm -rf E:\\Progetti\\sito.sierradeck-wt\\a1-c-1\\tmp'), [PROGETTO, WT]).ok).toBe(true)
    const fuori = giudicaStrumento(bash('rm -rf ../altro-progetto'), [PROGETTO, WT])
    expect(fuori.ok).toBe(false)
    expect(giudicaStrumento(bash('npm test && Remove-Item -Recurse C:\\Users\\nikof\\Documents'), [PROGETTO]).ok).toBe(false)
    expect(giudicaStrumento(bash('del /q C:\\Windows\\temp\\x.txt'), [PROGETTO]).ok).toBe(false)
  })

  it('non si cancella la cartella di lavoro intera, e git clean fuori non passa', () => {
    expect(giudicaStrumento(bash(`rm -rf "${PROGETTO}"`), [PROGETTO]).ok).toBe(false)
    expect(giudicaStrumento(bash('git clean -fdx', 'E:\\Altro'), [PROGETTO]).ok).toBe(false)
    expect(giudicaStrumento(bash('git clean -fdx'), [PROGETTO]).ok).toBe(false)
  })

  it('le rotte vietate del programma non si chiamano da una chat', () => {
    expect(giudicaStrumento(bash('curl -X POST http://127.0.0.1:47640/api/drive/porta -d {}'), [PROGETTO]).ok).toBe(false)
    expect(giudicaStrumento(bash('curl http://127.0.0.1:47640/api/account/esci'), [PROGETTO]).ok).toBe(false)
    expect(giudicaStrumento(bash('curl -s http://127.0.0.1:47640/api/polso'), [PROGETTO]).ok).toBe(true)
  })

  it('il resto del lavoro passa: commit, push, pubblicazione sono permessi', () => {
    for (const c of ['git commit -am x', 'git push origin main', 'npm run pubblica', 'npm test']) {
      expect(giudicaStrumento(bash(c), [PROGETTO]).ok).toBe(true)
    }
    expect(giudicaStrumento({ tool_name: 'Write', tool_input: { file_path: 'C:\\x.txt' } }, [PROGETTO]).ok).toBe(true)
  })

  it('i bersagli di una catena si leggono pezzo per pezzo', () => {
    const b = bersagliCancellazione('echo a; rm a.txt && rm -f E:/x/y', 'E:/p')
    expect(b.map((x) => x.replace(/\\/g, '/'))).toEqual(['E:/p/a.txt', 'E:/x/y'])
  })

  it('la risposta all hook nega con il motivo, o lascia passare', () => {
    expect(rispostaPreTool({ ok: true })).toEqual({})
    expect(rispostaPreTool({ ok: false, motivo: 'no' })).toEqual({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'no' }
    })
  })

  it('le mosse del supervisore: le sue si, quelle vietate no, le sconosciute no', () => {
    const mosse = leggiMosse([
      { tipo: 'apriChat', compito: 'le API' },
      { tipo: 'chiudiChat', chat: 'c-9' },
      { tipo: 'portaQui', progetto: 'x' },
      { tipo: 'esciAccount' },
      { tipo: 'inventata' }
    ])
    expect(giudicaMossa(mosse[0]!, ['c-1']).ok).toBe(true)
    expect(giudicaMossa(mosse[1]!, ['c-1']).ok).toBe(false)
    expect(giudicaMossa({ tipo: 'chiudiChat', chat: 'c-1' }, ['c-1']).ok).toBe(true)
    const porta = giudicaMossa(mosse[2]!, [])
    expect(porta.ok).toBe(false)
    if (!porta.ok) expect(porta.motivo).toContain('Porta qui')
    expect(giudicaMossa(mosse[3]!, []).ok).toBe(false)
    expect(giudicaMossa(mosse[4]!, []).ok).toBe(false)
  })
})

describe('il coordinatore (T1, T5)', () => {
  it('una domanda gemella di una chat sorella non arriva due volte', () => {
    const aperte = [{ id: 'd1', autopilotaId: 'a1', testo: 'Quale chiave API devo usare per il servizio meteo?' }]
    expect(domandaGemella(aperte, 'a1', 'Che chiave API uso per il servizio meteo?')).toBe('d1')
    expect(domandaGemella(aperte, 'a2', 'Quale chiave API devo usare per il servizio meteo?')).toBeUndefined()
    expect(domandaGemella(aperte, 'a1', 'Posso cancellare la cartella build?')).toBeUndefined()
    expect(somiglianza('', 'x')).toBe(0)
  })

  it('quando il freno scende si fermano le chat meno avanti, e ripartono quando c e posto', () => {
    const chats = [
      { id: 'c-1', compito: '', stato: 'lavoro' as const, cicli: 5 },
      { id: 'c-2', compito: '', stato: 'lavoro' as const, cicli: 1 },
      { id: 'c-3', compito: '', stato: 'lavoro' as const, cicli: 3 }
    ]
    expect(daMettereInPausa(chats, 1)).toEqual(['c-2', 'c-3'])
    expect(daMettereInPausa(chats, 5)).toEqual([])
    const conPausa = [{ ...chats[0]!, stato: 'lavoro' as const }, { ...chats[1]!, stato: 'pausa' as const }, { ...chats[2]!, stato: 'pausa' as const }]
    expect(daRiprendere(conPausa, 2)).toEqual(['c-2'])
    expect(daRiprendere(conPausa, 1)).toEqual([])
  })

  it('lo stato del programma si legge tollerante e si riassume per il supervisore', () => {
    const ora = Date.now()
    const e = leggiStatoProgramma({
      letto: ora,
      chat: [{ titolo: 'x', cwd: 'C:/p', stato: 'aspetta', governata: false }, { stato: 'lavoro', governata: true }, 'rotta'],
      limiti: { cinqueOre: { percento: 70 } },
      domandeAperte: 2,
      progetti: [{ nome: 'sito', chi: 'altro', pcNome: 'portatile', inCoda: 1 }],
      altriPc: [{ nome: 'portatile', vivo: true }]
    }, ora)
    expect(e?.chat).toHaveLength(2)
    const r = riassuntoProgramma(e, frenoDaiLimiti(e?.limiti, ora), ora)
    expect(r).toContain('Chat aperte: 2')
    expect(r).toContain('aspettano già 2')
    expect(r).toContain('sito su portatile')
    expect(r).toContain('non apro chat nuove')
    // Un estratto vecchio non si spaccia per di adesso.
    expect(riassuntoProgramma(e, frenoDaiLimiti(undefined, ora), ora + 10 * 60_000)).toContain('non è leggibile adesso')
    expect(leggiStatoProgramma('x', ora)).toBeUndefined()
  })

  it('il Drive del progetto: sincronizzazione accesa e cartella dentro un progetto sul Drive', () => {
    const ora = Date.now()
    const e = leggiStatoProgramma({ letto: ora, driveAttivo: true, progetti: [{ nome: 'sito', chi: 'io', inCoda: 0, percorso: 'E:/Progetti/sito' }] }, ora)
    expect(driveDelProgetto(e, 'E:/Progetti/sito/app', ora)).toBe(true)
    expect(driveDelProgetto(e, 'E:/Progetti/altro', ora)).toBe(false)
    expect(driveDelProgetto({ ...e!, driveAttivo: false }, 'E:/Progetti/sito', ora)).toBe(false)
    // Un estratto vecchio non conta: meglio non credersi in autonomia.
    expect(driveDelProgetto(e, 'E:/Progetti/sito', ora + 10 * 60_000)).toBe(false)
    expect(driveDelProgetto(undefined, 'E:/Progetti/sito', ora)).toBe(false)
  })
})

describe('i divieti senza falsi allarmi (0.37.1)', () => {
  // Il comando vero bloccato il 01/10: un heredoc che appendeva dei test, con
  // dentro «il momento del fermo» (la parola «del») e la rotta
  // «/autopiloti/ap-fermo/archivia». Era preso per `del <percorsi>`.
  const BLOCCATO_IL_01_10 = [
    "cat >> tests/autopilot-host/server.test.ts <<'EOF'",
    '',
    "describe('«Archivia» e il momento del fermo (0.37.0)', () => {",
    "  it('un autopilota fermo si archivia e si toglie dall archivio; uno che lavora no', async () => {",
    "    const r = await chiama('POST', '/autopiloti/ap-fermo/archivia', { archivia: true })",
    "    expect((await chiama('POST', '/autopiloti/ap-vivo/archivia', { archivia: true })).stato).toBe(409)",
    '  })',
    "  it('«Ferma» scrive il momento del fermo, e riprendere lo toglie insieme all archiviazione', async () => {})",
    '})',
    'EOF',
    'npx vitest run tests/autopilot-host/server.test.ts > "$TEMP/sv.txt" 2>&1; echo $?; grep -E "Tests|×" "$TEMP/sv.txt" | head'
  ].join('\n')

  it('il comando reale bloccato il 01/10 passa', () => {
    expect(bersagliCancellazione(BLOCCATO_IL_01_10, PROGETTO)).toEqual([])
    expect(giudicaStrumento(bash(BLOCCATO_IL_01_10), [PROGETTO]).ok).toBe(true)
  })

  it('URL, rotte http, grep, node -e e heredoc con dentro rm o del non sono cancellazioni', () => {
    const innocui = [
      'curl -X POST http://127.0.0.1:47630/autopiloti/x/archivia -d \'{"archivia":true}\'',
      'curl -s "http://127.0.0.1:47630/autopiloti/x/archivia?del=1"',
      'grep -rn "rm " src',
      "grep -rn 'del /q' src | head",
      'node -e "console.log(\'del fermo\'.length)"',
      "node -e 'const del = 1; console.log(del)'",
      "cat > note.md <<'FINE'\nrm -rf /c/altro\ndel C:\\Windows\nFINE\necho fatto",
      'git commit -m "toglie il momento del fermo; rm vecchio"',
      'echo il momento del fermo; echo rd ri erase',
      'npm test 2>&1 | grep -c "rm"'
    ]
    for (const c of innocui) expect([c, giudicaStrumento(bash(c), [PROGETTO]).ok]).toEqual([c, true])
  })

  it('le cancellazioni vere fuori dalle cartelle restano bloccate', () => {
    const vietati = [
      'rm -rf /c/altro',
      'sudo rm -rf /c/altro',
      'FOO=1 env BAR=2 rm -rf /c/altro',
      '"rm" -rf /c/altro',
      'echo ok && /bin/rm -rf ../altro-progetto',
      'cd /c/altro && rm -rf build',
      'git -C /c/altro clean -fdx',
      'git clean -fdx',
      'git worktree remove ../altro',
      'find /c/altro -name "*.tmp" -delete',
      'find /c/altro -exec rm {} \\;',
      'ls | xargs -n 1 rm',
      'bash -c "rm -rf /c/altro"',
      'echo "$(rm -rf /c/altro)"',
      'echo `rm -rf /c/altro`',
      "bash <<'EOF'\nrm -rf /c/altro\nEOF",
      'Remove-Item -Recurse C:\\Users\\nikof\\Documents',
      'powershell -Command "Remove-Item -Recurse -Force C:\\Altro"',
      'cmd /c rd /s /q C:\\Altro',
      'del /q C:\\Windows\\temp\\x.txt'
    ]
    for (const c of vietati) expect([c, giudicaStrumento(bash(c), [PROGETTO]).ok]).toEqual([c, false])
    // Anche dallo strumento PowerShell.
    const ps = (command: string) => ({ tool_name: 'PowerShell', tool_input: { command }, cwd: PROGETTO })
    expect(giudicaStrumento(ps('Get-ChildItem C:\\Altro | Remove-Item -Recurse'), [PROGETTO]).ok).toBe(false)
    expect(giudicaStrumento(ps('Remove-Item -LiteralPath "C:\\Altro\\x" -Force'), [PROGETTO]).ok).toBe(false)
    expect(giudicaStrumento(ps('Remove-Item dist -Recurse; Write-Output "del fermo"'), [PROGETTO]).ok).toBe(true)
  })

  it('le cancellazioni dentro le sue cartelle continuano a passare', () => {
    for (const c of ['rm -rf dist', 'rm -f a.txt 2>/dev/null', 'git clean -fdx dist', `rm -rf ${WT}\\a1-c-1\\tmp`, 'find dist -name "*.map" -delete']) {
      expect([c, giudicaStrumento(bash(c), [PROGETTO, WT]).ok]).toEqual([c, true])
    }
  })
})

describe('i percorsi di Git Bash e WSL (0.38.1)', () => {
  it('/e/... è E:\...: dentro le sue cartelle passa, fuori resta bloccato', () => {
    expect(giudicaStrumento(bash('rm -f /e/Progetti/sito/.sierradeck/consegne/prova.md'), [PROGETTO]).ok).toBe(true)
    expect(giudicaStrumento(bash('rm -f /mnt/e/Progetti/sito/tmp.txt'), [PROGETTO]).ok).toBe(true)
    expect(giudicaStrumento(bash('rm -rf /e/Altro'), [PROGETTO]).ok).toBe(false)
    expect(giudicaStrumento(bash('rm -rf /c/altro'), [PROGETTO]).ok).toBe(false)
  })
})
