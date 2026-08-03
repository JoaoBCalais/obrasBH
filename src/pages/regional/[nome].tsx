import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useMemo } from 'react'
import { CardObra } from '@/components/CardObra'
import { useObras } from '@/hooks/useObras'
import { STATUS_LABELS, STATUS_CORES, normalizeStatus, formatMoeda } from '@/lib/format'
import styles from '@/styles/Home.module.css'
import tabela from '@/styles/TabelaObras.module.css'

type Ordenacao = 'valor' | 'aditivo' | 'medido' | 'execucao' | 'atraso' | 'nome'

export default function RegionalPage() {
  const router = useRouter()
  const { nome } = router.query
  const nomeRegional = typeof nome === 'string' ? decodeURIComponent(nome) : ''

  const [statusFilter, setStatusFilter] = useState<string>('Todas')
  const [searchTerm, setSearchTerm] = useState('')
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [visao, setVisao] = useState<'cards' | 'tabela'>('cards')
  const [ordem, setOrdem] = useState<Ordenacao>('valor')
  const [ordemAsc, setOrdemAsc] = useState(false)
  const ITENS_POR_PAGINA = 12
  const { obras, isLoading, isError } = useObras()

  // Formatar obras
  const obrasFormatadas = useMemo(() => obras.map(obra => {
    const valorContrato = Number(obra.valor_contrato) || 0
    const valorMedicao = Number(obra.valor_total_medicao) || 0
    const dataInicio = obra.data_inicio_cnt ? new Date(obra.data_inicio_cnt) : null
    const dataFimOriginal = obra.data_fim_cnt_original ? new Date(obra.data_fim_cnt_original) : null
    const dataFimComAditivos = obra.data_fim_cnt_com_aditivos ? new Date(obra.data_fim_cnt_com_aditivos) : null

    const pctExecucao = valorContrato > 0
      ? Math.min(Math.round((valorMedicao / valorContrato) * 100), 100)
      : 0

    let custoDia = 0
    if (dataInicio && valorMedicao > 0) {
      const diasCorridos = Math.max(1, Math.ceil(
        (Date.now() - dataInicio.getTime()) / (1000 * 60 * 60 * 24)
      ))
      custoDia = Math.round(valorMedicao / diasCorridos)
    }

    return {
      id: String(obra.id),
      id_area_empreendimento: obra.id_area_empreendimento,
      nome: obra.nome,
      local: obra.regional,
      regional: obra.regional,
      status: normalizeStatus(obra.status),
      valorContrato,
      valorMedicao,
      valorAditivo: Number(obra.valor_total_aditivo) || 0,
      pctExecucao,
      dataInicio,
      prazoOriginal: dataFimOriginal,
      prazoAtual: dataFimComAditivos || dataFimOriginal,
      empresa: obra.empresa || 'Não informado',
      contrato: obra.num_cnt || obra.numero_po || 'N/A',
      objetoContrato: obra.objeto_cnt || '',
      prazoContratualDias: Number(obra.prazo_contratual) || 0,
      diasAditivados: Number(obra.numero_dias_aditivados) || 0,
      fase: obra.tematica || obra.tipo_cnt || 'Sem informação',
      custoDia,
      dscParalisacao: obra.dsc_paralisacao || null,
      motivoParalisacao: obra.motivo_paralisacao || null,
    }
  }), [obras])

  // Filtrar por regional + status + busca
  const obrasDaRegional = useMemo(() => obrasFormatadas.filter(obra => {
    if ((obra.regional || 'Sem regional') !== nomeRegional) return false
    if (statusFilter !== 'Todas') {
      const statusMap: Record<string, string> = {
        'Em andamento': 'EM_ANDAMENTO',
        'Concluída': 'CONCLUIDA',
        'Paralisada': 'PARALISADA',
        'Em Negociação': 'EM_NEGOCIACAO',
        'Cancelado': 'CANCELADO',
      }
      if (obra.status !== statusMap[statusFilter]) return false
    }
    if (searchTerm) {
      const s = searchTerm.toLowerCase()
      if (
        !obra.nome.toLowerCase().includes(s) &&
        !obra.empresa.toLowerCase().includes(s) &&
        !obra.contrato.toLowerCase().includes(s)
      ) return false
    }
    return true
  }), [obrasFormatadas, nomeRegional, statusFilter, searchTerm])

  // Ordenar
  const obrasOrdenadas = useMemo(() => {
    const arr = [...obrasDaRegional]
    const dir = ordemAsc ? 1 : -1
    arr.sort((a, b) => {
      switch (ordem) {
        case 'nome': return a.nome.localeCompare(b.nome) * dir
        case 'valor': return (a.valorContrato - b.valorContrato) * dir
        case 'aditivo': return (a.valorAditivo - b.valorAditivo) * dir
        case 'medido': return (a.valorMedicao - b.valorMedicao) * dir
        case 'execucao': return (a.pctExecucao - b.pctExecucao) * dir
        case 'atraso': return (a.diasAditivados - b.diasAditivados) * dir
        default: return 0
      }
    })
    return arr
  }, [obrasDaRegional, ordem, ordemAsc])

  function mudarOrdem(nova: Ordenacao) {
    if (ordem === nova) {
      setOrdemAsc(a => !a)
    } else {
      setOrdem(nova)
      setOrdemAsc(nova === 'nome')
    }
    setPaginaAtual(1)
  }

  function setaOrdem(col: Ordenacao) {
    if (ordem !== col) return ''
    return ordemAsc ? ' ↑' : ' ↓'
  }

  // Contagens por status nesta regional
  const contagens: Record<string, number> = {}
  obrasDaRegional.forEach(obra => {
    contagens[obra.status] = (contagens[obra.status] || 0) + 1
  })

  // KPIs da regional
  const todasDaRegional = obrasFormatadas.filter(o => (o.regional || 'Sem regional') === nomeRegional)
  const valorTotal = todasDaRegional.reduce((s, o) => s + o.valorContrato, 0)
  const valorAditivos = todasDaRegional.reduce((s, o) => s + o.valorAditivo, 0)
  const valorMedido = todasDaRegional.reduce((s, o) => s + o.valorMedicao, 0)
  const emAndamento = todasDaRegional.filter(o => o.status === 'EM_ANDAMENTO').length
  const pctExecucao = valorTotal > 0 ? Math.round((valorMedido / valorTotal) * 100) : 0

  // Paginação (só na visão cards; tabela mostra tudo)
  const totalPaginas = Math.ceil(obrasOrdenadas.length / ITENS_POR_PAGINA)
  const paginaSegura = Math.min(paginaAtual, totalPaginas || 1)
  const inicio = (paginaSegura - 1) * ITENS_POR_PAGINA
  const obrasPaginadas = obrasOrdenadas.slice(inicio, inicio + ITENS_POR_PAGINA)

  if (!nomeRegional) return null

  return (
    <>
      <Head>
        <title>{nomeRegional} — ObrasBH</title>
        <meta name="description" content={`Obras públicas na regional ${nomeRegional} de Belo Horizonte`} />
      </Head>

      <div className={styles.app}>
        <header className={styles.header}>
          <div className={styles.container}>
            <h1>ObrasBH</h1>
            <p>Fiscalize, vote e acompanhe as obras da sua cidade</p>
          </div>
        </header>

        <main className={styles.container}>
          <button className={styles.voltarBtn} onClick={() => router.push('/')}>
            ← Voltar para todas as regionais
          </button>

          <h2 className={styles.regionalTitulo}>{nomeRegional}</h2>
          <p className={styles.regionalSubtitulo}>
            {todasDaRegional.length} {todasDaRegional.length === 1 ? 'obra' : 'obras'} · {formatMoeda(valorTotal)} em contratos · {pctExecucao}% executado
          </p>

          {/* Mini KPIs da regional */}
          <div className={styles.kpis}>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Obras</div>
              <div className={styles.kpiValue}>{isLoading ? '...' : todasDaRegional.length}</div>
              <div className={styles.kpiExtra}>{emAndamento} em andamento</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Valor total</div>
              <div className={styles.kpiValue}>{isLoading ? '...' : formatMoeda(valorTotal)}</div>
              <div className={styles.kpiExtra}>em contratos</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Aditivos</div>
              <div className={styles.kpiValue} style={{ color: 'var(--text-warning)' }}>
                {isLoading ? '...' : `+${formatMoeda(valorAditivos)}`}
              </div>
              <div className={styles.kpiExtra}>
                {valorTotal > 0 ? `+${Math.round((valorAditivos / valorTotal) * 100)}% sobre o contratado` : 'sobre o contratado'}
              </div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>
                Valor medido
                <span className={styles.infoIcon} tabIndex={0}>
                  i
                  <span className={styles.infoTooltip}>
                    Quanto do serviço contratado já foi executado, conferido por um fiscal e aprovado para pagamento.
                  </span>
                </span>
              </div>
              <div className={styles.kpiValue} style={{ color: 'var(--text-success)' }}>
                {isLoading ? '...' : formatMoeda(valorMedido)}
              </div>
              <div className={styles.kpiExtra}>{pctExecucao}% executado</div>
            </div>
          </div>

          <input
            type="text"
            placeholder="Buscar obra, empresa ou contrato..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPaginaAtual(1) }}
            className={styles.searchInput}
            disabled={isLoading}
          />

          <div className={tabela.barraControles}>
            <div className={styles.filtros} style={{ marginBottom: 0 }}>
              {['Todas', 'Em andamento', 'Concluída', 'Paralisada', 'Em Negociação', 'Cancelado'].map(status => (
                <button
                  key={status}
                  className={`${styles.filterBtn} ${statusFilter === status ? styles.filterBtnActive : ''}`}
                  onClick={() => { setStatusFilter(status); setPaginaAtual(1) }}
                  disabled={isLoading}
                >
                  {status}
                </button>
              ))}
            </div>

            <div className={tabela.visaoToggle}>
              <button
                className={`${tabela.visaoBtn} ${visao === 'cards' ? tabela.visaoBtnActive : ''}`}
                onClick={() => setVisao('cards')}
              >
                Cards
              </button>
              <button
                className={`${tabela.visaoBtn} ${visao === 'tabela' ? tabela.visaoBtnActive : ''}`}
                onClick={() => setVisao('tabela')}
              >
                Tabela
              </button>
            </div>
          </div>

          <div style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
            {obrasOrdenadas.length} {obrasOrdenadas.length === 1 ? 'resultado' : 'resultados'}
            {visao === 'cards' && totalPaginas > 1 && ` — página ${paginaSegura} de ${totalPaginas}`}
          </div>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              Carregando obras...
            </div>
          ) : obrasOrdenadas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              Nenhuma obra encontrada com esses filtros
            </div>
          ) : visao === 'tabela' ? (
            <div className={tabela.wrap}>
              <table className={tabela.tabela}>
                <thead>
                  <tr>
                    <th onClick={() => mudarOrdem('nome')} className={tabela.thClicavel}>
                      Obra{setaOrdem('nome')}
                    </th>
                    <th>Status</th>
                    <th onClick={() => mudarOrdem('valor')} className={`${tabela.thClicavel} ${tabela.num}`}>
                      Valor{setaOrdem('valor')}
                    </th>
                    <th onClick={() => mudarOrdem('aditivo')} className={`${tabela.thClicavel} ${tabela.num}`}>
                      Aditivos{setaOrdem('aditivo')}
                    </th>
                    <th onClick={() => mudarOrdem('medido')} className={`${tabela.thClicavel} ${tabela.num}`}>
                      Medido{setaOrdem('medido')}
                    </th>
                    <th onClick={() => mudarOrdem('execucao')} className={`${tabela.thClicavel} ${tabela.num}`}>
                      Execução{setaOrdem('execucao')}
                    </th>
                    <th onClick={() => mudarOrdem('atraso')} className={`${tabela.thClicavel} ${tabela.num}`}>
                      Dias aditivados{setaOrdem('atraso')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {obrasOrdenadas.map(obra => {
                    const cor = STATUS_CORES[obra.status] || { bg: '#f0f0f0', text: '#333' }
                    return (
                      <tr key={obra.id} onClick={() => router.push(`/obra/${obra.id}`)} className={tabela.linha}>
                        <td className={tabela.tdNome}>
                          <Link href={`/obra/${obra.id}`} onClick={e => e.stopPropagation()}>
                            {obra.nome}
                          </Link>
                          <span className={tabela.tdEmpresa}>{obra.empresa}</span>
                        </td>
                        <td>
                          <span className={styles.status} style={{ backgroundColor: cor.bg, color: cor.text, fontSize: '10px', padding: '2px 8px' }}>
                            {STATUS_LABELS[obra.status] || obra.status}
                          </span>
                        </td>
                        <td className={tabela.num}>{obra.valorContrato > 0 ? formatMoeda(obra.valorContrato) : '—'}</td>
                        <td className={tabela.num} style={{ color: obra.valorAditivo > 0 ? 'var(--text-warning)' : undefined }}>
                          {obra.valorAditivo > 0 ? `+${formatMoeda(obra.valorAditivo)}` : '—'}
                        </td>
                        <td className={tabela.num}>{obra.valorMedicao > 0 ? formatMoeda(obra.valorMedicao) : '—'}</td>
                        <td className={tabela.num}>
                          <div className={tabela.execucaoCell}>
                            <div className={tabela.miniBarra}>
                              <div
                                className={tabela.miniBarraFill}
                                style={{ width: `${Math.min(obra.pctExecucao, 100)}%` }}
                              />
                            </div>
                            <span>{obra.pctExecucao}%</span>
                          </div>
                        </td>
                        <td className={tabela.num} style={{ color: obra.diasAditivados > 0 ? 'var(--text-warning)' : undefined }}>
                          {obra.diasAditivados > 0 ? `+${obra.diasAditivados}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <div className={styles.obrasList}>
                {obrasPaginadas.map(obra => <CardObra key={obra.id} obra={obra} />)}
              </div>

              {totalPaginas > 1 && (
                <div className={styles.paginacao}>
                  <button
                    className={styles.paginacaoBtn}
                    onClick={() => { setPaginaAtual(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                    disabled={paginaSegura <= 1}
                  >
                    Anterior
                  </button>

                  <div className={styles.paginacaoNumeros}>
                    {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPaginas || Math.abs(p - paginaSegura) <= 1)
                      .reduce<(number | string)[]>((acc, p, idx, arr) => {
                        if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...')
                        acc.push(p)
                        return acc
                      }, [])
                      .map((item, idx) =>
                        typeof item === 'string' ? (
                          <span key={`dots-${idx}`} className={styles.paginacaoDots}>...</span>
                        ) : (
                          <button
                            key={item}
                            className={`${styles.paginacaoNum} ${item === paginaSegura ? styles.paginacaoNumActive : ''}`}
                            onClick={() => { setPaginaAtual(item); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                          >
                            {item}
                          </button>
                        )
                      )
                    }
                  </div>

                  <button
                    className={styles.paginacaoBtn}
                    onClick={() => { setPaginaAtual(p => Math.min(totalPaginas, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                    disabled={paginaSegura >= totalPaginas}
                  >
                    Próxima
                  </button>
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
            <button className={styles.voltarBtn} onClick={() => router.push('/')}>
              ← Voltar para todas as regionais
            </button>
          </p>
        </footer>
      </div>
    </>
  )
}
