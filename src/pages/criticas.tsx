import Link from 'next/link'
import { useState, useMemo, useEffect } from 'react'
import { Layout } from '@/components/Layout'
import { useObras, Obra } from '@/hooks/useObras'
import {
  analisarObra,
  analisarGaps,
  AnaliseRisco,
  CategoriaAlerta,
  NIVEL_LABELS,
  CATEGORIA_LABELS,
  SEVERIDADE_LABELS,
  LIMITE_LEGAL_ADITIVO_PCT,
} from '@/lib/risco'
import { formatMoeda, normalizeStatus, STATUS_LABELS, STATUS_CORES } from '@/lib/format'
import styles from '@/styles/Criticas.module.css'

type FiltroNivel = 'todos' | 'critico' | 'atencao' | 'observacao'
type FiltroCategoria = 'todas' | CategoriaAlerta
type Coluna = 'score' | 'nome' | 'regional' | 'valor' | 'aditivo' | 'execucao' | 'indicios'

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

const COLUNAS: { id: Coluna; rotulo: string; numerica: boolean; titulo?: string }[] = [
  { id: 'score', rotulo: 'Score', numerica: true, titulo: 'Pontuação de indícios (0–100)' },
  { id: 'nome', rotulo: 'Obra', numerica: false },
  { id: 'regional', rotulo: 'Regional', numerica: false },
  { id: 'valor', rotulo: 'Valor atual', numerica: true, titulo: 'Contrato já com aditivos' },
  { id: 'aditivo', rotulo: 'Aditivo', numerica: true, titulo: '% de acréscimo sobre o valor original' },
  { id: 'execucao', rotulo: 'Execução', numerica: true, titulo: '% medido sobre o valor atual' },
  { id: 'indicios', rotulo: 'Indícios', numerica: true },
]

interface Linha {
  obra: Obra
  analise: AnaliseRisco
  nome: string
  empresa: string
  regional: string
  status: string
  valor: number
  aditivoPct: number
  execucaoPct: number
  indicios: number
}

export default function CriticasPage() {
  const { obras, isLoading, isError } = useObras()
  const [filtroNivel, setFiltroNivel] = useState<FiltroNivel>('todos')
  const [filtroCategoria, setFiltroCategoria] = useState<FiltroCategoria>('todas')
  const [filtroRegional, setFiltroRegional] = useState('todas')
  const [busca, setBusca] = useState('')
  const [coluna, setColuna] = useState<Coluna>('score')
  const [asc, setAsc] = useState(false)
  const [selecionada, setSelecionada] = useState<number | null>(null)
  const [limite, setLimite] = useState(10)

  const analisadas = useMemo(() => {
    const mapa = new Map<number, AnaliseRisco>()
    obras.forEach(o => mapa.set(o.id, analisarObra(o)))
    return mapa
  }, [obras])

  const linhasBase = useMemo<Linha[]>(() => obras.map(obra => {
    const analise = analisadas.get(obra.id)!
    const valorContrato = Number(obra.valor_contrato) || 0
    const valorAditivo = Number(obra.valor_total_aditivo) || 0
    const valorMedido = Number(obra.valor_total_medicao) || 0
    const valor = Number(obra.valor_contrato_com_aditivo) || valorContrato + valorAditivo
    return {
      obra,
      analise,
      nome: obra.nome || '',
      empresa: obra.empresa || '',
      regional: obra.regional || 'Sem regional',
      status: normalizeStatus(obra.status),
      valor,
      aditivoPct: valorContrato > 0 ? (valorAditivo / valorContrato) * 100 : 0,
      execucaoPct: valor > 0 ? (valorMedido / valor) * 100 : 0,
      indicios: analise ? analise.alertas.length : 0,
    }
  }).filter(l => l.analise && l.analise.alertas.length > 0), [obras, analisadas])

  const listaRegionais = useMemo(
    () => Array.from(new Set(linhasBase.map(l => l.regional))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [linhasBase]
  )

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const filtradas = linhasBase.filter(l => {
      if (filtroNivel !== 'todos' && l.analise.nivel !== filtroNivel) return false
      if (filtroCategoria !== 'todas' && !l.analise.alertas.some(a => a.categoria === filtroCategoria)) return false
      if (filtroRegional !== 'todas' && l.regional !== filtroRegional) return false
      if (termo && !(
        l.nome.toLowerCase().includes(termo) ||
        l.empresa.toLowerCase().includes(termo) ||
        l.regional.toLowerCase().includes(termo)
      )) return false
      return true
    })

    const dir = asc ? 1 : -1
    return filtradas.sort((a, b) => {
      switch (coluna) {
        case 'nome': return a.nome.localeCompare(b.nome, 'pt-BR') * dir
        case 'regional': return (a.regional.localeCompare(b.regional, 'pt-BR') || b.analise.score - a.analise.score) * dir
        case 'valor': return (a.valor - b.valor) * dir
        case 'aditivo': return (a.aditivoPct - b.aditivoPct) * dir
        case 'execucao': return (a.execucaoPct - b.execucaoPct) * dir
        case 'indicios': return (a.indicios - b.indicios) * dir
        default: return (a.analise.score - b.analise.score) * dir
      }
    })
  }, [linhasBase, filtroNivel, filtroCategoria, filtroRegional, busca, coluna, asc])

  const resumo = useMemo(() => {
    let criticas = 0, atencao = 0, valorSobAlerta = 0, aditivosAcima = 0
    linhasBase.forEach(l => {
      if (l.analise.nivel === 'critico') { criticas++; valorSobAlerta += l.valor }
      if (l.analise.nivel === 'atencao') { atencao++; valorSobAlerta += l.valor }
      if (l.analise.alertas.some(al => al.id === 'aditivo_acima_limite')) aditivosAcima++
    })
    return { criticas, atencao, valorSobAlerta, aditivosAcima }
  }, [linhasBase])

  const gaps = useMemo(() => analisarGaps(obras), [obras])

  const detalhe = useMemo(
    () => linhas.find(l => l.obra.id === selecionada) || linhasBase.find(l => l.obra.id === selecionada) || null,
    [linhas, linhasBase, selecionada]
  )

  // Fechar painel com Esc
  useEffect(() => {
    if (selecionada === null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelecionada(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecionada])

  function ordenarPor(c: Coluna) {
    if (c === coluna) { setAsc(a => !a); return }
    setColuna(c)
    setAsc(c === 'nome' || c === 'regional' || c === 'execucao')
    setLimite(10)
  }

  const filtrosAtivos =
    filtroNivel !== 'todos' || filtroCategoria !== 'todas' || filtroRegional !== 'todas' || busca.trim() !== ''

  function limparFiltros() {
    setFiltroNivel('todos'); setFiltroCategoria('todas'); setFiltroRegional('todas'); setBusca(''); setLimite(10)
  }

  if (isError) {
    return (
      <Layout title="Obras críticas — ObrasBH">
        <div style={{ padding: '3rem 0', color: 'var(--text-danger)' }}>
          <strong>Erro ao carregar dados.</strong>
        </div>
      </Layout>
    )
  }

  const visiveis = linhas.slice(0, limite)

  return (
    <Layout
      title="Obras críticas — ObrasBH"
      description="Obras públicas de BH com indícios de aditivos excessivos, atrasos, paralisações sem justificativa e falhas de transparência"
      alertasCriticos={resumo.criticas}
    >
      <div className={styles.topo}>
        <h1 className={styles.titulo}>Obras críticas</h1>
        <p className={styles.subtitulo}>
          Cruzamos os dados abertos da PBH em busca de sinais que merecem atenção: aditivos acima do
          limite legal de referência ({LIMITE_LEGAL_ADITIVO_PCT}%), prazos estourados, obras paradas sem
          explicação e lacunas nos dados publicados. <strong>Indício não é prova</strong> — é um ponto
          de partida para cobrar respostas.
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

      {/* Barra de ferramentas */}
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.buscaInput}
          placeholder="Filtrar por obra, empresa ou regional..."
          value={busca}
          onChange={e => { setBusca(e.target.value); setLimite(10) }}
          aria-label="Filtrar obras"
        />
        <select
          className={styles.select}
          value={filtroRegional}
          onChange={e => { setFiltroRegional(e.target.value); setLimite(10) }}
          aria-label="Filtrar por regional"
        >
          <option value="todas">Todas as regionais</option>
          {listaRegionais.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          className={styles.select}
          value={filtroNivel}
          onChange={e => { setFiltroNivel(e.target.value as FiltroNivel); setLimite(10) }}
          aria-label="Filtrar por nível"
        >
          {NIVEIS.map(n => <option key={n.valor} value={n.valor}>{n.rotulo}</option>)}
        </select>
        <select
          className={styles.select}
          value={filtroCategoria}
          onChange={e => { setFiltroCategoria(e.target.value as FiltroCategoria); setLimite(10) }}
          aria-label="Filtrar por categoria"
        >
          {CATEGORIAS.map(c => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
        </select>
        {filtrosAtivos && (
          <button className={styles.limparBtn} onClick={limparFiltros}>Limpar filtros</button>
        )}
      </div>

      <div className={styles.contagem}>
        {isLoading
          ? 'Analisando obras...'
          : `${linhas.length} ${linhas.length === 1 ? 'obra' : 'obras'} com indícios${filtrosAtivos ? ' (filtrado)' : ''}`}
      </div>

      {isLoading ? (
        <div className={styles.estadoVazio}>Carregando e analisando os contratos...</div>
      ) : linhas.length === 0 ? (
        <div className={styles.estadoVazio}>Nenhuma obra encontrada com esses filtros.</div>
      ) : (
        <>
          {/* ===== Tabela (desktop) ===== */}
          <div className={styles.tabelaWrap}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th className={styles.thRank} scope="col">#</th>
                  {COLUNAS.map(c => (
                    <th
                      key={c.id}
                      scope="col"
                      className={c.numerica ? styles.thNum : undefined}
                      aria-sort={coluna === c.id ? (asc ? 'ascending' : 'descending') : 'none'}
                    >
                      <button
                        className={`${styles.thBtn} ${coluna === c.id ? styles.thBtnAtivo : ''}`}
                        onClick={() => ordenarPor(c.id)}
                        title={c.titulo}
                      >
                        {c.rotulo}
                        <span className={styles.thSeta} aria-hidden="true">
                          {coluna === c.id ? (asc ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l, i) => {
                  const cor = STATUS_CORES[l.status] || { bg: '#f0f0f0', text: '#333' }
                  return (
                    <tr
                      key={l.obra.id}
                      className={`${styles.linha} ${selecionada === l.obra.id ? styles.linhaAtiva : ''}`}
                      data-nivel={l.analise.nivel}
                      onClick={() => setSelecionada(l.obra.id)}
                      tabIndex={0}
                      role="button"
                      aria-label={`Ver indícios de ${l.nome}`}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelecionada(l.obra.id) } }}
                    >
                      <td className={styles.tdRank}>{i + 1}</td>
                      <td className={styles.tdNum}>
                        <span className={styles.scoreBadge} data-nivel={l.analise.nivel}>{l.analise.score}</span>
                      </td>
                      <td className={styles.tdNome}>
                        <span className={styles.nomeObra}>{l.nome}</span>
                        <span className={styles.metaObra}>
                          {l.empresa || 'Empresa não informada'}
                          {' · '}
                          <span className={styles.statusPill} style={{ backgroundColor: cor.bg, color: cor.text }}>
                            {STATUS_LABELS[l.status] || l.status}
                          </span>
                        </span>
                      </td>
                      <td className={styles.tdRegional}>{l.regional}</td>
                      <td className={styles.tdNum}>{l.valor > 0 ? formatMoeda(l.valor) : '—'}</td>
                      <td className={styles.tdNum}>
                        <span
                          className={styles.pct}
                          data-alto={l.aditivoPct > LIMITE_LEGAL_ADITIVO_PCT ? 'sim' : undefined}
                        >
                          {l.aditivoPct > 0 ? `+${Math.round(l.aditivoPct)}%` : '—'}
                        </span>
                      </td>
                      <td className={styles.tdNum}>
                        <span className={styles.barraMini} aria-hidden="true">
                          <span
                            className={styles.barraMiniFill}
                            style={{ width: `${Math.min(Math.max(l.execucaoPct, 0), 100)}%` }}
                          />
                        </span>
                        <span className={styles.pctTexto}>{Math.round(l.execucaoPct)}%</span>
                      </td>
                      <td className={styles.tdNum}>{l.indicios}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ===== Cards (mobile) ===== */}
          <div className={styles.cards}>
            {visiveis.map((l, i) => {
              const cor = STATUS_CORES[l.status] || { bg: '#f0f0f0', text: '#333' }
              return (
                <button
                  key={l.obra.id}
                  className={styles.card}
                  data-nivel={l.analise.nivel}
                  onClick={() => setSelecionada(l.obra.id)}
                >
                  <span className={styles.cardTopo}>
                    <span className={styles.cardRank}>{i + 1}</span>
                    <span className={styles.scoreBadge} data-nivel={l.analise.nivel}>{l.analise.score}</span>
                    <span className={styles.chipNivel} data-nivel={l.analise.nivel}>
                      {NIVEL_LABELS[l.analise.nivel]}
                    </span>
                    <span className={styles.statusPill} style={{ backgroundColor: cor.bg, color: cor.text }}>
                      {STATUS_LABELS[l.status] || l.status}
                    </span>
                  </span>
                  <span className={styles.cardNome}>{l.nome}</span>
                  <span className={styles.cardMeta}>
                    {l.regional}{l.empresa && ` · ${l.empresa}`}
                  </span>
                  <span className={styles.cardNumeros}>
                    <span><em>Valor</em>{l.valor > 0 ? formatMoeda(l.valor) : '—'}</span>
                    <span><em>Aditivo</em>{l.aditivoPct > 0 ? `+${Math.round(l.aditivoPct)}%` : '—'}</span>
                    <span><em>Execução</em>{Math.round(l.execucaoPct)}%</span>
                    <span><em>Indícios</em>{l.indicios}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {linhas.length > limite && (
            <button className={styles.verMais} onClick={() => setLimite(l => l + 10)}>
              Mostrar mais {Math.min(10, linhas.length - limite)} obras
            </button>
          )}
        </>
      )}

      {/* ===== Painel lateral de detalhe ===== */}
      {detalhe && (
        <>
          <div className={styles.overlay} onClick={() => setSelecionada(null)} aria-hidden="true" />
          <aside className={styles.painel} role="dialog" aria-label={`Indícios de ${detalhe.nome}`}>
            <div className={styles.painelTopo}>
              <span className={styles.scoreBadgeGrande} data-nivel={detalhe.analise.nivel}>
                {detalhe.analise.score}
              </span>
              <div className={styles.painelTituloBloco}>
                <span className={styles.chipNivel} data-nivel={detalhe.analise.nivel}>
                  ⚠ {NIVEL_LABELS[detalhe.analise.nivel]}
                </span>
                <h2 className={styles.painelTitulo}>{detalhe.nome}</h2>
                <p className={styles.painelMeta}>
                  {detalhe.regional}
                  {detalhe.empresa && ` · ${detalhe.empresa}`}
                </p>
              </div>
              <button className={styles.fechar} onClick={() => setSelecionada(null)} aria-label="Fechar painel">×</button>
            </div>

            <div className={styles.painelNumeros}>
              <div>
                <span className={styles.painelNumLabel}>Valor atual</span>
                <span className={styles.painelNumValor}>{detalhe.valor > 0 ? formatMoeda(detalhe.valor) : '—'}</span>
              </div>
              <div>
                <span className={styles.painelNumLabel}>Aditivos</span>
                <span className={styles.painelNumValor} style={{ color: 'var(--text-warning)' }}>
                  {detalhe.aditivoPct > 0 ? `+${Math.round(detalhe.aditivoPct)}%` : '—'}
                </span>
              </div>
              <div>
                <span className={styles.painelNumLabel}>Execução</span>
                <span className={styles.painelNumValor} style={{ color: 'var(--text-success)' }}>
                  {Math.round(detalhe.execucaoPct)}%
                </span>
              </div>
              <div>
                <span className={styles.painelNumLabel}>Contrato</span>
                <span className={styles.painelNumValor}>{detalhe.obra.num_cnt || detalhe.obra.numero_po || '—'}</span>
              </div>
            </div>

            <h3 className={styles.painelSecao}>
              {detalhe.indicios} {detalhe.indicios === 1 ? 'indício encontrado' : 'indícios encontrados'}
            </h3>
            <ul className={styles.alertaLista}>
              {detalhe.analise.alertas.map(alerta => (
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

            <Link href={`/obra/${detalhe.obra.id}`} className={styles.verObra}>
              Ver página completa da obra →
            </Link>
          </aside>
        </>
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
        <p style={{ marginTop: '10px' }}>
          Para ver esses mesmos indícios agrupados por quem executa as obras, vá para{' '}
          <Link href="/empresas">Empresas contratadas</Link>.
        </p>
      </section>
    </Layout>
  )
}
