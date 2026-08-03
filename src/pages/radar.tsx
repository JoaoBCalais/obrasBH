import Link from 'next/link'
import { useState, useMemo } from 'react'
import { Layout } from '@/components/Layout'
import { useObras } from '@/hooks/useObras'
import {
  analisarObra,
  analisarEmpresas,
  analisarGaps,
  AnaliseRisco,
  CategoriaAlerta,
  NIVEL_LABELS,
  CATEGORIA_LABELS,
  SEVERIDADE_LABELS,
  LIMITE_LEGAL_ADITIVO_PCT,
} from '@/lib/risco'
import { formatMoeda, normalizeStatus, STATUS_LABELS, STATUS_CORES } from '@/lib/format'
import styles from '@/styles/Radar.module.css'

type FiltroNivel = 'todos' | 'critico' | 'atencao' | 'observacao'
type FiltroCategoria = 'todas' | CategoriaAlerta

const NIVEIS: { valor: FiltroNivel; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos os níveis' },
  { valor: 'critico', rotulo: 'Crítico' },
  { valor: 'atencao', rotulo: 'Atenção' },
  { valor: 'observacao', rotulo: 'Observação' },
]

const CATEGORIAS: { valor: FiltroCategoria; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas as categorias' },
  { valor: 'financeiro', rotulo: 'Financeiro' },
  { valor: 'prazo', rotulo: 'Prazo' },
  { valor: 'paralisacao', rotulo: 'Paralisação' },
  { valor: 'transparencia', rotulo: 'Transparência' },
]

export default function RadarPage() {
  const { obras, isLoading, isError } = useObras()
  const [filtroNivel, setFiltroNivel] = useState<FiltroNivel>('todos')
  const [filtroCategoria, setFiltroCategoria] = useState<FiltroCategoria>('todas')
  const [expandida, setExpandida] = useState<number | null>(null)
  const [limite, setLimite] = useState(25)

  // Analisar todas as obras
  const analisadas = useMemo(() => {
    const mapa = new Map<number, AnaliseRisco>()
    obras.forEach(o => mapa.set(o.id, analisarObra(o)))
    return mapa
  }, [obras])

  // Ranking: só obras com algum alerta, ordenadas por score
  const ranking = useMemo(() => {
    return obras
      .map(obra => ({ obra, analise: analisadas.get(obra.id)! }))
      .filter(({ analise }) => analise && analise.alertas.length > 0)
      .filter(({ analise }) => filtroNivel === 'todos' || analise.nivel === filtroNivel)
      .filter(({ analise }) =>
        filtroCategoria === 'todas' ||
        analise.alertas.some(a => a.categoria === filtroCategoria)
      )
      .sort((a, b) => b.analise.score - a.analise.score)
  }, [obras, analisadas, filtroNivel, filtroCategoria])

  // KPIs do radar
  const resumo = useMemo(() => {
    let criticas = 0, atencao = 0, valorSobAlerta = 0, aditivosAcima = 0
    obras.forEach(o => {
      const a = analisadas.get(o.id)
      if (!a) return
      const valorAtual = Number(o.valor_contrato_com_aditivo) ||
        (Number(o.valor_contrato) || 0) + (Number(o.valor_total_aditivo) || 0)
      if (a.nivel === 'critico') { criticas++; valorSobAlerta += valorAtual }
      if (a.nivel === 'atencao') { atencao++; valorSobAlerta += valorAtual }
      if (a.alertas.some(al => al.id === 'aditivo_acima_limite')) aditivosAcima++
    })
    return { criticas, atencao, valorSobAlerta, aditivosAcima }
  }, [obras, analisadas])

  // Concentração por empresa
  const empresas = useMemo(
    () => analisarEmpresas(obras, analisadas).filter(e => e.flags.length > 0).slice(0, 10),
    [obras, analisadas]
  )

  // Gaps de dados
  const gaps = useMemo(() => analisarGaps(obras), [obras])

  if (isError) {
    return (
      <Layout title="Radar — ObrasBH">
        <div style={{ padding: '3rem 0', color: 'var(--text-danger)' }}>
          <strong>Erro ao carregar dados.</strong>
        </div>
      </Layout>
    )
  }

  return (
    <Layout
      title="Radar de fiscalização — ObrasBH"
      description="Obras públicas de BH com indícios de aditivos excessivos, atrasos, paralisações sem justificativa e falhas de transparência"
      alertasCriticos={resumo.criticas}
    >
      <div className={styles.topo}>
        <h1 className={styles.titulo}>Radar de fiscalização</h1>
        <p className={styles.subtitulo}>
          Cruzamos os dados abertos da PBH em busca de sinais que merecem atenção: aditivos acima do
          limite legal de referência ({LIMITE_LEGAL_ADITIVO_PCT}%), prazos estourados, obras paradas sem
          explicação e lacunas nos dados publicados.
        </p>
        <p className={styles.disclaimer}>
          <strong>Indício não é prova.</strong> Um alerta aqui não significa irregularidade confirmada —
          significa que os números fogem do padrão e a obra merece ser acompanhada de perto. Use como
          ponto de partida para cobrar respostas.
        </p>
      </div>

      {/* KPIs */}
      <div className={styles.kpis}>
        <div className={styles.kpi} data-tom="critico">
          <div className={styles.kpiLabel}>Nível crítico</div>
          <div className={styles.kpiValue}>{isLoading ? '...' : resumo.criticas}</div>
          <div className={styles.kpiExtra}>obras com indícios fortes</div>
        </div>
        <div className={styles.kpi} data-tom="atencao">
          <div className={styles.kpiLabel}>Atenção</div>
          <div className={styles.kpiValue}>{isLoading ? '...' : resumo.atencao}</div>
          <div className={styles.kpiExtra}>obras para acompanhar</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>Valor sob alerta</div>
          <div className={styles.kpiValue}>{isLoading ? '...' : formatMoeda(resumo.valorSobAlerta)}</div>
          <div className={styles.kpiExtra}>em contratos crítico + atenção</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>Aditivos &gt; {LIMITE_LEGAL_ADITIVO_PCT}%</div>
          <div className={styles.kpiValue}>{isLoading ? '...' : resumo.aditivosAcima}</div>
          <div className={styles.kpiExtra}>acima do limite de referência</div>
        </div>
      </div>

      {/* Filtros */}
      <div className={styles.filtros}>
        {NIVEIS.map(n => (
          <button
            key={n.valor}
            className={`${styles.filterBtn} ${filtroNivel === n.valor ? styles.filterBtnActive : ''}`}
            onClick={() => { setFiltroNivel(n.valor); setLimite(25) }}
          >
            {n.rotulo}
          </button>
        ))}
        <span className={styles.filtroSeparador} aria-hidden="true" />
        {CATEGORIAS.map(c => (
          <button
            key={c.valor}
            className={`${styles.filterBtn} ${filtroCategoria === c.valor ? styles.filterBtnActive : ''}`}
            onClick={() => { setFiltroCategoria(c.valor); setLimite(25) }}
          >
            {c.rotulo}
          </button>
        ))}
      </div>

      <div className={styles.contagem}>
        {isLoading ? 'Analisando obras...' : `${ranking.length} obras com indícios`}
      </div>

      {/* Ranking */}
      {isLoading ? (
        <div className={styles.estadoVazio}>Carregando e analisando os contratos...</div>
      ) : ranking.length === 0 ? (
        <div className={styles.estadoVazio}>Nenhuma obra encontrada com esses filtros.</div>
      ) : (
        <div className={styles.lista}>
          {ranking.slice(0, limite).map(({ obra, analise }, i) => {
            const status = normalizeStatus(obra.status)
            const corStatus = STATUS_CORES[status] || { bg: '#f0f0f0', text: '#333' }
            const valorAtual = Number(obra.valor_contrato_com_aditivo) ||
              (Number(obra.valor_contrato) || 0) + (Number(obra.valor_total_aditivo) || 0)
            const aberta = expandida === obra.id

            return (
              <div key={obra.id} className={styles.item} data-nivel={analise.nivel}>
                <button
                  className={styles.itemTopo}
                  onClick={() => setExpandida(aberta ? null : obra.id)}
                  aria-expanded={aberta}
                >
                  <span className={styles.itemRank}>{i + 1}</span>
                  <span className={styles.itemScore} data-nivel={analise.nivel}>
                    {analise.score}
                  </span>
                  <span className={styles.itemTexto}>
                    <span className={styles.itemNome}>{obra.nome}</span>
                    <span className={styles.itemMeta}>
                      {obra.regional || 'Sem regional'}
                      {obra.empresa && ` · ${obra.empresa}`}
                      {valorAtual > 0 && ` · ${formatMoeda(valorAtual)}`}
                    </span>
                    <span className={styles.itemChips}>
                      <span className={styles.chipNivel} data-nivel={analise.nivel}>
                        ⚠ {NIVEL_LABELS[analise.nivel]}
                      </span>
                      <span
                        className={styles.chipStatus}
                        style={{ backgroundColor: corStatus.bg, color: corStatus.text }}
                      >
                        {STATUS_LABELS[status] || status}
                      </span>
                      <span className={styles.chipQtd}>
                        {analise.alertas.length} {analise.alertas.length === 1 ? 'indício' : 'indícios'}
                      </span>
                    </span>
                  </span>
                  <span className={styles.itemSeta} aria-hidden="true">{aberta ? '▴' : '▾'}</span>
                </button>

                {aberta && (
                  <div className={styles.itemDetalhe}>
                    <ul className={styles.alertaLista}>
                      {analise.alertas.map(alerta => (
                        <li key={alerta.id} className={styles.alertaItem}>
                          <div className={styles.alertaItemTopo}>
                            <span className={styles.alertaSev} data-sev={alerta.severidade}>
                              {SEVERIDADE_LABELS[alerta.severidade]}
                            </span>
                            <span className={styles.alertaCat}>{CATEGORIA_LABELS[alerta.categoria]}</span>
                          </div>
                          <strong>{alerta.titulo}</strong>
                          <p>{alerta.descricao}</p>
                        </li>
                      ))}
                    </ul>
                    <Link href={`/obra/${obra.id}`} className={styles.verObra}>
                      Ver página completa da obra →
                    </Link>
                  </div>
                )}
              </div>
            )
          })}

          {ranking.length > limite && (
            <button className={styles.verMais} onClick={() => setLimite(l => l + 25)}>
              Mostrar mais {Math.min(25, ranking.length - limite)} obras
            </button>
          )}
        </div>
      )}

      {/* Concentração por empresa */}
      {!isLoading && empresas.length > 0 && (
        <section className={styles.secao}>
          <h2 className={styles.secaoTitulo}>Empresas para acompanhar</h2>
          <p className={styles.secaoDesc}>
            Empresas com padrões que merecem atenção: muitos contratos, aditivos recorrentes acima
            do limite de referência ou grande concentração do valor total contratado.
          </p>
          <div className={styles.empresas}>
            {empresas.map(e => (
              <div key={e.empresa} className={styles.empresaCard}>
                <div className={styles.empresaNome}>{e.empresa}</div>
                <div className={styles.empresaLinha}>
                  <span>{e.contratos} {e.contratos === 1 ? 'contrato' : 'contratos'}</span>
                  <span>{formatMoeda(e.valorTotal)}</span>
                  {e.valorAditivos > 0 && (
                    <span className={styles.empresaAditivo}>
                      +{formatMoeda(e.valorAditivos)} em aditivos ({Math.round(e.aditivoPct)}%)
                    </span>
                  )}
                </div>
                <ul className={styles.empresaFlags}>
                  {e.flags.map((f, idx) => <li key={idx}>{f}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Gaps de dados */}
      {!isLoading && gaps.length > 0 && (
        <section className={styles.secao}>
          <h2 className={styles.secaoTitulo}>O que a PBH não está publicando</h2>
          <p className={styles.secaoDesc}>
            Transparência também é sobre o que falta. Estas são as lacunas encontradas nos dados
            abertos — cada uma delas dificulta a fiscalização cidadã.
          </p>
          <div className={styles.gaps}>
            {gaps.map(g => (
              <div key={g.id} className={styles.gapCard}>
                <div className={styles.gapNumero}>
                  {g.quantidade}
                  <span className={styles.gapPct}>{g.pct > 0 && ` (${g.pct}%)`}</span>
                </div>
                <div className={styles.gapTitulo}>{g.titulo}</div>
                <div className={styles.gapDesc}>{g.descricao}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Metodologia */}
      <section className={styles.metodologia}>
        <h2 className={styles.secaoTitulo}>Como o score é calculado</h2>
        <p>
          Cada obra recebe pontos por indício encontrado: aditivos acima de {LIMITE_LEGAL_ADITIVO_PCT}% do
          valor original (limite de referência do art. 125 da Lei 14.133/2021), prazo vencido sem conclusão,
          prazo mais que dobrado, obra antiga com pouca execução, paralisação sem previsão de reinício ou
          sem motivo informado, medição acima do valor contratado, divergência entre o percentual oficial e
          o calculado, e dados obrigatórios ausentes. A soma (limitada a 100) define o nível:
          45+ é <strong>crítico</strong>, 20–44 é <strong>atenção</strong> e abaixo disso, <strong>observação</strong>.
          Todo o cálculo roda sobre os dados públicos da SMOBI/PBH, no seu navegador.
        </p>
      </section>
    </Layout>
  )
}
