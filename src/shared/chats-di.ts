import type { Autopilota, ChatGovernata } from './autopilota'

/**
 * Le chat governate di un autopilota. Da un altro PC, da un formato vecchio o da
 * una lettura parziale `chats` può mancare (o non essere una lista): vale come
 * lista vuota, invece di far cadere l'interfaccia (0.107.1 `adessoDi`, poi `specialistiDi`).
 */
export const chatsDi = (a: Pick<Autopilota, 'chats'>): ChatGovernata[] => (Array.isArray(a.chats) ? a.chats : [])
