import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** Le variabili che ogni test vede puntate sulla cartella finta (0.72.0). */
export const VARIABILI_FINTE = ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR'] as const

export function cartelleFinte(radice: string): Record<(typeof VARIABILI_FINTE)[number], string> {
  const casa = join(radice, 'casa')
  const local = join(casa, 'AppData', 'Local')
  const roaming = join(casa, 'AppData', 'Roaming')
  const temp = join(local, 'Temp')
  for (const d of [roaming, temp]) mkdirSync(d, { recursive: true })
  return { HOME: casa, USERPROFILE: casa, APPDATA: roaming, LOCALAPPDATA: local, TEMP: temp, TMP: temp, TMPDIR: temp }
}
