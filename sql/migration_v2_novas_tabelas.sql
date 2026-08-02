-- ============================================================
-- MIGRATION v2 — Novas tabelas e colunas para dados ampliados
-- Execute no Supabase SQL Editor
-- Data: 2026-08-01
-- ============================================================
--
-- O que muda:
--   1. Novos campos na tabela "obras" (coordenadas, percentual PBH, justificativa)
--   2. Nova tabela "renovacoes" (histórico de aditivos com justificativas)
--   3. Nova tabela "medicoes" (histórico mensal de medição)
--   4. Nova tabela "execucao_financeira" (empenhos e pagamentos)
--   5. View "obras_ativas" (filtra obras de 2025+ ou ainda em execução)
--   6. View "resumo_regionais" (dados agregados por regional)
--   7. Function "obra_completa" (busca obra + renovações + medições)
--
-- Seguro para rodar múltiplas vezes (usa IF NOT EXISTS / OR REPLACE)
-- ============================================================


-- ============================================================
-- 1. NOVOS CAMPOS NA TABELA OBRAS
-- ============================================================

-- Coordenadas geográficas (CSV "Dados de localização")
ALTER TABLE obras ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE obras ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);

-- Percentual de execução oficial da PBH
ALTER TABLE obras ADD COLUMN IF NOT EXISTS pct_execucao_pbh NUMERIC(5,2);

-- Justificativa de inexecução (campo detalhado do Power BI)
ALTER TABLE obras ADD COLUMN IF NOT EXISTS justificativa_inexecucao TEXT;

-- Previsão de reinício (para obras paralisadas)
ALTER TABLE obras ADD COLUMN IF NOT EXISTS previsao_reinicio DATE;

-- Origem do contrato
ALTER TABLE obras ADD COLUMN IF NOT EXISTS origem_contrato TEXT;

-- Data de paralisação específica
ALTER TABLE obras ADD COLUMN IF NOT EXISTS data_paralisacao DATE;

-- Índice para buscas geográficas (futuro mapa)
CREATE INDEX IF NOT EXISTS idx_obras_coordenadas
  ON obras(latitude, longitude) WHERE latitude IS NOT NULL;

-- Índice para filtro de obras ativas por data
CREATE INDEX IF NOT EXISTS idx_obras_data_inicio
  ON obras(data_inicio_cnt);


-- ============================================================
-- 2. TABELA RENOVACOES
--    Histórico de renovações/aditivos de cada contrato.
--    Contém as JUSTIFICATIVAS de prorrogação de prazo.
-- ============================================================

CREATE TABLE IF NOT EXISTS renovacoes (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,

  -- Ligação com obras (pelo empreendimento)
  id_area_empreendimento TEXT NOT NULL,
  num_cnt TEXT,

  -- Dados da renovação
  numero_renovacao INTEGER,
  tipo_renovacao TEXT,
  data_renovacao DATE,
  data_inicio_renovacao DATE,
  data_fim_renovacao DATE,

  -- Justificativa (o dado mais importante!)
  justificativa TEXT,
  responsavel_inexecucao TEXT,

  -- Valores
  valor_renovacao NUMERIC(15,2) DEFAULT 0,
  valor_aditivo_renovacao NUMERIC(15,2) DEFAULT 0,
  dias_aditivados_renovacao INTEGER DEFAULT 0,

  -- Status
  status_renovacao TEXT,

  -- Controle
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraint para evitar duplicatas no sync
  CONSTRAINT uq_renovacao UNIQUE (id_area_empreendimento, numero_renovacao)
);

-- Foreign key (separada para não falhar se a obra ainda não existir no sync)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_renovacoes_obra'
  ) THEN
    ALTER TABLE renovacoes
      ADD CONSTRAINT fk_renovacoes_obra
      FOREIGN KEY (id_area_empreendimento)
      REFERENCES obras(id_area_empreendimento)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_renovacoes_empreendimento
  ON renovacoes(id_area_empreendimento);

ALTER TABLE renovacoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'renovacoes' AND policyname = 'Leitura pública renovacoes'
  ) THEN
    CREATE POLICY "Leitura pública renovacoes"
      ON renovacoes FOR SELECT USING (true);
  END IF;
END $$;

-- Trigger atualizado_em
DROP TRIGGER IF EXISTS trigger_update_atualizado_em_renovacoes ON renovacoes;
CREATE TRIGGER trigger_update_atualizado_em_renovacoes
BEFORE UPDATE ON renovacoes
FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();


-- ============================================================
-- 3. TABELA MEDICOES
--    Histórico de medições (quanto foi executado em cada período).
--    Permite gráfico de evolução temporal da obra.
-- ============================================================

CREATE TABLE IF NOT EXISTS medicoes (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,

  -- Ligação com obras
  id_area_empreendimento TEXT NOT NULL,
  num_cnt TEXT,

  -- Dados da medição
  numero_medicao INTEGER,
  data_medicao DATE,
  periodo_referencia TEXT,

  -- Valores
  valor_medicao NUMERIC(15,2) DEFAULT 0,
  valor_acumulado NUMERIC(15,2) DEFAULT 0,
  pct_medicao NUMERIC(5,2),
  pct_acumulado NUMERIC(5,2),

  -- Controle
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Evitar duplicatas
  CONSTRAINT uq_medicao UNIQUE (id_area_empreendimento, numero_medicao)
);

-- Foreign key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_medicoes_obra'
  ) THEN
    ALTER TABLE medicoes
      ADD CONSTRAINT fk_medicoes_obra
      FOREIGN KEY (id_area_empreendimento)
      REFERENCES obras(id_area_empreendimento)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_medicoes_empreendimento
  ON medicoes(id_area_empreendimento);
CREATE INDEX IF NOT EXISTS idx_medicoes_data
  ON medicoes(data_medicao);

ALTER TABLE medicoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'medicoes' AND policyname = 'Leitura pública medicoes'
  ) THEN
    CREATE POLICY "Leitura pública medicoes"
      ON medicoes FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================
-- 4. TABELA EXECUCAO_FINANCEIRA
--    Registros de empenho, liquidação e pagamento.
-- ============================================================

CREATE TABLE IF NOT EXISTS execucao_financeira (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,

  -- Ligação com obras
  id_area_empreendimento TEXT NOT NULL,
  num_cnt TEXT,

  -- Dados financeiros
  numero_empenho TEXT,
  data_empenho DATE,
  valor_empenhado NUMERIC(15,2) DEFAULT 0,
  valor_liquidado NUMERIC(15,2) DEFAULT 0,
  valor_pago NUMERIC(15,2) DEFAULT 0,
  fonte_recurso TEXT,
  ano_exercicio INTEGER,

  -- Controle
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Evitar duplicatas
  CONSTRAINT uq_execfin UNIQUE (id_area_empreendimento, numero_empenho)
);

-- Foreign key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_execfin_obra'
  ) THEN
    ALTER TABLE execucao_financeira
      ADD CONSTRAINT fk_execfin_obra
      FOREIGN KEY (id_area_empreendimento)
      REFERENCES obras(id_area_empreendimento)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_execfin_empreendimento
  ON execucao_financeira(id_area_empreendimento);

ALTER TABLE execucao_financeira ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'execucao_financeira' AND policyname = 'Leitura pública execfin'
  ) THEN
    CREATE POLICY "Leitura pública execfin"
      ON execucao_financeira FOR SELECT USING (true);
  END IF;
END $$;


-- ============================================================
-- 5. VIEW: OBRAS ATIVAS
--    "Obras de 2025/2026 ou que ainda estão em execução"
-- ============================================================

CREATE OR REPLACE VIEW obras_ativas AS
SELECT *
FROM obras
WHERE
  -- Ainda em execução (qualquer ano)
  status IN ('Em andamento', 'Em Negociação', 'PARALISADA',
             'EM_ANDAMENTO', 'EM_NEGOCIACAO', 'Paralisado')
  -- OU iniciadas em 2025+
  OR data_inicio_cnt >= '2025-01-01'
  -- OU concluídas recentemente (2025+)
  OR (
    status IN ('Concluido', 'CONCLUIDA', 'Concluída')
    AND data_fim_cnt_com_aditivos >= '2025-01-01'
  );


-- ============================================================
-- 6. VIEW: RESUMO POR REGIONAL (otimiza a home page)
-- ============================================================

CREATE OR REPLACE VIEW resumo_regionais AS
SELECT
  COALESCE(regional, 'Sem regional') AS regional,
  COUNT(*) AS total_obras,
  COUNT(*) FILTER (WHERE status IN ('Em andamento', 'EM_ANDAMENTO')) AS em_andamento,
  COUNT(*) FILTER (WHERE status IN ('Concluido', 'CONCLUIDA', 'Concluída')) AS concluidas,
  COUNT(*) FILTER (WHERE status IN ('PARALISADA', 'Paralisado')) AS paralisadas,
  COALESCE(SUM(valor_contrato), 0) AS valor_total,
  COALESCE(SUM(valor_total_medicao), 0) AS valor_medido,
  CASE
    WHEN SUM(valor_contrato) > 0
    THEN ROUND((SUM(valor_total_medicao) / SUM(valor_contrato)) * 100)
    ELSE 0
  END AS pct_execucao
FROM obras_ativas
GROUP BY regional
ORDER BY COUNT(*) DESC;


-- ============================================================
-- 7. FUNCTION: Obra com dados completos
--    Retorna obra + renovações + últimas medições em uma query
-- ============================================================

CREATE OR REPLACE FUNCTION obra_completa(p_empreendimento TEXT)
RETURNS JSON AS $$
  SELECT json_build_object(
    'obra', (
      SELECT row_to_json(o)
      FROM obras o
      WHERE o.id_area_empreendimento = p_empreendimento
    ),
    'renovacoes', COALESCE((
      SELECT json_agg(row_to_json(r) ORDER BY r.data_renovacao DESC)
      FROM renovacoes r
      WHERE r.id_area_empreendimento = p_empreendimento
    ), '[]'::json),
    'medicoes', COALESCE((
      SELECT json_agg(row_to_json(m) ORDER BY m.numero_medicao DESC)
      FROM medicoes m
      WHERE m.id_area_empreendimento = p_empreendimento
    ), '[]'::json),
    'execucao', COALESCE((
      SELECT json_agg(row_to_json(e) ORDER BY e.data_empenho DESC)
      FROM execucao_financeira e
      WHERE e.id_area_empreendimento = p_empreendimento
    ), '[]'::json)
  );
$$ LANGUAGE SQL STABLE;


-- ============================================================
-- PRONTO! Agora o Supabase está preparado para receber:
--   ✅ Coordenadas geográficas
--   ✅ Percentual de execução oficial
--   ✅ Justificativas de atraso/paralisação
--   ✅ Histórico de renovações e aditivos
--   ✅ Histórico de medições
--   ✅ Dados de execução financeira
--   ✅ View de obras ativas (2025+ ou em andamento)
--   ✅ View resumo por regional
--   ✅ Function para buscar obra completa
-- ============================================================
