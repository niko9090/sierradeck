import type { MappaPc as Mappa } from '@shared/collegamento'

/**
 * La mappa dei PC nel pannello Salute (0.51.0): questo PC al centro, gli
 * altri intorno, una linea per PC colorata come lo stato del collegamento
 * (verde = diretto, ambra = solo via Drive, lento; rosso = non risponde), con
 * la strada scritta sopra. Le posizioni le calcola `mappaPc`.
 */
export function MappaPc({ mappa }: { mappa: Mappa }): React.JSX.Element {
  const centro = mappa.nodi[0]
  return (
    <section className="salute__gruppo">
      <div className="serigrafia">Mappa dei PC</div>
      <svg className="mappa-pc" viewBox="0 0 100 100" role="img" aria-label="Mappa dei collegamenti fra i PC">
        {mappa.linee.map((l) => {
          const n = mappa.nodi.find((x) => x.id === l.a)
          if (n === undefined || centro === undefined) return null
          return (
            <g key={l.a}>
              <title>{l.testo}</title>
              <line x1={centro.x} y1={centro.y} x2={n.x} y2={n.y} stroke={l.colore} strokeWidth={l.stato === 'ok' ? 1.2 : 0.9} strokeDasharray={l.stato === 'giu' ? '2 2' : l.stato === 'lento' ? '4 1.5' : undefined} />
              <text x={(centro.x + n.x) / 2} y={(centro.y + n.y) / 2 - 1.5} textAnchor="middle" style={{ fill: l.colore }}>{l.strada ?? (l.stato === 'giu' ? 'giù' : '')}</text>
            </g>
          )
        })}
        {mappa.nodi.map((n) => (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={n.io === true ? 6 : 4.5} fill={n.io === true ? 'var(--remoto, #a77bf3)' : n.stato === 'acceso' ? 'var(--verde)' : n.stato === 'incerto' ? 'var(--spento)' : 'var(--rosso)'} />
            <text x={n.x} y={n.y + (n.io === true ? 10 : 8.5)} textAnchor="middle">{n.io === true ? `${n.nome} (questo)` : n.nome}</text>
            {n.host !== undefined ? <text className="mappa-pc__host" x={n.x} y={n.y + (n.io === true ? 13.5 : 12)} textAnchor="middle">{n.host}</text> : null}
          </g>
        ))}
      </svg>
      <div className="mappa-pc__legenda">
        Questo PC al centro, gli altri intorno. Linea verde piena: si raggiunge direttamente (rete di casa, Tailscale o WebRTC, scritto sopra). Ambra tratteggiata: solo via Drive, lento. Rossa a puntini: adesso non risponde. Passa sopra una linea per i dettagli; la voce del PC qui sotto dice cosa fare.
      </div>
    </section>
  )
}
