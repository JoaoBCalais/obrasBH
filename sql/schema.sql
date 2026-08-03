-- ============================================================
-- Schema completo — ObrasBH v2
-- Dados Abertos do Painel Transparência Obras Públicas SMOBI/PBH
-- Execute no Supabase SQL Editor
-- ============================================================


-- ============================================================
-- TABELA PRINCIPAL: OBRAS (contratos de obras públicas)
-- Fonte: CSV "Dados de Contrato" + "Dados de localização"
-- ============================================================

CREATE TABLE IF NOT EXISTS obras (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  id_area_empreendimento TEXT UNIQUE NOT NULL,
  numero_po TEXT,
  nome TEXT NOT NULL,
  regional TEXT,
  status TEXT,
  empresa TEXT,
  tematica TEXT,

  -- Dados financeiros
  valor_contrato NUMERIC(15,2) DEFAULT 0,
  valor_total_medicao NUMERIC(15,2) DEFAULT 0,
  valor_total_aditivo NUMERIC(15,2) DEFAULT 0,
  valor_contrato_com_aditivo NUMERIC(15,2) DEFAULT 0,
  vl_total_ultima_renovacao NUMERIC(15,2) DEFAULT 0,
  vl_total_aditivo_ultima_renovacao NUMERIC(15,2) DEFAULT 0,

  -- Datas e prazos
  data_inicio_cnt DATE,
  data_fim_cnt_original DATE,
  data_fim_cnt_com_aditivos DATE,
  prazo_contratual INTEGER DEFAULT 0,
  numero_dias_aditivados INTEGER DEFAULT 0,

  -- Informações do contrato
  num_cnt TEXT,
  objeto_cnt TEXT,
  tipo_cnt TEXT,

  -- Paralisação
  dsc_paralisacao TEXT,
  motivo_paralisacao TEXT,

  -- Dados ampliados (CSVs adicionais do Power BI SMOBI)
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  pct_execucao_pbh NUMERIC(5,2),
  justificativa_inexecucao TEXT,
  previsao_reinicio DATE,
  origem_contrato TEXT,
  data_paralisacao DATE,

  -- Timestamps
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_obras_regional ON obras(regional);
CREATE INDEX IF NOT EXISTS idx_obras_status ON obras(status);
CREATE INDEX IF NOT EXISTS idx_obras_empresa ON obras(empresa);
CREATE INDEX IF NOT EXISTS idx_obras_num_cnt ON obras(num_cnt);
CREATE INDEX IF NOT EXISTS idx_obras_data_inicio ON obras(data_inicio_cnt);
CREATE INDEX IF NOT EXISTS idx_obras_coordenadas
  ON obras(latitude, longitude) WHERE latitude IS NOT NULL;

-- RLS
ALTER TABLE obras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir leitura pública de obras"
  ON obras FOR SELECT USING (true);


-- ============================================================
-- TABELA: RENOVACOES (aditivos e prorrogações com justificativas)
-- Fonte: CSV "Renovação"
-- ============================================================

CREATE TABLE IF NOT EXISTS renovacoes (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  id_area_empreendimento TEXT NOT NULL
    REFERENCES obras(id_area_empreendimento) ON DELETE CASCADE,
  num_cnt TEXT,

  numero_renovacao INTEGER,
  tipo_renovacao TEXT,
  data_renovacao DATE,
  data_inicio_renovacao DATE,
  data_fim_renovacao DATE,

  justificativa TEXT,
  responsavel_inexecucao TEXT,

  valor_renovacao NUMERIC(15,2) DEFAULT 0,
  valor_aditivo_renovacao NUMERIC(15,2) DEFAULT 0,
  dias_aditivados_renovacao INTEGER DEFAULT 0,
  status_renovacao TEXT,

  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_renovacao UNIQUE (id_area_empreendimento, numero_renovacao)
);

CREATE INDEX IF NOT EXISTS idx_renovacoes_empreendimento
  ON renovacoes(id_area_empreendimento);

ALTER TABLE renovacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública renovacoes"
  ON renovacoes FOR SELECT USING (true);


-- ============================================================
-- TABELA: MEDICOES (histórico de medições periódicas)
-- Fonte: CSV "Dados de Medição"
-- ============================================================

CREATE TABLE IF NOT EXISTS medicoes (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  id_area_empreendimento TEXT NOT NULL
    REFERENCES obras(id_area_empreendimento) ON DELETE CASCADE,
  num_cnt TEXT,

  numero_medicao INTEGER,
  data_medicao DATE,
  periodo_referencia TEXT,

  valor_medicao NUMERIC(15,2) DEFAULT 0,
  valor_acumulado NUMERIC(15,2) DEFAULT 0,
  pct_medicao NUMERIC(5,2),
  pct_acumulado NUMERIC(5,2),

  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_medicao UNIQUE (id_area_empreendimento, numero_medicao)
);

CREATE INDEX IF NOT EXISTS idx_medicoes_empreendimento
  ON medicoes(id_area_empreendimento);
CREATE INDEX IF NOT EXISTS idx_medicoes_data
  ON medicoes(data_medicao);

ALTER TABLE medicoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública medicoes"
  ON medicoes FOR SELECT USING (true);


-- ============================================================
-- TABELA: EXECUCAO_FINANCEIRA (empenhos e pagamentos)
-- Fonte: CSV "Dados de Execução Financeira"
-- ============================================================

CREATE TABLE IF NOT EXISTS execucao_financeira (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  id_area_empreendimento TEXT NOT NULL
    REFERENCES obras(id_area_empreendimento) ON DELETE CASCADE,
  num_cnt TEXT,

  numero_empenho TEXT,
  data_empenho DATE,
  valor_empenhado NUMERIC(15,2) DEFAULT 0,
  valor_liquidado NUMERIC(15,2) DEFAULT 0,
  valor_pago NUMERIC(15,2) DEFAULT 0,
  fonte_recurso TEXT,
  ano_exercicio INTEGER,

  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_execfin UNIQUE (id_area_empreendimento, numero_empenho)
);

CREATE INDEX IF NOT EXISTS idx_execfin_empreendimento
  ON execucao_financeira(id_area_empreendimento);

ALTER TABLE execucao_financeira ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública execfin"
  ON execucao_financeira FOR SELECT USING (true);


-- ============================================================
-- FUNÇÃO: Atualizar timestamp automaticamente
-- ============================================================

CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_atualizado_em ON obras;
CREATE TRIGGER trigger_update_atualizado_em
BEFORE UPDATE ON obras
FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

DROP TRIGGER IF EXISTS trigger_update_atualizado_em_renovacoes ON renovacoes;
CREATE TRIGGER trigger_update_atualizado_em_renovacoes
BEFORE UPDATE ON renovacoes
FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();


-- ============================================================
-- VIEW: OBRAS ATIVAS
-- Obras em execução + iniciadas em 2025+ + concluídas em 2025+
-- ============================================================

CREATE OR REPLACE VIEW obras_ativas AS
SELECT *
FROM obras
WHERE
  status IN ('Em andamento', 'Em Negociação', 'PARALISADA',
             'EM_ANDAMENTO', 'EM_NEGOCIACAO', 'Paralisado')
  OR data_inicio_cnt >= '2025-01-01'
  OR (
    status IN ('Concluido', 'CONCLUIDA', 'Concluída')
    AND data_fim_cnt_com_aditivos >= '2025-01-01'
  );


-- ============================================================
-- VIEW: RESUMO POR REGIONAL (otimiza home page)
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
-- FUNCTION: Obra com todos os dados relacionados
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
