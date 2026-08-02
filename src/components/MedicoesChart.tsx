import React, { useMemo, useRef, useState } from 'react'
import { Medicao } from '@/hooks/useObras'
import { formatMoeda, formatMoedaFull, formatData } from '@/lib/format'
import styles from '@/styles/MedicoesChart.module.css'

interface Props {
  medicoes: Medicao[]
  valorContrato: number
}

interface Ponto {
  data: Date
  label: string
  valor: number
  acumulado: number
}

const W = 720
const H = 260
const PAD = { top: 16, right: 16, bottom: 28, left: 56 }

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0]
  const raw = max / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  const ticks: number[] = []
  // Sobe até o primeiro tick >= max, garantindo que os dados nunca estourem a escala
  for (let v = 0; v < max + step; v += step) {
    ticks.push(v)
    if (v >= max) break
  }
  return ticks
}

export function MedicoesChart({ medicoes, valorContrato }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [verTabela, setVerTabela] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  // Ordenar por data e acumular valores no cliente
  const pontos: Ponto[] = useMemo(() => {
    const comData = medicoes
      .filter(m => m.data_medicao)
      .sort((a, b) => (a.data_medicao! < b.data_medicao! ? -1 : 1))

    let acum = 0
    return comData.map(m => {
      acum += Number(m.valor_medicao) || 0
      return {
        data: new Date(m.data_medicao + 'T12:00:00'),
        label: m.periodo_referencia || formatData(m.data_medicao!),
        valor: Number(m.valor_medicao) || 0,
        acumulado: acum,
      }
    })
  }, [medicoes])

  if (pontos.length === 0) {
    return (
      <p className={styles.vazio}>
        Nenhuma medição registrada para esta obra no banco de dados.
      </p>
    )
  }

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const t0 = pontos[0].data.getTime()
  const t1 = pontos[pontos.length - 1].data.getTime()
  const spanT = Math.max(1, t1 - t0)

  const maxY = Math.max(pontos[pontos.length - 1].acumulado, valorContrato > 0 ? valorContrato : 0)
  const ticks = niceTicks(maxY)
  const topTick = ticks[ticks.length - 1] || 1

  const x = (p: Ponto) =>
    pontos.length === 1
      ? PAD.left + plotW / 2
      : PAD.left + ((p.data.getTime() - t0) / spanT) * plotW
  const y = (v: number) => PAD.top + plotH - (v / topTick) * plotH

  const linha = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p).toFixed(1)},${y(p.acumulado).toFixed(1)}`).join(' ')
  const area = `${linha} L${x(pontos[pontos.length - 1]).toFixed(1)},${y(0)} L${x(pontos[0]).toFixed(1)},${y(0)} Z`

  const ultimo = pontos[pontos.length - 1]

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    let bestDist = Infinity
    pontos.forEach((p, i) => {
      const d = Math.abs(x(p) - px)
      if (d < bestDist) { bestDist = d; best = i }
    })
    setHoverIdx(best)
  }

  const hover = hoverIdx !== null ? pontos[hoverIdx] : null

  // Posição do tooltip em % (evita sair da borda)
  const tipLeftPct = hover ? Math.min(80, Math.max(4, (x(hover) / W) * 100)) : 0

  return (
    <div>
      <div className={styles.topo}>
        <span className={styles.legendaTexto}>
          Valor acumulado medido ao longo do tempo
          {valorContrato > 0 && ' — a linha tracejada marca o valor do contrato'}
        </span>
        <button className={styles.toggleTabela} onClick={() => setVerTabela(v => !v)}>
          {verTabela ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </div>

      {verTabela ? (
        <div className={styles.tabelaWrap}>
          <table className={styles.tabela}>
            <thead>
              <tr>
                <th>Período</th>
                <th>Data</th>
                <th className={styles.num}>Valor medido</th>
                <th className={styles.num}>Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {[...pontos].reverse().map((p, i) => (
                <tr key={i}>
                  <td>{p.label}</td>
                  <td>{formatData(p.data)}</td>
                  <td className={styles.num}>{formatMoedaFull(p.valor)}</td>
                  <td className={styles.num}>{formatMoedaFull(p.acumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.chartWrap}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className={styles.svg}
            role="img"
            aria-label="Evolução do valor acumulado das medições"
            onPointerMove={onMove}
            onPointerLeave={() => setHoverIdx(null)}
          >
            {/* Gridlines + ticks Y */}
            {ticks.map(t => (
              <g key={t}>
                <line
                  x1={PAD.left} x2={W - PAD.right}
                  y1={y(t)} y2={y(t)}
                  className={t === 0 ? styles.eixo : styles.grid}
                />
                <text x={PAD.left - 8} y={y(t) + 4} className={styles.tickY}>
                  {t === 0 ? '0' : formatMoeda(t).replace(/R\$\s?/, '')}
                </text>
              </g>
            ))}

            {/* Linha do valor do contrato */}
            {valorContrato > 0 && valorContrato <= topTick && (
              <g>
                <line
                  x1={PAD.left} x2={W - PAD.right}
                  y1={y(valorContrato)} y2={y(valorContrato)}
                  className={styles.linhaContrato}
                />
                <text x={W - PAD.right} y={y(valorContrato) - 6} className={styles.labelContrato}>
                  Contrato {formatMoeda(valorContrato)}
                </text>
              </g>
            )}

            {/* Área + linha */}
            <path d={area} className={styles.area} />
            <path d={linha} className={styles.linha} />

            {/* Marcador do último ponto + label */}
            <circle cx={x(ultimo)} cy={y(ultimo.acumulado)} r={5} className={styles.dotFinal} />
            <text
              x={Math.min(x(ultimo), W - PAD.right - 4)}
              y={Math.max(12, y(ultimo.acumulado) - 12)}
              className={styles.labelFinal}
            >
              {formatMoeda(ultimo.acumulado)}
            </text>

            {/* Ticks X: primeiro e último */}
            <text x={x(pontos[0])} y={H - 8} className={styles.tickX} textAnchor="start">
              {formatData(pontos[0].data)}
            </text>
            {pontos.length > 1 && (
              <text x={x(ultimo)} y={H - 8} className={styles.tickX} textAnchor="end">
                {formatData(ultimo.data)}
              </text>
            )}

            {/* Crosshair */}
            {hover && (
              <g>
                <line
                  x1={x(hover)} x2={x(hover)}
                  y1={PAD.top} y2={H - PAD.bottom}
                  className={styles.crosshair}
                />
                <circle cx={x(hover)} cy={y(hover.acumulado)} r={5} className={styles.dotHover} />
              </g>
            )}
          </svg>

          {hover && (
            <div className={styles.tooltip} style={{ left: `${tipLeftPct}%` }}>
              <div className={styles.tooltipTitulo}>{hover.label}</div>
              <div className={styles.tooltipLinha}>
                <span className={styles.tooltipValor}>{formatMoedaFull(hover.acumulado)}</span>
                <span className={styles.tooltipLabel}>acumulado</span>
              </div>
              <div className={styles.tooltipLinha}>
                <span className={styles.tooltipValorSec}>{formatMoedaFull(hover.valor)}</span>
                <span className={styles.tooltipLabel}>no período</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
