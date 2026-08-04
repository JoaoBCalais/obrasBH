-- ============================================================
-- MIGRATION v3 — View de indicadores agregados por obra
-- Execute no Supabase SQL Editor
-- ============================================================
--
-- Por que existe:
--   O motor de risco só enxergava a linha da tabela "obras". As tabelas
--   medicoes (14.495 linhas), renovacoes (1.059) e execucao_financeira
--   (1.058) eram sincronizadas e nunca usadas.
--
--   Trazer 14 mil linhas de medição para o navegador a cada carga seria
--   caro. Esta view agrega no servidor e devolve UMA linha por obra, com
--   os números que o motor precisa para gerar indícios novos:
--
--     - estagnação           -> ultima_medicao
--     - aditivo real         -> soma_aditivo_renovacoes
--     - aditivo em salame    -> num_renovacoes
--     - descolamento fiscal  -> empenhado / liquidado / pago
--
-- Seguro para rodar múltiplas vezes (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE VIEW obra_indicadores AS
WITH med AS (
  SELECT
    id_area_empreendimento,
    COUNT(*)                              AS total_medicoes,
    MAX(data_medicao)                     AS ultima_medicao,
    MIN(data_medicao)                     AS primeira_medicao,
    SUM(valor_medicao)                    AS soma_medicoes,
    -- Quantas medições nos últimos 12 meses: mede o ritmo atual da obra
    COUNT(*) FILTER (
      WHERE data_medicao >= CURRENT_DATE - INTERVAL '12 months'
    )                                     AS medicoes_12m
  FROM medicoes
  WHERE data_medicao IS NOT NULL
  GROUP BY id_area_empreendimento
),
ren AS (
  SELECT
    id_area_empreendimento,
    COUNT(*)                              AS num_renovacoes,
    -- Soma dos ACRÉSCIMOS de fato, não do reajuste inflacionário que o
    -- CSV de contratos traz em "Valor Total Reajuste".
    SUM(valor_aditivo_renovacao)          AS soma_aditivo_renovacoes,
    MAX(data_renovacao)                   AS ultima_renovacao,
    MIN(data_renovacao)                   AS primeira_renovacao
  FROM renovacoes
  GROUP BY id_area_empreendimento
),
fin AS (
  SELECT
    id_area_empreendimento,
    SUM(valor_empenhado)                  AS empenhado,
    SUM(valor_liquidado)                  AS liquidado,
    SUM(valor_pago)                       AS pago
  FROM execucao_financeira
  GROUP BY id_area_empreendimento
)
SELECT
  o.id_area_empreendimento,
  o.id                                             AS obra_id,

  COALESCE(med.total_medicoes, 0)                  AS total_medicoes,
  med.ultima_medicao,
  med.primeira_medicao,
  COALESCE(med.medicoes_12m, 0)                    AS medicoes_12m,
  COALESCE(med.soma_medicoes, 0)                   AS soma_medicoes,

  COALESCE(ren.num_renovacoes, 0)                  AS num_renovacoes,
  COALESCE(ren.soma_aditivo_renovacoes, 0)         AS soma_aditivo_renovacoes,
  ren.ultima_renovacao,
  ren.primeira_renovacao,

  COALESCE(fin.empenhado, 0)                       AS empenhado,
  COALESCE(fin.liquidado, 0)                       AS liquidado,
  COALESCE(fin.pago, 0)                            AS pago,
  -- NULL (e não 0) quando não há dado de execução financeira para a obra,
  -- para o motor conseguir distinguir "não pagou" de "não sabemos".
  CASE WHEN COALESCE(fin.empenhado, 0) > 0
       THEN ROUND((fin.pago / fin.empenhado) * 100)
       ELSE NULL END                               AS pct_pago_sobre_empenhado,

  -- Meses desde a última medição: o indicador de estagnação.
  -- (CURRENT_DATE - date) já devolve um inteiro de dias no Postgres, então a
  -- conta é direta — não é um interval, e por isso não cabe EXTRACT aqui.
  CASE WHEN med.ultima_medicao IS NOT NULL
       THEN ROUND((CURRENT_DATE - med.ultima_medicao)::numeric / 30.44)
       ELSE NULL END                               AS meses_sem_medicao
FROM obras o
LEFT JOIN med ON med.id_area_empreendimento = o.id_area_empreendimento
LEFT JOIN ren ON ren.id_area_empreendimento = o.id_area_empreendimento
LEFT JOIN fin ON fin.id_area_empreendimento = o.id_area_empreendimento;

-- Views herdam o RLS das tabelas base no Postgres 15+; nas versões anteriores
-- a view roda como o dono. As tabelas base já têm policy de leitura pública.
--
-- Os papéis anon/authenticated são do Supabase. O bloco abaixo ignora a
-- concessão caso a migração seja executada em um Postgres comum (onde esses
-- papéis não existem), em vez de abortar o script inteiro.
DO $$
BEGIN
  GRANT SELECT ON obra_indicadores TO anon, authenticated;
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'Papéis anon/authenticated não existem — GRANT ignorado.';
END $$;
