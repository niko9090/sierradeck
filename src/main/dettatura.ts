import { execFile, execFileSync } from 'node:child_process'
import { release } from 'node:os'
import { valutaDettatura, type StatoDettatura } from '@shared/dettatura'

/**
 * La dettatura di Windows dal tasto 🎤 (0.75.0). Si legge solo il registro
 * (sola lettura) per sapere se il microfono è bloccato, e si preme Win+H come
 * lo premerebbe Nicholas: niente download, niente installazioni, niente audio
 * che passi da SierraDeck.
 */

const CHIAVE_MICROFONO = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone'

function leggiValore(chiave: string): string | undefined {
  try {
    const out = execFileSync('reg', ['query', chiave, '/v', 'Value'], { encoding: 'utf8', windowsHide: true, timeout: 3000 })
    return /Value\s+REG_SZ\s+(\S+)/.exec(out)?.[1]
  } catch {
    return undefined
  }
}

export function statoDettatura(): StatoDettatura {
  if (process.platform !== 'win32') return valutaDettatura({ piattaforma: process.platform, release: release() })
  const microfono = leggiValore(CHIAVE_MICROFONO)
  const microfonoDesktop = leggiValore(`${CHIAVE_MICROFONO}\\NonPackaged`)
  return valutaDettatura({
    piattaforma: process.platform,
    release: release(),
    ...(microfono !== undefined ? { microfono } : {}),
    ...(microfonoDesktop !== undefined ? { microfonoDesktop } : {})
  })
}

/**
 * Win+H, premuto dal sistema (keybd_event). La finestra di SierraDeck è già
 * davanti e il campo ha già il fuoco (lo mette il renderer prima di chiamare):
 * Windows apre la sua dettatura su quel campo.
 */
const PREMI_WIN_H = [
  'Add-Type -Namespace SD -Name Tasti -MemberDefinition \'[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);\'',
  '[SD.Tasti]::keybd_event(0x5B, 0, 0, [UIntPtr]::Zero)',
  '[SD.Tasti]::keybd_event(0x48, 0, 0, [UIntPtr]::Zero)',
  '[SD.Tasti]::keybd_event(0x48, 0, 2, [UIntPtr]::Zero)',
  '[SD.Tasti]::keybd_event(0x5B, 0, 2, [UIntPtr]::Zero)'
].join('; ')

export function apriDettatura(log: (riga: string) => void): Promise<{ ok: boolean; messaggio?: string; comeAttivare?: string }> {
  const s = statoDettatura()
  if (!s.disponibile) {
    log(`[dettatura] non aperta: ${s.motivo}`)
    return Promise.resolve({ ok: false, messaggio: s.motivo, comeAttivare: s.comeAttivare })
  }
  return new Promise((ok) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PREMI_WIN_H], { windowsHide: true, timeout: 8000 }, (err) => {
      if (err !== null) {
        log(`[dettatura] Win+H non premuto: ${String(err)}`)
        ok({ ok: false, messaggio: 'Dettatura non disponibile su questo PC: Windows non ha aperto la dettatura.', comeAttivare: 'Prova a premere tu Win+H con il cursore nel campo. Se non si apre, la dettatura è spenta o manca: Impostazioni di Windows → Ora e lingua → Voce.' })
        return
      }
      ok({ ok: true })
    })
  })
}
