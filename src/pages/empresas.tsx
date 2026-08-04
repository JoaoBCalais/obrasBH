import Link from 'next/link'
import { useState, useMemo, useEffect, Fragment } from 'react'
import { useRouter } from 'next/router'
import { Layout } from '@/components/Layout'
import { useObras, Obra } from '@/hooks/useObras'
import {
  analisarObra,
  analisarEmpresas,
  AnaliseRisco,
  NIVEL_LABELS,
  LIMITE_LEGAL_ADITIVO_PCT,
} from '@/lib/risco'
import { formatMoeda, normalizeStatus, STATUS_LABELS, STATUS_CORES } from '@/lib/format'
import styles from '@/styles/Empresas.module.css'

type Coluna = 'empresa' | 'contratos' | 'valor' | 'aditivo' | 'alertas' | 'participacao'

const COLUNAS: { id: Coluna; rotulo: string; numerica: boolean; titulo?: string }[] = [
  { id: 'empresa', rotulo: 'Empresa', numerica: false },
  { id: 'contratos', rotulo: 'Contratos', numerica: true },
  { id: 'valor', rotulo: 'Valor total', numerica: true, titulo: 'Soma dos valores originais dos contratos' },
  { id: 'aditivo', rotulo: 'Aditivos', numerica: true, titulo: '% de acréscimo sobre o valor contratado' },
  { id: 'alertas', rotulo: 'Com alerta', numerica: true, titulo: 'Contratos em nível crítico ou atenção' },
  { id: 'participacao', rotulo: 'Fatia', numerica: true, titulo: '% do valor total contratado pela PBH' },
]

export default function EmpresasPage() {
  const router = useRouter()
  const { obras, isLoading, isError } = useObras()
  const [busca, setBusca] = useState('')
  const [soAlertas, setSoAlertas] = useState(false)
  const [coluna, setColuna] = useState<Coluna>('valor')
  const [asc, setAsc] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)
  const [limite, setLimite] = useState(20)

  // Permite chegar aqui já filtrado por uma empresa (ex.: vindo da home)
  useEffect(() => {
    const q = router.query.q
    if (typeof q === 'string' && q.trim()) {
      setBusca(q)
      setExpandida(q)
    }
  }, [router.query.q])

  const analises = useMemo(() => {
    const mapa = new Map<number, AnaliseRisco>()
    obras.forEach(o => mapa.set(o.id, analisarObra(o)))
    return mapa
  }, [obras])

  const resumos = useMemo(() => analisarEmpresas(obras, analises), [obras, analises])

  // Contratos de cada empresa, para a linha expandida
  const contratosPorEmpresa = useMemo(() => {
    const mapa = new Map<string, Obra[]>()
    obras.forEach(o => {
      const nome = (o.empresa || '').trim()
      if (!nome) return
      if (!mapa.has(nome)) mapa.set(nome, [])
      mapa.get(nome)!.push(o)
    })
    mapa.forEach(lista => lista.sort((a, b) =>
      (Number(b.valor_contrato) || 0) - (Number(a.valor_contrato) || 0)
    ))
    return mapa
  }, [obras])

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const filtradas = resumos.filter(e => {
      if (soAlertas && e.flags.length === 0) return false
      if (termo && !e.empresa.toLowerCase().includes(termo)) return false
      return true
    })

    const dir = asc ? 1 : -1
    return [...filtradas].sort((a, b) => {
      switch (coluna) {
        case 'empresa': return a.empresa.localeCompare(b.empresa, 'pt-BR') * dir
        case 'contratos': return (a.contratos - b.contratos) * dir
        case 'aditivo': return (a.aditivoPct - b.aditivoPct) * dir
        case 'alertas': return (a.obrasComAlerta - b.obrasComAlerta) * dir
        case 'participacao': return (a.participacaoPct - b.participacaoPct) * dir
        default: return (a.valorTotal - b.valorTotal) * dir
      }
    })
  }, [resumos, busca, soAlertas, coluna, asc])

  const resumoGeral = useMemo(() => {
    const comFlag = resumos.filter(e => e.flags.length > 0).length
    const aditivos = resumos.reduce((s, e) => s + e.valorAditivos, 0)
    const top5 = [...resumos].sort((a, b) => b.valorTotal - a.valorTotal).slice(0, 5)
    const concentracaoTop5 = top5.reduce((s, e) => s + e.participacaoPct, 0)
    const criticas = obras.filter(o => analises.get(o.id)?.nivel === 'critico').length
    return { total: resumos.length, comFlag, aditivos, concentracaoTop5, criticas }
  }, [resumos, obras, analises])

  function ordenarPor(c: Coluna) {
    if (c === coluna) { setAsc(a => !a); return }
    setColuna(c)
    setAsc(c === 'empresa')
    setLimite(20)
  }

  const filtrosAtivos = busca.trim() !== '' || soAlertas

  if (isError) {
    return (
      <Layout title="Empresas — ObrasBH">
        <div style={{ padding: '3rem 0', color: 'var(--text-danger)' }}>
          <strong>Erro ao carregar dados.</strong>
        </div>
      </Layout>
    )
  }

  const visiveis = lista.slice(0, limite)

  return (
    <Layout
      title="Empresas contratadas — ObrasBH"
      description="Quem executa as obras públicas de Belo Horizonte: contratos, valores, aditivos e concentração por empresa"
      alertasCriticos={resumoGeral.criticas}
    >
      <div className={styles.topo}>
        <h1 className={styles.titulo}>Empresas contratadas</h1>
        <p className={styles.subtitulo}>
          Quem executa as obras da cidade. Aqui dá pra ver quantos contratos cada empresa tem,
          quanto já recebeu em aditivos e o quanto ela concentra do valor total contratado pela
          Prefeitura. <strong>Nenhum número aqui é acusação</strong> — concentração e aditivos altos
          podem ter explicação legítima, mas merecem ser acompanhados.
        </p>
      </div>

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>Empresas</div>
          <div className={styles.kpiValue}>{isLoading ? '...' : resumoGeral.total}</div>
          <div className={styles.kpiExtra}>com pelo menos um contrato</div>
        </div>
        <div className={styles.kpi} data-tom="atencao">
          <div className={styles.kpiLabel}>Para acompanhar</div>
          <div className={styles.kpiValue}>{isLoading ? '...' : resumoGeral.comFlag}</div>
          <div className={styles.kpiExtra}>com algum sinal de atenção</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>Total em aditivos</div>
          <div className={styles.kpiValue} style={{ color: 'var(--text-warning)' }}>
            {isLoading ? '...' : `+${formatMoeda(resumoGeral.aditivos)}`}
          </div>
          <div className={styles.kpiExtra}>somando todas as empresas</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>Concentração top 5</div>
          <div className={styles.kpiValue}>
            {isLoading ? '...' : `${Math.round(resumoGeral.concentracaoTop5)}%`}
          </div>
          <div className={styles.kpiExtra}>do valor contratado</div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.buscaInput}
          placeholder="Buscar empresa..."
          value={busca}
          onChange={e => { setBusca(e.target.value); setLimite(20) }}
          aria-label="Buscar empresa"
        />
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={soAlertas}
            onChange={e => { setSoAlertas(e.target.checked); setLimite(20) }}
          />
          Só empresas com sinal de atenção
        </label>
        {filtrosAtivos && (
          <button
            className={styles.limparBtn}
            onClick={() => { setBusca(''); setSoAlertas(false); setLimite(20) }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      <div className={styles.contagem}>
        {isLoading
          ? 'Analisando contratos...'
          : `${lista.length} ${lista.length === 1 ? 'empresa' : 'empresas'}${filtrosAtivos ? ' (filtrado)' : ''} — clique para ver os contratos`}
      </div>

      {isLoading ? (
        <div className={styles.estadoVazio}>Carregando contratos...</div>
      ) : lista.length === 0 ? (
        <div className={styles.estadoVazio}>Nenhuma empresa encontrada com esses filtros.</div>
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
                {visiveis.map((e, i) => {
                  const aberta = expandida === e.empresa
                  const contratos = contratosPorEmpresa.get(e.empresa) || []
                  return (
                    <Fragment key={e.empresa}>
                      <tr
                        className={`${styles.linha} ${aberta ? styles.linhaAtiva : ''}`}
                        onClick={() => setExpandida(aberta ? null : e.empresa)}
                        tabIndex={0}
                        role="button"
                        aria-expanded={aberta}
                        onKeyDown={ev => {
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault(); setExpandida(aberta ? null : e.empresa)
                          }
                        }}
                      >
                        <td className={styles.tdRank}>{i + 1}</td>
                        <td className={styles.tdNome}>
                          <span className={styles.nomeEmpresa}>{e.empresa}</span>
                          {e.flags.length > 0 && (
                            <span className={styles.flagResumo}>⚠ {e.flags[0]}</span>
                          )}
                        </td>
                        <td className={styles.tdNum}>{e.contratos}</td>
                        <td className={styles.tdNum}>{formatMoeda(e.valorTotal)}</td>
                        <td className={styles.tdNum}>
                          <span
                            className={styles.pct}
                            data-alto={e.aditivoPct > LIMITE_LEGAL_ADITIVO_PCT ? 'sim' : undefined}
                          >
                            {e.aditivoPct > 0 ? `+${Math.round(e.aditivoPct)}%` : '—'}
                          </span>
                        </td>
                        <td className={styles.tdNum}>
                          {e.obrasComAlerta > 0
                            ? <span className={styles.alertaConta}>{e.obrasComAlerta}/{e.contratos}</span>
                            : '—'}
                        </td>
                        <td className={styles.tdNum}>
                          <span className={styles.barraMini} aria-hidden="true">
                            <span
                              className={styles.barraMiniFill}
                              style={{ width: `${Math.min(e.participacaoPct * 3, 100)}%` }}
                            />
                          </span>
                          <span className={styles.pctTexto}>
                            {e.participacaoPct >= 0.5 ? `${Math.round(e.participacaoPct)}%` : '<1%'}
                          </span>
                        </td>
                      </tr>
                      {aberta && (
                        <tr className={styles.linhaDetalhe}>
                          <td colSpan={COLUNAS.length + 1}>
                            {e.flags.length > 0 && (
                              <ul className={styles.flags}>
                                {e.flags.map((f, idx) => <li key={idx}>{f}</li>)}
                              </ul>
                            )}
                            <div className={styles.contratosLista}>
                              {contratos.map(o => {
                                const st = normalizeStatus(o.status)
                                const cor = STATUS_CORES[st] || { bg: '#f0f0f0', text: '#333' }
                                const a = analises.get(o.id)
                                return (
                                  <Link key={o.id} href={`/obra/${o.id}`} className={styles.contratoItem}>
                                    <span className={styles.contratoNome}>{o.nome}</span>
                                    <span className={styles.contratoMeta}>
                                      {o.regional || 'Sem regional'}
                                      {' · '}
                                      {formatMoeda(Number(o.valor_contrato) || 0)}
                                    </span>
                                    <span className={styles.contratoChips}>
                                      {a && (a.nivel === 'critico' || a.nivel === 'atencao') && (
                                        <span className={styles.chipNivel} data-nivel={a.nivel}>
                                          ⚠ {NIVEL_LABELS[a.nivel]}
                                        </span>
                                      )}
                                      <span
                                        className={styles.statusPill}
                                        style={{ backgroundColor: cor.bg, color: cor.text }}
                                      >
                                        {STATUS_LABELS[st] || st}
                                      </span>
                                    </span>
                                  </Link>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ===== Cards (mobile) ===== */}
          <div className={styles.cards}>
            {visiveis.map((e, i) => {
              const aberta = expandida === e.empresa
              const contratos = contratosPorEmpresa.get(e.empresa) || []
              return (
                <div key={e.empresa} className={styles.card} data-alerta={e.flags.length > 0 ? 'sim' : undefined}>
                  <button
                    className={styles.cardBtn}
                    onClick={() => setExpandida(aberta ? null : e.empresa)}
                    aria-expanded={aberta}
                  >
                    <span className={styles.cardTopo}>
                      <span className={styles.cardRank}>{i + 1}</span>
                      <span className={styles.cardNome}>{e.empresa}</span>
                      <span className={styles.cardSeta} aria-hidden="true">{aberta ? '▴' : '▾'}</span>
                    </span>
                    <span className={styles.cardNumeros}>
                      <span><em>Contratos</em>{e.contratos}</span>
                      <span><em>Valor</em>{formatMoeda(e.valorTotal)}</span>
                      <span><em>Aditivos</em>{e.aditivoPct > 0 ? `+${Math.round(e.aditivoPct)}%` : '—'}</span>
                      <span><em>Com alerta</em>{e.obrasComAlerta}/{e.contratos}</span>
                    </span>
                  </button>
                  {aberta && (
                    <div className={styles.cardDetalhe}>
                      {e.flags.length > 0 && (
                        <ul className={styles.flags}>
                          {e.flags.map((f, idx) => <li key={idx}>{f}</li>)}
                        </ul>
                      )}
                      <div className={styles.contratosLista}>
                        {contratos.map(o => (
                          <Link key={o.id} href={`/obra/${o.id}`} className={styles.contratoItem}>
                            <span className={styles.contratoNome}>{o.nome}</span>
                            <span className={styles.contratoMeta}>
                              {o.regional || 'Sem regional'} · {formatMoeda(Number(o.valor_contrato) || 0)}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {lista.length > limite && (
            <button className={styles.verMais} onClick={() => setLimite(l => l + 20)}>
              Mostrar mais {Math.min(20, lista.length - limite)} empresas
            </button>
          )}
        </>
      )}

      <section className={styles.metodologia}>
        <h2 className={styles.secaoTitulo}>Como ler esta página</h2>
        <p>
          <strong>Aditivos</strong> é quanto os contratos da empresa cresceram além do valor original —
          o limite de referência da Lei 14.133/2021 é {LIMITE_LEGAL_ADITIVO_PCT}%.{' '}
          <strong>Fatia</strong> é a participação da empresa no valor total contratado pela Prefeitura;
          uma fatia grande concentrada em poucas empresas reduz a competição.{' '}
          <strong>Com alerta</strong> conta quantos contratos daquela empresa aparecem em nível crítico
          ou atenção no <Link href="/criticas">radar de obras críticas</Link>. Tudo é calculado a partir
          dos dados abertos da SMOBI/PBH, no seu navegador.
        </p>
      </section>
    </Layout>
  )
}
