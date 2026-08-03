import Head from 'next/head'
import Link from 'next/link'
import { useState, useMemo } from 'react'
import { useObras } from '@/hooks/useObras'
import { normalizeStatus, formatMoeda, STATUS_LABELS, STATUS_CORES } from '@/lib/format'
import styles from '@/styles/Home.module.css'

export default function Home() {
  const [statusFilter, setStatusFilter] = useState<string>('Todas')
  const [searchTerm, setSearchTerm] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const { obras, isLoading, isError, mutate } = useObras()

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setSyncResult(`${data.stats.inseridosAtualizados} registros atualizados`)
        mutate()
      } else {
        setSyncResult(`Erro: ${data.error}`)
      }
    } catch (err: any) {
      setSyncResult(`Erro de conexão: ${err.message}`)
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncResult(null), 8000)
    }
  }

  // Mapear dados
  const obrasFormatadas = useMemo(() => obras.map(obra => {
    const valorContrato = Number(obra.valor_contrato) || 0
    const valorMedicao = Number(obra.valor_total_medicao) || 0
    const valorAditivo = Number(obra.valor_total_aditivo) || 0
    return {
      id: String(obra.id),
      regional: obra.regional,
      status: normalizeStatus(obra.status),
      valorContrato,
      valorMedicao,
      valorAditivo,
      valorAtual: Number(obra.valor_contrato_com_aditivo) || valorContrato + valorAditivo,
      nome: obra.nome,
      empresa: obra.empresa || '',
      contrato: obra.num_cnt || obra.numero_po || '',
      motivoParalisacao: obra.dsc_paralisacao || obra.motivo_paralisacao || null,
      diasAditivados: Number(obra.numero_dias_aditivados) || 0,
    }
  }), [obras])

  // Filtrar por status (afeta grid de regionais)
  const filtradas = useMemo(() => obrasFormatadas.filter(obra => {
    if (statusFilter !== 'Todas') {
      const statusMap: Record<string, string> = {
        'Em andamento': 'EM_ANDAMENTO',
        'Concluída': 'CONCLUIDA',
        'Paralisada': 'PARALISADA',
        'Em Negociação': 'EM_NEGOCIACAO',
        'Cancelado': 'CANCELADO',
      }
      const targetStatus = statusMap[statusFilter]
      if (targetStatus === 'PARALISADA') {
        // Incluir obras com motivo de paralisação preenchido
        const temParalisacao = obra.motivoParalisacao && obra.motivoParalisacao.trim() !== ''
        if (obra.status !== 'PARALISADA' && !temParalisacao) return false
      } else {
        if (obra.status !== targetStatus) return false
      }
    }
    return true
  }), [obrasFormatadas, statusFilter])

  // Busca global: retorna obras direto
  const resultadosBusca = useMemo(() => {
    if (!searchTerm.trim()) return null
    const s = searchTerm.trim().toLowerCase()
    return obrasFormatadas
      .filter(obra =>
        obra.nome.toLowerCase().includes(s) ||
        (obra.regional || '').toLowerCase().includes(s) ||
        obra.empresa.toLowerCase().includes(s) ||
        obra.contrato.toLowerCase().includes(s)
      )
      .sort((a, b) => b.valorAtual - a.valorAtual)
  }, [obrasFormatadas, searchTerm])

  // Agrupar por regional
  const regionais = useMemo(() => {
    const mapa: Record<string, typeof filtradas> = {}
    filtradas.forEach(obra => {
      const reg = obra.regional || 'Sem regional'
      if (!mapa[reg]) mapa[reg] = []
      mapa[reg].push(obra)
    })

    return Object.entries(mapa)
      .map(([nome, obras]) => {
        const emAndamento = obras.filter(o => o.status === 'EM_ANDAMENTO').length
        const concluidas = obras.filter(o => o.status === 'CONCLUIDA').length
        const paralisadas = obras.filter(o => o.status === 'PARALISADA' || (o.motivoParalisacao && o.motivoParalisacao.trim() !== '')).length
        const valorTotal = obras.reduce((s, o) => s + o.valorContrato, 0)
        const valorMedido = obras.reduce((s, o) => s + o.valorMedicao, 0)
        const pctExecucao = valorTotal > 0 ? Math.round((valorMedido / valorTotal) * 100) : 0

        return { nome, totalObras: obras.length, emAndamento, concluidas, paralisadas, valorTotal, valorMedido, pctExecucao }
      })
      .sort((a, b) => b.totalObras - a.totalObras)
  }, [filtradas])

  // Destaques (sempre sobre o conjunto completo, sem filtro)
  const maioresContratos = useMemo(() =>
    [...obrasFormatadas].sort((a, b) => b.valorAtual - a.valorAtual).slice(0, 5),
  [obrasFormatadas])

  const maisAditivadas = useMemo(() =>
    [...obrasFormatadas]
      .filter(o => o.valorAditivo > 0)
      .sort((a, b) => b.valorAditivo - a.valorAditivo)
      .slice(0, 5),
  [obrasFormatadas])

  const paralisadas = useMemo(() =>
    [...obrasFormatadas]
      .filter(o => o.status === 'PARALISADA' || (o.motivoParalisacao && o.motivoParalisacao.trim() !== ''))
      .sort((a, b) => b.valorContrato - a.valorContrato)
      .slice(0, 5),
  [obrasFormatadas])

  // Contagens gerais
  const contagens: Record<string, number> = {}
  obrasFormatadas.forEach(obra => {
    // Contar como PARALISADA se tem motivo de paralisação preenchido
    const statusEfetivo = (obra.motivoParalisacao && obra.motivoParalisacao.trim() !== '' && obra.status !== 'CONCLUIDA')
      ? 'PARALISADA'
      : obra.status
    contagens[statusEfetivo] = (contagens[statusEfetivo] || 0) + 1
  })

  const totalObras = obrasFormatadas.length
  const emAndamento = contagens['EM_ANDAMENTO'] || 0
  const valorTotalContratos = obrasFormatadas.reduce((sum, o) => sum + o.valorContrato, 0)
  const valorTotalAditivos = obrasFormatadas.reduce((sum, o) => sum + o.valorAditivo, 0)
  const valorTotalMedicao = obrasFormatadas.reduce((sum, o) => sum + o.valorMedicao, 0)

  if (isError) {
    return (
      <div className={styles.app}>
        <header className={styles.header}>
          <div className={styles.container}>
            <h1>ObrasBH</h1>
            <p>Fiscalize, vote e acompanhe as obras da sua cidade</p>
          </div>
        </header>
        <main className={styles.container}>
          <div style={{ padding: '3rem 1rem', color: 'var(--text-danger)' }}>
            <strong>Erro ao carregar dados:</strong> Verifique se o Supabase está configurado corretamente.
          </div>
        </main>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>ObrasBH — Transparência em Obras Públicas de Belo Horizonte</title>
        <meta name="description" content="Acompanhe obras públicas de BH: valores, aditivos, medições, paralisações e prazos" />
      </Head>

      <div className={styles.app}>
        <header className={styles.header}>
          <div className={styles.container}>
            <h1>ObrasBH</h1>
            <p>Fiscalize, vote e acompanhe as obras da sua cidade</p>
            {isLoading && <p style={{ fontSize: '14px', opacity: 0.8 }}>Carregando dados...</p>}
          </div>
        </header>

        <main className={styles.container}>

          {/* KPIs */}
          <div className={styles.kpis}>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Contratos</div>
              <div className={styles.kpiValue}>{isLoading ? '...' : totalObras}</div>
              <div className={styles.kpiExtra}>
                {isLoading ? 'registrados na SMOBI' : `${emAndamento} em andamento`}
              </div>
            </div>

            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Valor contratado</div>
              <div className={styles.kpiValue}>{isLoading ? '...' : formatMoeda(valorTotalContratos)}</div>
              <div className={styles.kpiExtra}>valores originais</div>
            </div>

            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>
                Aditivos
                <span className={styles.infoIcon} tabIndex={0}>
                  i
                  <span className={styles.infoTooltip}>
                    Quanto os contratos cresceram além do valor original, por renovações e aditivos. Um valor alto pode indicar obras que ficaram bem mais caras do que o combinado.
                  </span>
                </span>
              </div>
              <div className={styles.kpiValue} style={{ color: 'var(--text-warning)' }}>
                {isLoading ? '...' : `+${formatMoeda(valorTotalAditivos)}`}
              </div>
              <div className={styles.kpiExtra}>
                {valorTotalContratos > 0
                  ? `+${Math.round((valorTotalAditivos / valorTotalContratos) * 100)}% sobre o contratado`
                  : 'sobre o contratado'}
              </div>
            </div>

            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>
                Valor medido
                <span className={styles.infoIcon} tabIndex={0}>
                  i
                  <span className={styles.infoTooltip}>
                    Quanto do serviço contratado já foi executado, conferido por um fiscal e aprovado para pagamento. Quanto mais próximo do valor total, mais perto da conclusão.
                  </span>
                </span>
              </div>
              <div className={styles.kpiValue} style={{ color: 'var(--text-success)' }}>
                {isLoading ? '...' : formatMoeda(valorTotalMedicao)}
              </div>
              <div className={styles.kpiExtra}>
                {valorTotalContratos > 0
                  ? `${Math.round((valorTotalMedicao / valorTotalContratos) * 100)}% executado`
                  : 'do total'}
              </div>
            </div>
          </div>

          <input
            type="text"
            placeholder="Buscar obra, empresa, contrato ou regional..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
            disabled={isLoading}
          />

          {/* Resultados de busca — vão direto pra página da obra */}
          {resultadosBusca !== null ? (
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
                {resultadosBusca.length} {resultadosBusca.length === 1 ? 'obra encontrada' : 'obras encontradas'}
              </div>
              <div className={styles.buscaLista}>
                {resultadosBusca.slice(0, 30).map(obra => {
                  const cor = STATUS_CORES[obra.status] || { bg: '#f0f0f0', text: '#333' }
                  return (
                    <Link key={obra.id} href={`/obra/${obra.id}`} className={styles.buscaItem}>
                      <div className={styles.buscaItemTexto}>
                        <span className={styles.buscaItemNome}>{obra.nome}</span>
                        <span className={styles.buscaItemMeta}>
                          {obra.regional || 'Sem regional'}
                          {obra.empresa && ` · ${obra.empresa}`}
                        </span>
                      </div>
                      <div className={styles.buscaItemDireita}>
                        <span className={styles.buscaItemValor}>
                          {obra.valorAtual > 0 ? formatMoeda(obra.valorAtual) : '—'}
                        </span>
                        <span
                          className={styles.status}
                          style={{ backgroundColor: cor.bg, color: cor.text }}
                        >
                          {STATUS_LABELS[obra.status] || obra.status}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
              {resultadosBusca.length > 30 && (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Mostrando as 30 de maior valor — refine a busca para ver outras.
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Destaques */}
              {!isLoading && obrasFormatadas.length > 0 && (
                <div className={styles.destaques}>
                  <div className={styles.destaqueCard}>
                    <h3 className={styles.destaqueTitulo}>Maiores contratos</h3>
                    {maioresContratos.map((obra, i) => (
                      <Link key={obra.id} href={`/obra/${obra.id}`} className={styles.destaqueItem}>
                        <span className={styles.destaqueRank}>{i + 1}</span>
                        <span className={styles.destaqueNome}>{obra.nome}</span>
                        <span className={styles.destaqueValor}>{formatMoeda(obra.valorAtual)}</span>
                      </Link>
                    ))}
                  </div>

                  <div className={styles.destaqueCard}>
                    <h3 className={styles.destaqueTitulo}>Mais aditivadas</h3>
                    {maisAditivadas.length === 0 ? (
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Nenhum aditivo registrado.</p>
                    ) : maisAditivadas.map((obra, i) => (
                      <Link key={obra.id} href={`/obra/${obra.id}`} className={styles.destaqueItem}>
                        <span className={styles.destaqueRank}>{i + 1}</span>
                        <span className={styles.destaqueNome}>{obra.nome}</span>
                        <span className={styles.destaqueValor} style={{ color: 'var(--text-warning)' }}>
                          +{formatMoeda(obra.valorAditivo)}
                        </span>
                      </Link>
                    ))}
                  </div>

                  <div className={styles.destaqueCard}>
                    <h3 className={styles.destaqueTitulo}>Paralisadas de maior valor</h3>
                    {paralisadas.length === 0 ? (
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Nenhuma obra paralisada.</p>
                    ) : paralisadas.map((obra, i) => (
                      <Link key={obra.id} href={`/obra/${obra.id}`} className={styles.destaqueItem}>
                        <span className={styles.destaqueRank}>{i + 1}</span>
                        <span className={styles.destaqueNome}>
                          {obra.nome}
                          {obra.motivoParalisacao && (
                            <span className={styles.destaqueMotivo}>{obra.motivoParalisacao}</span>
                          )}
                        </span>
                        <span className={styles.destaqueValor}>{formatMoeda(obra.valorContrato)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <h2 className={styles.secaoHome}>Obras por regional</h2>

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
                      <span style={{ marginLeft: 4, opacity: 0.6, fontSize: '11px' }}>
                        {contagens[
                          ({ 'Em andamento': 'EM_ANDAMENTO', 'Concluída': 'CONCLUIDA', 'Paralisada': 'PARALISADA', 'Em Negociação': 'EM_NEGOCIACAO', 'Cancelado': 'CANCELADO' } as Record<string, string>)[status] || ''
                        ] || 0}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
                {filtradas.length} {filtradas.length === 1 ? 'obra' : 'obras'} em {regionais.length} {regionais.length === 1 ? 'regional' : 'regionais'}
              </div>

              {/* Grid de Regionais */}
              {isLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                  Carregando obras de Belo Horizonte...
                </div>
              ) : regionais.length > 0 ? (
                <div className={styles.regionaisGrid}>
                  {regionais.map(reg => (
                    <Link
                      key={reg.nome}
                      href={`/regional/${encodeURIComponent(reg.nome)}`}
                      className={styles.regionalCard}
                    >
                      <div className={styles.regionalNome}>{reg.nome || 'Sem regional'}</div>
                      <div className={styles.regionalContagem}>
                        {reg.totalObras} {reg.totalObras === 1 ? 'obra' : 'obras'}
                      </div>

                      <div className={styles.regionalMini}>
                        <div className={styles.regionalMiniItem}>
                          <span className={styles.regionalMiniLabel}>Valor</span>
                          <span className={styles.regionalMiniValue}>{formatMoeda(reg.valorTotal)}</span>
                        </div>
                        <div className={styles.regionalMiniItem}>
                          <span className={styles.regionalMiniLabel}>Medido</span>
                          <span className={styles.regionalMiniValue} style={{ color: 'var(--text-success, #3b6d11)' }}>
                            {formatMoeda(reg.valorMedido)}
                          </span>
                        </div>
                        <div className={styles.regionalMiniItem}>
                          <span className={styles.regionalMiniLabel}>Andamento</span>
                          <span className={styles.regionalMiniValue} style={{ color: 'var(--text-accent)' }}>{reg.emAndamento}</span>
                        </div>
                        <div className={styles.regionalMiniItem}>
                          <span className={styles.regionalMiniLabel}>Concluídas</span>
                          <span className={styles.regionalMiniValue} style={{ color: 'var(--text-success)' }}>{reg.concluidas}</span>
                        </div>
                      </div>

                      <div className={styles.regionalProgress}>
                        <div className={styles.regionalProgressBar}>
                          <div
                            className={styles.regionalProgressFill}
                            style={{ width: `${reg.pctExecucao}%` }}
                          />
                        </div>
                        <span className={styles.regionalProgressText}>{reg.pctExecucao}%</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                  Nenhuma obra encontrada com esses filtros
                </div>
              )}
            </>
          )}

        </main>

        <footer className={styles.footer}>
          <p>
            <strong>ObrasBH</strong> — Transparência para uma cidade melhor
          </p>
          <p>
            Dados sincronizados do painel Transparência Obras Públicas da SMOBI/PBH.
          </p>

          <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                padding: '8px 20px',
                fontSize: '13px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                background: syncing ? 'var(--surface-0)' : 'var(--surface-2)',
                color: 'var(--text-primary)',
                cursor: syncing ? 'wait' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {syncing ? 'Sincronizando...' : 'Atualizar dados da PBH'}
            </button>
            {syncResult && (
              <span style={{ fontSize: '12px', color: syncResult.startsWith('Erro') ? 'var(--text-danger)' : 'var(--text-success)' }}>
                {syncResult}
              </span>
            )}
          </div>

          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1rem' }}>
            Fonte: CSV CONTRATOS-SGEE — Atualização semanal pela PBH
          </p>
        </footer>
      </div>
    </>
  )
}
