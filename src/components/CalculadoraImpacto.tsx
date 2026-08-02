import React, { useState, useEffect } from 'react'
import { formatMoeda, calcularCustoObrasPorSalario } from '@/lib/format'
import styles from '@/styles/CalculadoraImpacto.module.css'

export function CalculadoraImpacto() {
  const [salario, setSalario] = useState(5000)
  const [impacto, setImpacto] = useState(0)
  const [anual, setAnual] = useState(0)

  useEffect(() => {
    const custoMensal = calcularCustoObrasPorSalario(salario)
    setImpacto(custoMensal)
    setAnual(custoMensal * 12)
  }, [salario])

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.label}>💰 Quanto sai do seu bolso?</div>

        <div className={styles.controle}>
          <span className={styles.legenda}>Sua renda mensal</span>
          <input
            type="range"
            min="1500"
            max="20000"
            step="500"
            value={salario}
            onChange={(e) => setSalario(Number(e.target.value))}
            className={styles.slider}
          />
          <span className={styles.valor}>{formatMoeda(salario)}</span>
        </div>

        <div className={styles.resultado}>
          <div className={styles.numeroGrande}>{formatMoeda(impacto)}</div>
          <div className={styles.contexto}>
            por mês do seu salário vai para obras públicas em BH
          </div>
          <div className={styles.extra}>Ao longo do ano: {formatMoeda(anual)}</div>
        </div>

        <div className={styles.info}>
          <p>
            Este cálculo é baseado na proporção de tributos municipais (IPTU) dedicados a obras públicas.
            Os dados variam conforme a renda e categoria fiscal.
          </p>
        </div>
      </div>
    </div>
  )
}
