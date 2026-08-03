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

  const analisadas = useMemo(() => {
    const mapa = new Map<number, AnaliseRisco>()
    obras.forEach(o => mapa.set(o.id, analisarObra(o)))
    return mapa
  }, [obras])

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
      description="Obras públicas com indícios de aditivos excessivos, atrasos e paralisações"
      alertasCriticos={resumo.criticas}
    >
      <div className={styles.topo}>
        <h1 className={styles.titulo}>Radar de fiscalização</h1>
        <p className={styles.subtitulo}>
          Cruzamos os dados abertos da PBH em busca de sinais que merecem atenção.
        </p>
        <p className={styles.disclaimer}>
          <strong>Indício não é prova.</strong> Use como ponto de partida para cobrar respostas.
        </p>
      </div>

      <div className={styles.kpis}>
        <div className={styles.kpi} data-tom="critico">
          <div className={styles.kpiLabel}>Nível crítico</div>
          <div className={styles.kpiValue}>{isLoading ? '...' : resumo.criticas}</div>
        </div>
        <div className={styles.kpi} data-tom="atencao">
          <div className={styles.kpiLabel}>Atenção</div>
          <div className={styles.kpiValue}>{isLoading ? '...' : resumo.atencao}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>Valor sob alerta</div>
          <div className={styles.kpiValue}>{isLoading ? '...' : formatMoeda(resumo.valorSobAlerta)}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>Aditivos &gt; {LIMITE_LEGAL_ADITIVO_PCT}%</div>
          <div className={styles.kpiValue}>{isLoading ? '...' : resumo.aditivosAcima}</div>
        </div>
      </div>

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
        {isLoading ? 'Analisando...' : `${ranking.length} obras com indícios`}
      </div>

      {isLoading ? (
        <div className={styles.estadoVazio}>Carregando contratos...</div>
      ) : ranking.length === 0 ? (
        <div className={styles.estadoVazio}>Nenhuma obra com esses filtros.</div>
      ) : (
        <div className={styles.lista}>
          {ranking.slice(0, limite).map(({ obra, analise }, i) => (
            <div key={obra.id} className={styles.item} data-nivel={analise.nivel}>
              <button
                className={styles.itemTopo}
                onClick={() => setExpandida(expandida === obra.id ? null : obra.id)}
              >
                <span className={styles.itemRank}>{i + 1}</span>
                <span className={styles.itemScore} data-nivel={analise.nivel}>{analise.score}</span>
                <span className={styles.itemTexto}>
                  <span className={styles.itemNome}>{obra.nome}</span>
                  <span className={styles.itemMeta}>{obra.regional || 'Sem regional'}</span>
                </span>
              </button>
              {expandida === obra.id && (
                <div className={styles.itemDetalhe}>
                  <ul className={styles.alertaLista}>
                    {analise.alertas.map(alerta => (
                      <li key={alerta.id} className={styles.alertaItem}>
                        <strong>{alerta.titulo}</strong>
                        <p>{alerta.descricao}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <section className={styles.secao}>
        <h2 className={styles.secaoTitulo}>Metodologia</h2>
        <p>Cada obra recebe pontos por indício encontrado: aditivos acima de {LIMITE_LEGAL_ADITIVO_PCT}%, prazo vencido, paralisação sem justificativa e dados incompletos.</p>
      </section>
    </Layout>
  )
}
