import React, { useState } from 'react'
import Link from 'next/link'
import { formatMoeda, STATUS_LABELS, STATUS_CORES } from '@/lib/format'
import { useParalizacoes } from '@/hooks/useParalizacoes'
import { AnaliseRisco, NIVEL_LABELS } from '@/lib/risco'
import styles from '@/styles/CardObra.module.css'

interface CardObraProps {
  obra: {
    id: string
    nome: string
    local: string
    regional: string
    status: string
    valorContrato: number
    valorMedicao: number
    valorAditivo: number
    pctExecucao: number
    dataInicio: Date | null
    prazoOriginal: Date | null
    prazoAtual: Date | null
    empresa: string
    contrato: string
    objetoContrato: string
    prazoContratualDias: number
    diasAditivados: number
    fase: string
    custoDia: number
    dscParalisacao: string | null
    motivoParalisacao: string | null
    id_area_empreendimento: string
  }
  /** Análise de indícios calculada pela página (opcional) */
  analise?: AnaliseRisco
}

export function CardObra({ obra, analise }: CardObraProps) {
  const [mostrarRelato, setMostrarRelato] = useState(false)
  const [relato, setRelato] = useState('')

  const { paralizacaoAtiva, totalParalizacoes, totalDiasParalisado } = useParalizacoes(obra.id_area_empreendimento)

  const atrasoDias = obra.diasAditivados || 0

  // Verificar se está atrasado: prazo atual já passou e não está concluída
  const hoje = new Date()
  const prazoVencido = obra.prazoAtual && obra.prazoAtual < hoje && obra.status !== 'CONCLUIDA'

  // Status visual
  const statusData = STATUS_CORES[obra.status] || { bg: '#f0f0f0', text: '#333' }
  const statusLabel = STATUS_LABELS[obra.status] || obra.status

  // Texto de prazo
  let prazoText = 'Sem prazo'
  if (obra.prazoOriginal && obra.prazoAtual) {
    if (atrasoDias > 0) {
      prazoText = `+${atrasoDias} dias`
    } else if (prazoVencido) {
      const diasVencidos = Math.ceil((hoje.getTime() - obra.prazoAtual.getTime()) / (1000 * 60 * 60 * 24))
      prazoText = `Vencido há ${diasVencidos}d`
    } else {
      prazoText = 'No prazo'
    }
  }

  // Detectar inconsistência: 100% medido mas status não é "Concluída"
  const possivelmenteConcluida =
    obra.pctExecucao >= 100 &&
    obra.status !== 'CONCLUIDA' &&
    obra.valorContrato > 0 &&
    obra.valorMedicao >= obra.valorContrato

  // Cor da barra de progresso
  const progressColor = obra.status === 'CONCLUIDA' || possivelmenteConcluida
    ? 'var(--text-success)'
    : obra.status === 'PARALISADA'
    ? 'var(--text-warning)'
    : prazoVencido
    ? 'var(--text-danger)'
    : 'var(--fill-accent)'

  // Helper para pegar a descrição da paralisação (prioriza motivo_paralisacao)
  const getParalizacaoTexto = (p: any) => {
    return (
      p.motivo_paralisacao ||
      p.descricao_paralisacao ||
      obra.dscParalisacao ||
      obra.motivoParalisacao ||
      'Sem motivo informado'
    )
  }

  const mostraAlerta = analise && (analise.nivel === 'critico' || analise.nivel === 'atencao')

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/obra/${obra.id}`} className={styles.tituloLink}>
            <h3 className={styles.titulo}>{obra.nome}</h3>
          </Link>
          <p className={styles.local}>
            {obra.empresa && obra.empresa !== 'Não informado' ? obra.empresa : `Regional ${obra.regional}`}
          </p>
        </div>
        <div className={styles.headerBadges}>
          <span
            className={styles.status}
            style={{ backgroundColor: statusData.bg, color: statusData.text }}
          >
            {statusLabel}
          </span>
          {mostraAlerta && (
            <span
              className={styles.badgeRisco}
              data-nivel={analise!.nivel}
              title={analise!.alertas.map(a => a.titulo).join(' · ')}
            >
              ⚠ {NIVEL_LABELS[analise!.nivel]}
            </span>
          )}
          {totalParalizacoes > 0 && (
            <span className={styles.badgeParalizacoes}>
              Paralisações: {totalParalizacoes}
              {totalDiasParalisado > 0 && ` (${totalDiasParalisado}d)`}
            </span>
          )}
          {possivelmenteConcluida && (
            <span className={styles.badgeInconsistencia}>
              Possivelmente concluída
            </span>
          )}
        </div>
      </div>

      {/* Métricas principais */}
      <div className={styles.metricas}>
        <div className={styles.metrica}>
          <span className={styles.label}>Valor contrato</span>
          <span className={styles.valor}>
            {obra.valorContrato > 0 ? formatMoeda(obra.valorContrato) : '—'}
          </span>
        </div>
        <div className={styles.metrica}>
          <span className={styles.label}>Aditivos</span>
          <span
            className={styles.valor}
            style={{ color: obra.valorAditivo > 0 ? 'var(--text-warning)' : undefined }}
          >
            {obra.valorAditivo > 0 ? `+${formatMoeda(obra.valorAditivo)}` : '—'}
          </span>
        </div>
        <div className={styles.metrica}>
          <span className={styles.label}>Medido</span>
          <span className={styles.valor}>
            {obra.valorMedicao > 0 ? formatMoeda(obra.valorMedicao) : '—'}
          </span>
        </div>
        <div className={styles.metrica}>
          <span className={styles.label}>Prazo</span>
          <span
            className={styles.valor}
            style={{
              color: prazoVencido ? 'var(--text-danger)' : atrasoDias > 0 ? 'var(--text-warning)' : 'var(--text-success)'
            }}
          >
            {prazoText}
          </span>
        </div>
      </div>

      {/* Barra de progresso baseada em medição/contrato */}
      <div className={styles.progresso}>
        <div className={styles.progressoBar}>
          <div
            className={styles.progressoFill}
            style={{
              width: `${Math.min(obra.pctExecucao, 100)}%`,
              backgroundColor: progressColor,
            }}
          />
        </div>
        <div className={styles.progressoTexto}>
          <span>{obra.fase}</span>
          <span>{obra.pctExecucao}% executado</span>
        </div>
      </div>

      {/* Alertas de fiscalização */}
      {mostraAlerta && analise!.alertas.length > 0 && (
        <div className={styles.avisoRisco} data-nivel={analise!.nivel}>
          <strong>{analise!.alertas[0].titulo}</strong>
          {analise!.alertas.length > 1 && (
            <> e mais {analise!.alertas.length - 1} {analise!.alertas.length - 1 === 1 ? 'indício' : 'indícios'}</>
          )}
          {' — '}
          <Link href={`/obra/${obra.id}`}>ver detalhes</Link>
        </div>
      )}

      {/* Aviso de paralisação */}
      {(obra.status === 'PARALISADA' || paralizacaoAtiva) && (
        <div className={styles.avisoParalisada}>
          <strong>
            {totalParalizacoes > 1 ? `${totalParalizacoes} paralisações` : 'Paralisada'}:
          </strong>
          {' '}
          {getParalizacaoTexto(paralizacaoAtiva || {})}

          {totalDiasParalisado > 0 && (
            <span style={{ fontSize: '12px', opacity: 0.8, marginLeft: '8px' }}>
              (total de {totalDiasParalisado} dias)
            </span>
          )}
        </div>
      )}

      {/* Aviso de possível conclusão */}
      {possivelmenteConcluida && (
        <div className={styles.avisoInconsistencia}>
          <strong>100% medido e pago</strong> — o status no sistema da PBH ainda consta como "{statusLabel}", mas a medição indica que o serviço foi concluído.
        </div>
      )}

      {/* Ações */}
      <div className={styles.acoes}>
        <Link href={`/obra/${obra.id}`} className={styles.botaoPrimario}>
          Ver obra completa →
        </Link>
        <button className={styles.botao} onClick={() => setMostrarRelato(!mostrarRelato)}>
          Relatar problema
        </button>
      </div>

      {mostrarRelato && (
        <div className={styles.relato}>
          <textarea
            value={relato}
            onChange={(e) => setRelato(e.target.value)}
            placeholder="Descreva o problema que você viu nessa obra..."
            rows={3}
          />
          <div className={styles.relatoBotoes}>
            <button>Enviar relato</button>
            <button onClick={() => setMostrarRelato(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
