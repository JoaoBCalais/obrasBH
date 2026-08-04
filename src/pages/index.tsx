import Link from 'next/link'
import { useState, useMemo } from 'react'
import { Layout } from '@/components/Layout'
import { useObras } from '@/hooks/useObras'
import { analisarObra, analisarEmpresas, AnaliseRisco, NIVEL_LABELS, LIMITE_LEGAL_ADITIVO_PCT } from '@/lib/risco'
import { normalizeStatus, formatMoeda, STATUS_LABELS, STATUS_CORES } from '@/lib/format'
import styles from '@/styles/Home.module.css'

/** Piso de valor para entrar no ranking de aditivos, em reais.
 *  Sem ele, uma obra de R$ 20 mil com +400% dominaria a lista. */
const PISO_ADITIVO = 500_000

/** "parada há 2 anos" / "há 7 meses" / "há 12 dias" — ou aviso quando a PBH não informou a data. */
function formatTempoParada(dias: number | null): string {
  if (dias === null) return 'sem data'
  if (dias < 30) return `há ${dias}d`
  const meses = Math.round(dias / 30)
  if (meses < 12) return `há ${meses} ${meses === 1 ? 'mês' : 'meses'}`
  const anos = Math.floor(dias / 365)
  const resto = Math.round((dias % 365) / 30)
  if (resto === 0) return `há ${anos} ${anos === 1 ? 'ano' : 'anos'}`
  return `há ${anos}a ${resto}m`
}

export default function Home() {
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

  // Análise de indícios de todas as obras (uma vez por carga)
  const analises = useMemo(() => {
    const mapa = new Map<number, AnaliseRisco>()
    obras.forEach(o => mapa.set(o.id, analisarObra(o)))
    return mapa
  }, [obras])

  // Mapear dados
  const obrasFormatadas = useMemo(() => obras.map(obra => {
    const valorContrato = Number(obra.valor_contrato) || 0
    const valorMedicao = Number(obra.valor_total_medicao) || 0
    const valorAditivo = Number(obra.valor_total_aditivo) || 0
    return {
      id: String(obra.id),
      idNum: obra.id,
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
      dataParalisacao: obra.data_paralisacao || null,
      diasAditivados: Number(obra.numero_dias_aditivados) || 0,
    }
  }), [obras])

  // Resumo de risco
  const risco = useMemo(() => {
    let criticas = 0
    let atencao = 0
    let valorSobAlerta = 0
    let aditivosAcima = 0
    obrasFormatadas.forEach(o => {
      const a = analises.get(o.idNum)
      if (!a) return
      if (a.nivel === 'critico') { criticas++; valorSobAlerta += o.valorAtual }
      else if (a.nivel === 'atencao') { atencao++; valorSobAlerta += o.valorAtual }
      if (a.alertas.some(al => al.id === 'aditivo_acima_limite')) aditivosAcima++
    })
    return { criticas, atencao, valorSobAlerta, aditivosAcima }
  }, [obrasFormatadas, analises])

  // Top obras críticas para o bloco de destaque da home
  const topCriticas = useMemo(() =>
    obrasFormatadas
      .map(o => ({ obra: o, analise: analises.get(o.idNum) }))
      .filter(x => x.analise && x.analise.alertas.length > 0)
      .sort((a, b) => (b.analise!.score - a.analise!.score))
      .slice(0, 3),
  [obrasFormatadas, analises])

  // Top empresas para acompanhar
  const topEmpresas = useMemo(() =>
    analisarEmpresas(obras, analises).filter(e => e.flags.length > 0).slice(0, 3),
  [obras, analises])

  // Busca global
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

  // Faixa compacta de regionais
  const regionais = useMemo(() => {
    const mapa: Record<string, { total: number; alertas: number; valor: number }> = {}
    obrasFormatadas.forEach(obra => {
      const reg = obra.regional || 'Sem regional'
      if (!mapa[reg]) mapa[reg] = { total: 0, alertas: 0, valor: 0 }
      mapa[reg].total++
      mapa[reg].valor += obra.valorContrato
      const a = analises.get(obra.idNum)
      if (a && (a.nivel === 'critico' || a.nivel === 'atencao')) mapa[reg].alertas++
    })
    return Object.entries(mapa)
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.total - a.total)
  }, [obrasFormatadas, analises])

  // ===== Rankings =====
  // Maiores contratos: ordenados por valor, mas a barra mostra a EXECUÇÃO,
  // revelando de relance a obra cara que quase não saiu do papel.
  const maioresContratos = useMemo(() =>
    [...obrasFormatadas]
      .sort((a, b) => b.valorAtual - a.valorAtual)
      .slice(0, 5)
      .map(o => ({
        ...o,
        execucaoPct: o.valorAtual > 0 ? Math.min((o.valorMedicao / o.valorAtual) * 100, 100) : 0,
      })),
  [obrasFormatadas])

  // Mais aditivadas: por PERCENTUAL de acréscimo — é aí que mora o indício.
  // Piso de valor evita que uma obra minúscula com +400% domine a lista.
  const maisAditivadas = useMemo(() => {
    const lista = obrasFormatadas
      .filter(o => o.valorAditivo > 0 && o.valorContrato >= PISO_ADITIVO)
      .map(o => ({ ...o, aditivoPct: (o.valorAditivo / o.valorContrato) * 100 }))
      .sort((a, b) => b.aditivoPct - a.aditivoPct)
      .slice(0, 5)
    const max = lista.length > 0 ? lista[0].aditivoPct : 1
    return lista.map(o => ({ ...o, barraPct: max > 0 ? (o.aditivoPct / max) * 100 : 0 }))
  }, [obrasFormatadas])

  // Paralisadas: por TEMPO PARADA. Obra parada há 3 anos importa mais que
  // obra cara parada semana passada. Sem data de paralisação vai para o fim.
  const paralisadas = useMemo(() => {
    const hoje = Date.now()
    const lista = obrasFormatadas
      .filter(o => o.status === 'PARALISADA' || (o.motivoParalisacao && o.motivoParalisacao.trim() !== ''))
      .map(o => {
        const dt = o.dataParalisacao ? new Date(`${String(o.dataParalisacao).slice(0, 10)}T12:00:00`) : null
        const valida = dt && !isNaN(dt.getTime())
        const dias = valida ? Math.max(Math.round((hoje - dt!.getTime()) / 86400000), 0) : null
        return { ...o, diasParada: dias }
      })
      .sort((a, b) => {
        if (a.diasParada === null && b.diasParada === null) return b.valorContrato - a.valorContrato
        if (a.diasParada === null) return 1
        if (b.diasParada === null) return -1
        return b.diasParada - a.diasParada
      })
      .slice(0, 5)
    const max = lista.reduce((m, o) => Math.max(m, o.diasParada || 0), 0)
    return lista.map(o => ({ ...o, barraPct: max > 0 && o.diasParada ? (o.diasParada / max) * 100 : 0 }))
  }, [obrasFormatadas])

  // ===== Fluxo do dinheiro (barras do panorama) =====
  const fluxo = useMemo(() => {
    const contratado = obrasFormatadas.reduce((s, o) => s + o.valorContrato, 0)
    const aditivos = obrasFormatadas.reduce((s, o) => s + o.valorAditivo, 0)
    const medido = obrasFormatadas.reduce((s, o) => s + o.valorMedicao, 0)
    const atual = contratado + aditivos
    const pct = (v: number) => (atual > 0 ? Math.min((v / atual) * 100, 100) : 0)
    return {
      contratado, aditivos, medido, atual,
      contratadoPct: pct(contratado),
      aditivosPct: pct(aditivos),
      medidoPct: pct(medido),
      aditivoSobreContratado: contratado > 0 ? (aditivos / contratado) * 100 : 0,
      execucaoSobreAtual: atual > 0 ? (medido / atual) * 100 : 0,
    }
  }, [obrasFormatadas])

  const paradasTotal = obrasFormatadas.filter(
    o => o.status === 'PARALISADA' || (o.motivoParalisacao && o.motivoParalisacao.trim() !== '')
  ).length
  const totalObras = obrasFormatadas.length
  const emAndamento = obrasFormatadas.filter(o => o.status === 'EM_ANDAMENTO').length
  const valorTotalContratos = obrasFormatadas.reduce((sum, o) => sum + o.valorContrato, 0)
  const valorTotalAditivos = obrasFormatadas.reduce((sum, o) => sum + o.valorAditivo, 0)
  const valorTotalMedicao = obrasFormatadas.reduce((sum, o) => sum + o.valorMedicao, 0)

  const hero = (
    <div className={styles.hero}>
      <h1 className={styles.heroTitulo}>As obras de BH, sob os olhos de todo mundo</h1>
      <p className={styles.heroSub}>
        Valores, aditivos, medições, paralisações e prazos de{' '}
        {isLoading ? '...' : totalObras} contratos públicos — direto dos dados abertos da Prefeitura.
      </p>
    </div>
  )

  if (isError) {
    return (
      <Layout title="ObrasBH — erro">
        <div style={{ padding: '3rem 0', color: 'var(--text-danger)' }}>
          <strong>Erro ao carregar dados:</strong> verifique se o Supabase está configurado corretamente.
        </div>
      </Layout>
    )
  }

  return (
    <Layout
      description="Acompanhe obras públicas de BH: valores, aditivos, medições, paralisações e prazos"
      alertasCriticos={risco.criticas}
      hero={hero}
    >
      {/* ===== Busca em destaque ===== */}
      <div className={styles.buscaTopo}>
        <span className={styles.buscaIcone} aria-hidden="true">⌕</span>
        <input
          type="text"
          placeholder="Buscar obra, empresa, contrato ou regional..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
          disabled={isLoading}
          aria-label="Buscar obra"
        />
        {searchTerm && (
          <button className={styles.buscaLimpar} onClick={() => setSearchTerm('')} aria-label="Limpar busca">
            ×
          </button>
        )}
      </div>

      {resultadosBusca !== null ? (
        <div>
          <div className={styles.contagemResultados}>
            {resultadosBusca.length} {resultadosBusca.length === 1 ? 'obra encontrada' : 'obras encontradas'}
          </div>
          <div className={styles.buscaLista}>
            {resultadosBusca.slice(0, 30).map(obra => {
              const cor = STATUS_CORES[obra.status] || { bg: '#f0f0f0', text: '#333' }
              const a = analises.get(obra.idNum)
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
                    {a && (a.nivel === 'critico' || a.nivel === 'atencao') && (
                      <span className={styles.chipNivel} data-nivel={a.nivel}>
                        ⚠ {NIVEL_LABELS[a.nivel]}
                      </span>
                    )}
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
            <p className={styles.contagemResultados}>
              Mostrando as 30 de maior valor — refine a busca para ver outras.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* ===== Bloco principal: obras críticas ===== */}
          {!isLoading && (topCriticas.length > 0 || topEmpresas.length > 0) && (
            <div className={styles.painelDuplo}>
            {topCriticas.length > 0 && (
            <section className={styles.painelCritico}>
              <div className={styles.painelCriticoTopo}>
                <div>
                  <h2 className={styles.painelCriticoTitulo}>
                    <span aria-hidden="true">⚠</span> Obras que pedem atenção agora
                  </h2>
                  <p className={styles.painelCriticoSub}>
                    {risco.criticas} em nível crítico e {risco.atencao} em atenção — {formatMoeda(risco.valorSobAlerta)}{' '}
                    em contratos com indícios de aditivo excessivo, atraso ou falta de transparência.
                  </p>
                </div>
                <Link href="/criticas" className={styles.painelCriticoCta}>
                  Ver todas →
                </Link>
              </div>

              <div className={styles.criticasGrid}>
                {topCriticas.map(({ obra, analise }) => {
                  const principal = analise!.alertas[0]
                  return (
                    <Link key={obra.id} href={`/obra/${obra.id}`} className={styles.criticaCard} data-nivel={analise!.nivel}>
                      <div className={styles.criticaCardTopo}>
                        <span className={styles.criticaScore} data-nivel={analise!.nivel}>
                          {analise!.score}
                        </span>
                        <span className={styles.chipNivel} data-nivel={analise!.nivel}>
                          {NIVEL_LABELS[analise!.nivel]}
                        </span>
                      </div>
                      <div className={styles.criticaNome}>{obra.nome}</div>
                      <div className={styles.criticaMeta}>
                        {obra.regional || 'Sem regional'}
                        {obra.valorAtual > 0 && ` · ${formatMoeda(obra.valorAtual)}`}
                      </div>
                      {principal && (
                        <div className={styles.criticaMotivo}>{principal.titulo}</div>
                      )}
                      <div className={styles.criticaQtd}>
                        {analise!.alertas.length} {analise!.alertas.length === 1 ? 'indício' : 'indícios'}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
            )}

            {topEmpresas.length > 0 && (
            <section className={styles.painelEmpresas}>
              <div className={styles.painelCriticoTopo}>
                <div>
                  <h2 className={styles.painelEmpresasTitulo}>
                    <span aria-hidden="true">▤</span> Empresas para acompanhar
                  </h2>
                  <p className={styles.painelCriticoSub}>
                    Quem concentra contratos, aditivos recorrentes ou obras com alerta.
                  </p>
                </div>
                <Link href="/empresas" className={styles.painelCriticoCta}>
                  Ver todas →
                </Link>
              </div>

              <div className={styles.empresasMini}>
                {topEmpresas.map(e => (
                  <Link
                    key={e.empresa}
                    href={`/empresas?q=${encodeURIComponent(e.empresa)}`}
                    className={styles.empresaMiniCard}
                  >
                    <span className={styles.empresaMiniNome}>{e.empresa}</span>
                    <span className={styles.empresaMiniMeta}>
                      {e.contratos} {e.contratos === 1 ? 'contrato' : 'contratos'} ·{' '}
                      {formatMoeda(e.valorTotal)}
                      {e.valorAditivos > 0 && (
                        <span className={styles.empresaMiniAditivo}>
                          {' '}· +{Math.round(e.aditivoPct)}% em aditivos
                        </span>
                      )}
                    </span>
                    <span className={styles.empresaMiniFlag}>⚠ {e.flags[0]}</span>
                  </Link>
                ))}
              </div>
            </section>
            )}
            </div>
          )}

          {/* ===== Panorama: KPIs + fluxo do dinheiro ===== */}
          <h2 className={styles.secaoHome}>O panorama em números</h2>

          <div className={styles.kpis}>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Contratos</div>
              <div className={styles.kpiValue}>{isLoading ? '...' : totalObras}</div>
              <div className={styles.kpiExtra}>
                {isLoading ? 'registrados na SMOBI' : `${emAndamento} em andamento`}
              </div>
            </div>

            <div className={styles.kpi} data-tom="critico">
              <div className={styles.kpiLabel}>Nível crítico</div>
              <div className={styles.kpiValue} style={{ color: 'var(--risk-critico-text)' }}>
                {isLoading ? '...' : risco.criticas}
              </div>
              <div className={styles.kpiExtra}>obras com indícios fortes</div>
            </div>

            <div className={styles.kpi} data-tom="critico">
              <div className={styles.kpiLabel}>Valor sob alerta</div>
              <div className={styles.kpiValue} style={{ color: 'var(--risk-critico-text)' }}>
                {isLoading ? '...' : formatMoeda(risco.valorSobAlerta)}
              </div>
              <div className={styles.kpiExtra}>crítico + atenção</div>
            </div>

            <div className={styles.kpi} data-tom="atencao">
              <div className={styles.kpiLabel}>Obras paradas</div>
              <div className={styles.kpiValue} style={{ color: 'var(--risk-atencao-text)' }}>
                {isLoading ? '...' : paradasTotal}
              </div>
              <div className={styles.kpiExtra}>paralisadas ou com motivo registrado</div>
            </div>
          </div>

          {/* Fluxo do dinheiro — duas barras na mesma régua */}
          {!isLoading && fluxo.atual > 0 && (
            <section className={styles.fluxo}>
              <h3 className={styles.fluxoTitulo}>Para onde vai o dinheiro</h3>

              {/* Barra 1: quanto custa (original + aditivos) */}
              <div className={styles.fluxoBloco}>
                <div className={styles.fluxoBlocoTopo}>
                  <span className={styles.fluxoBlocoLabel}>Quanto os contratos custam hoje</span>
                  <span className={styles.fluxoBlocoValor}>{formatMoeda(fluxo.atual)}</span>
                </div>

                <div className={styles.fluxoTrilho}>
                  <span
                    className={styles.fluxoSeg}
                    data-tipo="original"
                    style={{ width: `${fluxo.contratadoPct}%` }}
                  />
                  <span
                    className={styles.fluxoSeg}
                    data-tipo="aditivo"
                    style={{ width: `${fluxo.aditivosPct}%` }}
                  />
                </div>

                <div className={styles.fluxoLegendas}>
                  <span className={styles.fluxoLegendaItem}>
                    <span className={styles.fluxoPonto} data-tipo="original" />
                    Valor original: <strong>{formatMoeda(fluxo.contratado)}</strong>
                  </span>
                  <span className={styles.fluxoLegendaItem}>
                    <span className={styles.fluxoPonto} data-tipo="aditivo" />
                    Aditivos: <strong>+{formatMoeda(fluxo.aditivos)}</strong>{' '}
                    (+{Math.round(fluxo.aditivoSobreContratado)}% sobre o original)
                  </span>
                </div>
              </div>

              {/* Barra 2: quanto disso virou obra */}
              <div className={styles.fluxoBloco}>
                <div className={styles.fluxoBlocoTopo}>
                  <span className={styles.fluxoBlocoLabel}>Quanto disso já virou obra</span>
                  <span className={styles.fluxoBlocoValor} style={{ color: 'var(--text-success)' }}>
                    {Math.round(fluxo.execucaoSobreAtual)}%
                  </span>
                </div>

                <div className={styles.fluxoTrilho}>
                  <span
                    className={styles.fluxoSeg}
                    data-tipo="medido"
                    style={{ width: `${fluxo.medidoPct}%` }}
                  />
                </div>

                <div className={styles.fluxoLegendas}>
                  <span className={styles.fluxoLegendaItem}>
                    <span className={styles.fluxoPonto} data-tipo="medido" />
                    Medido e aprovado por um fiscal: <strong>{formatMoeda(fluxo.medido)}</strong>
                  </span>
                  <span className={styles.fluxoLegendaItem}>
                    <span className={styles.fluxoPonto} data-tipo="falta" />
                    Ainda por executar: <strong>{formatMoeda(Math.max(fluxo.atual - fluxo.medido, 0))}</strong>
                  </span>
                </div>
              </div>

              <p className={styles.fluxoLegenda}>
                As duas barras usam a mesma régua: a largura cheia equivale a{' '}
                {formatMoeda(fluxo.atual)}, o custo total dos contratos hoje.
                {risco.aditivosAcima > 0 && (
                  <> Do conjunto, <strong>{risco.aditivosAcima}</strong>{' '}
                  {risco.aditivosAcima === 1 ? 'obra passou' : 'obras passaram'} do limite de
                  referência de {LIMITE_LEGAL_ADITIVO_PCT}% para aditivos.</>
                )}
              </p>
            </section>
          )}

          {/* ===== Rankings ===== */}
          {!isLoading && obrasFormatadas.length > 0 && (
            <>
              <h2 className={styles.secaoHome}>Rankings</h2>
              <div className={styles.destaques}>
                {/* Maiores contratos — a barra mostra a execução, não o valor */}
                <div className={styles.destaqueCard}>
                  <h3 className={styles.destaqueTitulo}>Maiores contratos</h3>
                  <p className={styles.destaqueSub}>barra = quanto já foi executado</p>
                  {maioresContratos.map((obra, i) => (
                    <Link key={obra.id} href={`/obra/${obra.id}`} className={styles.rankItem}>
                      <span className={styles.rankTopo}>
                        <span className={styles.destaqueRank}>{i + 1}</span>
                        <span className={styles.rankNome}>{obra.nome}</span>
                        <span className={styles.destaqueValor}>{formatMoeda(obra.valorAtual)}</span>
                      </span>
                      <span className={styles.rankBarraLinha}>
                        <span className={styles.rankTrilho}>
                          <span
                            className={styles.rankBarra}
                            data-tipo="execucao"
                            style={{ width: `${obra.execucaoPct}%` }}
                          />
                        </span>
                        <span className={styles.rankMetrica}>{Math.round(obra.execucaoPct)}% executado</span>
                      </span>
                    </Link>
                  ))}
                </div>

                {/* Mais aditivadas — por % de acréscimo, com piso de valor */}
                <div className={styles.destaqueCard}>
                  <h3 className={styles.destaqueTitulo}>Mais aditivadas</h3>
                  <p className={styles.destaqueSub}>
                    por % de acréscimo · contratos acima de {formatMoeda(PISO_ADITIVO)}
                  </p>
                  {maisAditivadas.length === 0 ? (
                    <p className={styles.mutedText}>Nenhum aditivo registrado nessa faixa.</p>
                  ) : maisAditivadas.map((obra, i) => (
                    <Link key={obra.id} href={`/obra/${obra.id}`} className={styles.rankItem}>
                      <span className={styles.rankTopo}>
                        <span className={styles.destaqueRank}>{i + 1}</span>
                        <span className={styles.rankNome}>{obra.nome}</span>
                        <span
                          className={styles.destaqueValor}
                          style={{
                            color: obra.aditivoPct > LIMITE_LEGAL_ADITIVO_PCT
                              ? 'var(--risk-critico-text)'
                              : 'var(--text-warning)',
                          }}
                        >
                          +{Math.round(obra.aditivoPct)}%
                        </span>
                      </span>
                      <span className={styles.rankBarraLinha}>
                        <span className={styles.rankTrilho}>
                          <span
                            className={styles.rankBarra}
                            data-tipo={obra.aditivoPct > LIMITE_LEGAL_ADITIVO_PCT ? 'critico' : 'aditivo'}
                            style={{ width: `${obra.barraPct}%` }}
                          />
                        </span>
                        <span className={styles.rankMetrica}>+{formatMoeda(obra.valorAditivo)}</span>
                      </span>
                    </Link>
                  ))}
                </div>

                {/* Paralisadas — por tempo parada */}
                <div className={styles.destaqueCard}>
                  <h3 className={styles.destaqueTitulo}>Paradas há mais tempo</h3>
                  <p className={styles.destaqueSub}>barra = tempo desde a paralisação</p>
                  {paralisadas.length === 0 ? (
                    <p className={styles.mutedText}>Nenhuma obra paralisada.</p>
                  ) : paralisadas.map((obra, i) => (
                    <Link key={obra.id} href={`/obra/${obra.id}`} className={styles.rankItem}>
                      <span className={styles.rankTopo}>
                        <span className={styles.destaqueRank}>{i + 1}</span>
                        <span className={styles.rankNome}>
                          {obra.nome}
                          {obra.motivoParalisacao && (
                            <span className={styles.destaqueMotivo}>{obra.motivoParalisacao}</span>
                          )}
                        </span>
                        <span className={styles.destaqueValor} style={{ color: 'var(--risk-atencao-text)' }}>
                          {formatTempoParada(obra.diasParada)}
                        </span>
                      </span>
                      <span className={styles.rankBarraLinha}>
                        <span className={styles.rankTrilho}>
                          <span
                            className={styles.rankBarra}
                            data-tipo="parada"
                            style={{ width: `${obra.barraPct}%` }}
                          />
                        </span>
                        <span className={styles.rankMetrica}>{formatMoeda(obra.valorContrato)}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ===== Faixa compacta de regionais ===== */}
          {!isLoading && regionais.length > 0 && (
            <section className={styles.faixaRegionais}>
              <div className={styles.faixaTopo}>
                <h2 className={styles.secaoHome} style={{ margin: 0 }}>Por regional</h2>
                <Link href="/regionais" className={styles.painelCriticoCta}>Ver todas →</Link>
              </div>
              <div className={styles.faixaLista}>
                {regionais.map(reg => (
                  <Link
                    key={reg.nome}
                    href={`/regional/${encodeURIComponent(reg.nome)}`}
                    className={styles.faixaChip}
                  >
                    <span className={styles.faixaChipNome}>{reg.nome}</span>
                    <span className={styles.faixaChipMeta}>
                      {reg.total} {reg.total === 1 ? 'obra' : 'obras'}
                    </span>
                    {reg.alertas > 0 && (
                      <span className={styles.faixaChipAlerta}>⚠ {reg.alertas}</span>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Sincronização */}
      <div className={styles.syncArea}>
        <button onClick={handleSync} disabled={syncing} className={styles.syncBtn}>
          {syncing ? 'Sincronizando...' : 'Atualizar dados da PBH'}
        </button>
        {syncResult && (
          <span
            className={styles.syncResultado}
            style={{ color: syncResult.startsWith('Erro') ? 'var(--text-danger)' : 'var(--text-success)' }}
          >
            {syncResult}
          </span>
        )}
        <p className={styles.syncFonte}>
          Fonte: CSV CONTRATOS-SGEE — atualização semanal pela PBH
        </p>
      </div>
    </Layout>
  )
}
