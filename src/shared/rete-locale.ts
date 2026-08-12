/**
 * Chi può bussare al Client, e chi no.
 *
 * Questo server comanda un programma che **esegue codice**: apre chat, manda
 * testo a `claude.exe`, ferma e riprende autopiloti. Esporlo è una cosa seria, e
 * la difesa non può essere un token soltanto — un token si perde, si incolla per
 * sbaglio, finisce in una cronologia.
 *
 * Quindi due muri invece di uno: si risponde **solo** a chi arriva dalla rete
 * locale, e solo a chi si è fatto riconoscere una volta. Il primo muro regge
 * anche se il secondo cede, e viceversa.
 */

/** Le reti da cui si accetta una richiesta: casa, ufficio, il telefono sul wifi. */
export function daReteLocale(indirizzo: string): boolean {
  const ip = normalizza(indirizzo)
  if (ip === '') return false

  // Il computer stesso: il browser aperto sul PC dove gira SierraDeck.
  if (ip === '127.0.0.1' || ip === '::1') return true

  const parti = ip.split('.')
  if (parti.length === 4 && parti.every((p) => /^\d{1,3}$/.test(p))) {
    const [a, b] = parti.map((p) => Number(p)) as [number, number, number, number]
    if (a === 10) return true
    if (a === 192 && b === 168) return true
    // 172.16.0.0 – 172.31.255.255, non tutto il 172: il resto è Internet.
    if (a === 172 && b >= 16 && b <= 31) return true
    // 169.254: quando il DHCP non ha risposto e due macchine si parlano lo
    // stesso. È una rete locale a tutti gli effetti.
    if (a === 169 && b === 254) return true
    // 100.64–100.127: lo spazio che usano Tailscale, ZeroTier e le VPN a maglia
    // per le loro reti private. Escluderlo non significava soltanto non
    // mostrare quell'indirizzo: significava **rifiutare** chi arrivava da lì,
    // cioè proprio chi si collega da fuori casa nel modo più sicuro che ci sia.
    if (a === 100 && b >= 64 && b <= 127) return true
    return false
  }

  // IPv6 privato: fc00::/7 (indirizzi unici locali) e fe80::/10 (collegamento).
  const minuscolo = ip.toLowerCase()
  return /^f[cd]/.test(minuscolo) || minuscolo.startsWith('fe80')
}

/**
 * Toglie la forma con cui Node presenta un IPv4 dentro IPv6.
 *
 * `::ffff:192.168.1.4` è lo stesso indirizzo di `192.168.1.4`: senza questo, un
 * telefono sulla rete di casa verrebbe scambiato per un estraneo.
 */
function normalizza(indirizzo: string): string {
  const pulito = indirizzo.trim()
  if (pulito.toLowerCase().startsWith('::ffff:')) return pulito.slice(7)
  // La forma con la porta o con la zona: `[fe80::1%eth0]` e simili.
  return pulito.replace(/^\[|\]$/g, '').split('%')[0] ?? ''
}
