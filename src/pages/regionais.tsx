import Link from 'next/link'
import { useState, useMemo } from 'react'
import { Layout } from '@/components/Layout'
import { useObras } from '@/hooks/useObras'
import { analisarObra, AnaliseRisco } from '@/lib/risco'
import { normalizeStatus, formatMoeda } from '@/lib/format'
import styles from '@/styles/Home.module.css'

const STATUS_MAP: Record<string, string> = {
  'Em andamento': 'EM_ANDAMENTO',
  'Concluída': 'CONCLUIDA',
  'Paralisada': 'PARALISADA',
  'Em Negociação': 'EM_NEGOCIACAO',
  'Cancelado': 'CANCELADO',
}

type Ordem = 'obras' | 'valor' | 'alertas' | 'execucao' | 'nome'

const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: 'obras', rotulo: 'Mais obras' },
  { valor: 'valor', rotulo: 'Maior valor' },
  { valor: 'alertas', rotulo: 'Mais alertas' },
  { valor: 'execucao', rotulo: 'Menor execução' },
  { valor: 'nome', rotulo: 'Nome (A–Z)' },
]

export default function RegionaisPage() {
  const [statusFilter, setStatusFilter] = useState<string>('Todas')
  const [ordem, setOrdem] = useState<Ordem>('obras')
  const { obras, isLoading, isError } = useObras()

  const analises = useMemo(() => {
    const mapa = new Map<number, AnaliseRisco>()
    obras.forEach(o => mapa.set(o.id, analisarObra(o)))
    return mapa
  }, [obras])

  const obrasFormatadas = useMemo(() => obras.map(obra => {
    const valorContrato = Number(obra.valor_contrato) || 0
    return {
      idNum: obra.id,
      regional: obra.regional,
      status: normalizeStatus(obra.status),
      valorContrato,
      valorMedicao: Number(obra.valor_total_medicao) || 0,
      motivoParalisacao: obra.dsc_paralisacao || obra.motivo_paralisacao || null,
    }
  }), [obras])

  const contagens = useMemo(() => {
    const c: Record<string, number> = {}
    obrasFormatadas.forEach(obra => {
      const efetivo = (obra.motivoParalisacao && obra.motivoParalisacao.trim() !== '' && obra.status !== 'CONCLUIDA')
        ? 'PARALISADA'
        : obra.status
      c[efetivo] = (c[efetivo] || 0) + 1
    })
    return c
  }, [obrasFormatadas])

  const filtradas = useMemo(() => obrasFormatadas.filter(obra => {
    if (statusFilter === 'Todas') return true
    const alvo = STATUS_MAP[statusFilter]
    if (alvo === 'PARALISADA') {
      const temParalisacao = obra.motivoParalisacao && obra.motivoParalisacao.trim() !== ''
      return obra.status === 'PARALISADA' || Boolean(temParalisacao)
    }
    return obra.status === alvo
  }), [obrasFormatadas, statusFilter])

  const regionais = useMemo(() => {
    const mapa: Record<string, typeof filtradas> = {}
    filtradas.forEach(obra => {
      const reg = obra.regional || 'Sem regional'
      if (!mapa[reg]) mapa[reg] = []
      mapa[reg].push(obra)
    })

    const lista = Object.entries(mapa).map(([nome, itens]) => {
      const emAndamento = itens.filter(o => o.status === 'EM_ANDAMENTO').length
      const concluidas = itens.filter(o => o.status === 'CONCLUIDA').length
      const paralisadas = itens.filter(o => o.status === 'PARALISADA' || (o.motivoParalisacao && o.motivoParalisacao.trim() !== '')).length
      const alertas = itens.filter(o => {
        const a = analises.get(o.idNum)
        return a && (a.nivel === 'critico' || a.nivel === 'atencao')
      }).length
      const criticas = itens.filter(o => analises.get(o.idNum)?.nivel === 'critico').length
      const valorTotal = itens.reduce((s, o) => s + o.valorContrato, 0)
      const valorMedido = itens.reduce((s, o) => s + o.valorMedicao, 0)
      const pctExecucao = valorTotal > 0 ? Math.round((valorMedido / valorTotal) * 100) : 0
      return { nome, totalObras: itens.length, emAndamento, concluidas, paralisadas, alertas, criticas, valorTotal, valorMedido, pctExecucao }
    })

    const cmp: Record<Ordem, (a: typeof lista[0], b: typeof lista[0]) => number> = {
      obras: (a, b) => b.totalObras - a.totalObras,
      valor: (a, b) => b.valorTotal - a.valorTotal,
      alertas: (a, b) => b.alertas - a.alertas || b.criticas - a.criticas,
      execucao: (a, b) => a.pctExecucao - b.pctExecucao,
      nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
    }
    return lista.sort(cmp[ordem])
  }, [filtradas, analises, ordem])

  if (isError) {
    return (
      <Layout title="Regionais — ObrasBH">
        <div style={{ padding: '3rem 0', color: 'var(--text-danger)' }}>
          <strong>Erro ao carregar dados.</strong>
        </div>
      </Layout>
    )
  }

  const criticasTotais = obrasFormatadas.filter(o => analises.get(o.idNum)?.nivel === 'critico').length

  return (
    <Layout
      title="Obras por regional — ObrasBH"
      description="Obras públicas de Belo Horizonte agrupadas por regional: valores, execução e alertas"
      alertasCriticos={criticasTotais}
    >
      <h1 className={styles.regionalTitulo}>Obras por regional</h1>
      <p className={styles.regionalSubtitulo}>
        Compare as nove regionais de Belo Horizonte por número de obras, valor contratado,
        execução e quantidade de alertas. Clique em uma regional para ver a lista completa.
      </p>

      <div className={styles.filtros}>
        {['Todas', 'Em andamento', 'Concluída', 'Paralisada', 'Em Negociação', 'Cancelado'].map(status => (
          <button
            key={status}
            className={`${styles.filterBtn} ${statusFilter === status ? styles.filterBtnActive : ''}`}
            onClick={() => setStatusFilter(status)}
            disabled={isLoading}
          >
            {status}
            {status !== 'Todas' && (
              <span className={styles.filterCount}>{contagens[STATUS_MAP[status]] || 0}</span>
            )}
          </button>
        ))}
      </div>

      <div className={styles.filtros}>
        {ORDENS.map(o => (
          <button
            key={o.valor}
            className={`${styles.filterBtn} ${ordem === o.valor ? styles.filterBtnActive : ''}`}
            onClick={() => setOrdem(o.valor)}
            disabled={isLoading}
          >
            {o.rotulo}
          </button>
        ))}
      </div>

      <div className={styles.contagemResultados}>
        {filtradas.length} {filtradas.length === 1 ? 'obra' : 'obras'} em {regionais.length}{' '}
        {regionais.length === 1 ? 'regional' : 'regionais'}
      </div>

      {isLoading ? (
        <div className={styles.estadoVazio}>Carregando obras de Belo Horizonte...</div>
      ) : regionais.length > 0 ? (
        <div className={styles.regionaisGrid}>
          {regionais.map(reg => (
            <Link
              key={reg.nome}
              href={`/regional/${encodeURIComponent(reg.nome)}`}
              className={styles.regionalCard}
            >
              <div className={styles.regionalTopo}>
                <div>
                  <div className={styles.regionalNome}>{reg.nome || 'Sem regional'}</div>
                  <div className={styles.regionalContagem}>
                    {reg.totalObras} {reg.totalObras === 1 ? 'obra' : 'obras'}
                  </div>
                </div>
                {reg.alertas > 0 && (
                  <span className={styles.regionalAlerta} title={`${reg.alertas} obras com alertas de fiscalização`}>
                    ⚠ {reg.alertas}
                  </span>
                )}
              </div>

              <div className={styles.regionalMini}>
                <div className={styles.regionalMiniItem}>
                  <span className={styles.regionalMiniLabel}>Valor</span>
                  <span className={styles.regionalMiniValue}>{formatMoeda(reg.valorTotal)}</span>
                </div>
                <div className={styles.regionalMiniItem}>
                  <span className={styles.regionalMiniLabel}>Medido</span>
                  <span className={styles.regionalMiniValue} style={{ color: 'var(--text-success)' }}>
                    {formatMoeda(reg.valorMedido)}
                  </span>
                </div>
                <div className={styles.regionalMiniItem}>
                  <span className={styles.regionalMiniLabel}>Andamento</span>
                  <span className={styles.regionalMiniValue} style={{ color: 'var(--text-accent)' }}>{reg.emAndamento}</span>
                </div>
                <div className={styles.regionalMiniItem}>
                  <span className={styles.regionalMiniLabel}>Paradas</span>
                  <span className={styles.regionalMiniValue} style={{ color: 'var(--risk-atencao-text)' }}>{reg.paralisadas}</span>
                </div>
              </div>

              <div className={styles.regionalProgress}>
                <div className={styles.regionalProgressBar}>
                  <div
                    className={styles.regionalProgressFill}
                    style={{ width: `${Math.min(reg.pctExecucao, 100)}%` }}
                  />
                </div>
                <span className={styles.regionalProgressText}>{reg.pctExecucao}%</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.estadoVazio}>Nenhuma obra encontrada com esses filtros</div>
      )}
    </Layout>
  )
}
