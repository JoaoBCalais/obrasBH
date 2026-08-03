import Link from 'next/link'
import { useRouter } from 'next/router'
import { useMemo } from 'react'
import { Layout } from '@/components/Layout'
import { useObra, useRenovacoes, useMedicoes } from '@/hooks/useObras'
import { MedicoesChart } from '@/components/MedicoesChart'
import { MapaObra } from '@/components/MapaObra'
import { analisarObra, NIVEL_LABELS, SEVERIDADE_LABELS, CATEGORIA_LABELS } from '@/lib/risco'
import {
  formatMoeda,
  formatMoedaFull,
  formatData,
  normalizeStatus,
  STATUS_LABELS,
  STATUS_CORES,
} from '@/lib/format'
import styles from '@/styles/Obra.module.css'

export default function ObraPage() {
  const router = useRouter()
  const { id } = router.query
  const obraId = typeof id === 'string' ? id : null

  const { obra, isLoading, isError } = useObra(obraId)
  const empreendimento = obra?.id_area_empreendimento || null
  const { renovacoes, isLoading: loadingRenov } = useRenovacoes(empreendimento)
  const { medicoes, isLoading: loadingMed } = useMedicoes(empreendimento)

  const analise = useMemo(() => (obra ? analisarObra(obra) : null), [obra])

  if (isError) {
    return (
      <Layout title="Obra não encontrada — ObrasBH">
        <p style={{ color: 'var(--text-danger)', padding: '2rem 0' }}>Obra não encontrada.</p>
        <Link href="/">← Voltar para o início</Link>
      </Layout>
    )
  }

  if (isLoading || !obra) {
    return (
      <Layout title="Carregando obra — ObrasBH">
        <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          Carregando dados da obra...
        </div>
      </Layout>
    )
  }

  const status = normalizeStatus(obra.status)
  const statusData = STATUS_CORES[status] || { bg: '#f0f0f0', text: '#333' }
  const statusLabel = STATUS_LABELS[status] || status

  const valorContrato = Number(obra.valor_contrato) || 0
  const valorAditivo = Number(obra.valor_total_aditivo) || 0
  const valorAtual = Number(obra.valor_contrato_com_aditivo) || valorContrato + valorAditivo
  const valorMedido = Number(obra.valor_total_medicao) || 0

  const pctExecucao = valorAtual > 0 ? Math.round((valorMedido / valorAtual) * 100) : 0
  const pctPbh = obra.pct_execucao_pbh != null ? Math.round(Number(obra.pct_execucao_pbh)) : null

  const dataInicio = obra.data_inicio_cnt ? new Date(obra.data_inicio_cnt + 'T12:00:00') : null
  const prazoOriginal = obra.data_fim_cnt_original ? new Date(obra.data_fim_cnt_original + 'T12:00:00') : null
  const prazoAtual = obra.data_fim_cnt_com_aditivos
    ? new Date(obra.data_fim_cnt_com_aditivos + 'T12:00:00')
    : prazoOriginal

  const diasAditivados = Number(obra.numero_dias_aditivados) || 0
  const hoje = new Date()
  const prazoVencido = prazoAtual && prazoAtual < hoje && status !== 'CONCLUIDA'

  const pctAditivo = valorContrato > 0 ? Math.round((valorAditivo / valorContrato) * 100) : 0

  // Renovações ordenadas da mais antiga para a mais recente (linha do tempo)
  const renovacoesOrdenadas = [...renovacoes].sort(
    (a, b) => (a.numero_renovacao || 0) - (b.numero_renovacao || 0)
  )
  const totalAditivosRenovacoes = renovacoesOrdenadas.reduce(
    (s, r) => s + (Number(r.valor_aditivo_renovacao) || 0), 0
  )

  const temCoordenadas = obra.latitude != null && obra.longitude != null

  const barraCor = status === 'CONCLUIDA'
    ? 'var(--text-success)'
    : status === 'PARALISADA'
    ? 'var(--text-warning)'
    : prazoVencido
    ? 'var(--text-danger)'
    : 'var(--fill-accent)'

  return (
    <Layout
      title={`${obra.nome} — ObrasBH`}
      description={`Contrato, renovações, medições e situação da obra ${obra.nome} em Belo Horizonte`}
    >
      <nav className={styles.breadcrumb}>
        <Link href="/">Início</Link>
        <span>/</span>
        <Link href={`/regional/${encodeURIComponent(obra.regional || 'Sem regional')}`}>
          {obra.regional || 'Sem regional'}
        </Link>
        <span>/</span>
        <span className={styles.breadcrumbAtual}>Obra</span>
      </nav>

      {/* Cabeçalho da obra */}
      <div className={styles.cabecalho}>
        <div className={styles.cabecalhoTexto}>
          <div className={styles.chipsLinha}>
            <span
              className={styles.statusChip}
              style={{ backgroundColor: statusData.bg, color: statusData.text }}
            >
              {statusLabel}
            </span>
            {analise && analise.nivel !== 'ok' && (
              <span className={styles.riscoChip} data-nivel={analise.nivel}>
                ⚠ {NIVEL_LABELS[analise.nivel]} · score {analise.score}
              </span>
            )}
          </div>
          <h1 className={styles.titulo}>{obra.nome}</h1>
          <p className={styles.subtitulo}>
            Regional {obra.regional || '—'}
            {obra.empresa && <> · {obra.empresa}</>}
            {obra.num_cnt && <> · Contrato {obra.num_cnt}</>}
          </p>
        </div>
      </div>

      {/* KPIs financeiros */}
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>Valor original</div>
          <div className={styles.kpiValue}>{valorContrato > 0 ? formatMoeda(valorContrato) : '—'}</div>
          <div className={styles.kpiExtra}>do contrato</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>Aditivos</div>
          <div className={styles.kpiValue} style={{ color: valorAditivo > 0 ? 'var(--text-warning)' : undefined }}>
            {valorAditivo > 0 ? `+${formatMoeda(valorAditivo)}` : 'R$ 0'}
          </div>
          <div className={styles.kpiExtra}>
            {valorAditivo > 0 ? `+${pctAditivo}% sobre o original` : 'sem acréscimo de valor'}
          </div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>Valor atual</div>
          <div className={styles.kpiValue}>{valorAtual > 0 ? formatMoeda(valorAtual) : '—'}</div>
          <div className={styles.kpiExtra}>com aditivos</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>Já medido</div>
          <div className={styles.kpiValue} style={{ color: 'var(--text-success)' }}>
            {valorMedido > 0 ? formatMoeda(valorMedido) : '—'}
          </div>
          <div className={styles.kpiExtra}>
            {pctExecucao}% executado{pctPbh != null && ` · PBH informa ${pctPbh}%`}
          </div>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className={styles.progressoGrande}>
        <div className={styles.progressoBarra}>
          <div
            className={styles.progressoFill}
            style={{ width: `${Math.min(pctExecucao, 100)}%`, backgroundColor: barraCor }}
          />
        </div>
        <div className={styles.progressoLegenda}>
          <span>{formatMoedaFull(valorMedido)} medidos</span>
          <span>{valorAtual > 0 ? `de ${formatMoedaFull(valorAtual)}` : ''}</span>
        </div>
      </div>

      {/* Avisos */}
      {status === 'PARALISADA' && (
        <div className={styles.avisoParalisada}>
          <strong>Obra paralisada</strong>
          {obra.data_paralisacao && <> desde {formatData(obra.data_paralisacao)}</>}
          {(obra.dsc_paralisacao || obra.motivo_paralisacao) && (
            <p>{obra.dsc_paralisacao || obra.motivo_paralisacao}</p>
          )}
          {obra.justificativa_inexecucao && <p>{obra.justificativa_inexecucao}</p>}
          {obra.previsao_reinicio && (
            <p>Previsão de reinício: <strong>{formatData(obra.previsao_reinicio)}</strong></p>
          )}
        </div>
      )}

      {prazoVencido && status !== 'PARALISADA' && (
        <div className={styles.avisoVencido}>
          <strong>Prazo vencido</strong> — o contrato previa conclusão em {formatData(prazoAtual!)} e a obra ainda não consta como concluída.
        </div>
      )}

      {/* Análise de indícios */}
      {analise && analise.alertas.length > 0 && (
        <section className={styles.secaoRisco} data-nivel={analise.nivel}>
          <div className={styles.riscoTopo}>
            <h2 className={styles.secaoTitulo}>Indícios para fiscalização</h2>
            <span className={styles.riscoScore} data-nivel={analise.nivel}>
              {NIVEL_LABELS[analise.nivel]} · score {analise.score}/100
            </span>
          </div>
          <p className={styles.riscoDisclaimer}>
            Indícios calculados automaticamente a partir dos dados abertos da PBH.
            <strong> Não são provas nem acusações</strong> — são pontos que merecem ser
            acompanhados de perto pela população e pelos órgãos de controle.
          </p>
          <ul className={styles.riscoLista}>
            {analise.alertas.map(alerta => (
              <li key={alerta.id} className={styles.riscoItem}>
                <div className={styles.riscoItemTopo}>
                  <span className={styles.riscoSeveridade} data-sev={alerta.severidade}>
                    {SEVERIDADE_LABELS[alerta.severidade]}
                  </span>
                  <span className={styles.riscoCategoria}>{CATEGORIA_LABELS[alerta.categoria]}</span>
                </div>
                <strong className={styles.riscoItemTitulo}>{alerta.titulo}</strong>
                <p className={styles.riscoItemDesc}>{alerta.descricao}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.colunas}>
        <div className={styles.colunaPrincipal}>

          {/* Renovações */}
          <section className={styles.secao}>
            <h2 className={styles.secaoTitulo}>Renovações do contrato</h2>
            {loadingRenov ? (
              <p className={styles.mutedText}>Carregando renovações...</p>
            ) : renovacoesOrdenadas.length === 0 ? (
              <p className={styles.mutedText}>
                Nenhuma renovação registrada — o contrato segue com o valor e prazo originais.
              </p>
            ) : (
              <>
                <p className={styles.secaoResumo}>
                  {renovacoesOrdenadas.length} {renovacoesOrdenadas.length === 1 ? 'renovação' : 'renovações'}
                  {totalAditivosRenovacoes > 0 && (
                    <> somando <strong className={styles.warningText}>+{formatMoedaFull(totalAditivosRenovacoes)}</strong> em aditivos</>
                  )}
                  {diasAditivados > 0 && (
                    <> e <strong className={styles.warningText}>+{diasAditivados} dias</strong> de prazo</>
                  )}
                </p>
                <div className={styles.timeline}>
                  {renovacoesOrdenadas.map(r => (
                    <div key={r.id} className={styles.timelineItem}>
                      <div className={styles.timelineMarcador}>
                        <span className={styles.timelineNumero}>{r.numero_renovacao ?? '—'}</span>
                      </div>
                      <div className={styles.timelineConteudo}>
                        <div className={styles.timelineTopo}>
                          <strong>
                            {r.numero_renovacao != null ? `${r.numero_renovacao}ª renovação` : 'Renovação'}
                          </strong>
                          {r.data_renovacao && (
                            <span className={styles.timelineData}>{formatData(r.data_renovacao)}</span>
                          )}
                        </div>
                        <div className={styles.timelineValores}>
                          <div className={styles.timelineValor}>
                            <span className={styles.timelineValorLabel}>Aditivo desta renovação</span>
                            <span
                              className={styles.timelineValorNum}
                              style={{ color: (Number(r.valor_aditivo_renovacao) || 0) > 0 ? 'var(--text-warning)' : undefined }}
                            >
                              {(Number(r.valor_aditivo_renovacao) || 0) > 0
                                ? `+${formatMoedaFull(Number(r.valor_aditivo_renovacao))}`
                                : 'Sem acréscimo'}
                            </span>
                          </div>
                          {(Number(r.valor_renovacao) || 0) > 0 && (
                            <div className={styles.timelineValor}>
                              <span className={styles.timelineValorLabel}>Total do contrato após</span>
                              <span className={styles.timelineValorNum}>
                                {formatMoedaFull(Number(r.valor_renovacao))}
                              </span>
                            </div>
                          )}
                          {(r.dias_aditivados_renovacao || 0) > 0 && (
                            <div className={styles.timelineValor}>
                              <span className={styles.timelineValorLabel}>Prazo</span>
                              <span className={styles.timelineValorNum}>+{r.dias_aditivados_renovacao} dias</span>
                            </div>
                          )}
                        </div>
                        {r.justificativa && (
                          <p className={styles.timelineJustificativa}>{r.justificativa}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Medições */}
          <section className={styles.secao}>
            <h2 className={styles.secaoTitulo}>Evolução das medições</h2>
            {loadingMed ? (
              <p className={styles.mutedText}>Carregando medições...</p>
            ) : (
              <MedicoesChart medicoes={medicoes} valorContrato={valorAtual} />
            )}
          </section>
        </div>

        <div className={styles.colunaLateral}>

          {/* Localização */}
          {temCoordenadas && (
            <section className={styles.secao}>
              <h2 className={styles.secaoTitulo}>Localização</h2>
              <MapaObra
                latitude={Number(obra.latitude)}
                longitude={Number(obra.longitude)}
                nome={obra.nome}
              />
            </section>
          )}

          {/* Ficha do contrato */}
          <section className={styles.secao}>
            <h2 className={styles.secaoTitulo}>Ficha do contrato</h2>
            <dl className={styles.ficha}>
              {obra.objeto_cnt && (
                <div className={styles.fichaItemFull}>
                  <dt>Objeto</dt>
                  <dd>{obra.objeto_cnt}</dd>
                </div>
              )}
              <div className={styles.fichaItem}>
                <dt>Empresa</dt>
                <dd>{obra.empresa || '—'}</dd>
              </div>
              <div className={styles.fichaItem}>
                <dt>Contrato</dt>
                <dd>{obra.num_cnt || obra.numero_po || '—'}</dd>
              </div>
              {obra.tipo_cnt && (
                <div className={styles.fichaItem}>
                  <dt>Tipo</dt>
                  <dd>{obra.tipo_cnt}</dd>
                </div>
              )}
              {obra.tematica && (
                <div className={styles.fichaItem}>
                  <dt>Temática</dt>
                  <dd>{obra.tematica}</dd>
                </div>
              )}
              {obra.origem_contrato && (
                <div className={styles.fichaItem}>
                  <dt>Origem</dt>
                  <dd>{obra.origem_contrato}</dd>
                </div>
              )}
              <div className={styles.fichaItem}>
                <dt>Início</dt>
                <dd>{dataInicio ? formatData(dataInicio) : '—'}</dd>
              </div>
              <div className={styles.fichaItem}>
                <dt>Prazo original</dt>
                <dd>{prazoOriginal ? formatData(prazoOriginal) : '—'}</dd>
              </div>
              <div className={styles.fichaItem}>
                <dt>Prazo atual</dt>
                <dd style={{ color: prazoVencido ? 'var(--text-danger)' : diasAditivados > 0 ? 'var(--text-warning)' : undefined }}>
                  {prazoAtual ? formatData(prazoAtual) : '—'}
                  {prazoVencido && ' (vencido)'}
                </dd>
              </div>
              <div className={styles.fichaItem}>
                <dt>Prazo contratual</dt>
                <dd>{obra.prazo_contratual > 0 ? `${obra.prazo_contratual} dias` : '—'}</dd>
              </div>
              <div className={styles.fichaItem}>
                <dt>Dias aditivados</dt>
                <dd style={{ color: diasAditivados > 0 ? 'var(--text-warning)' : undefined }}>
                  {diasAditivados > 0 ? `+${diasAditivados} dias` : '—'}
                </dd>
              </div>
              {valorMedido > 0 && valorAtual > valorMedido && (
                <div className={styles.fichaItem}>
                  <dt>Saldo restante</dt>
                  <dd>{formatMoedaFull(valorAtual - valorMedido)}</dd>
                </div>
              )}
              <div className={styles.fichaItem}>
                <dt>Empreendimento</dt>
                <dd>{obra.id_area_empreendimento}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </Layout>
  )
}
