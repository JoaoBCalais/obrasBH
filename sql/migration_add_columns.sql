-- ============================================================
-- MIGRAÇÃO: Adicionar colunas do CSV CONTRATOS-SGEE da PBH
-- Execute no Supabase SQL Editor
-- ============================================================

-- Dados financeiros
ALTER TABLE obras ADD COLUMN IF NOT EXISTS valor_contrato NUMERIC(15,2) DEFAULT 0;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS valor_total_medicao NUMERIC(15,2) DEFAULT 0;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS valor_total_aditivo NUMERIC(15,2) DEFAULT 0;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS valor_contrato_com_aditivo NUMERIC(15,2) DEFAULT 0;

-- Datas e prazos
ALTER TABLE obras ADD COLUMN IF NOT EXISTS data_inicio_cnt DATE;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS data_fim_cnt_original DATE;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS data_fim_cnt_com_aditivos DATE;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS prazo_contratual INTEGER DEFAULT 0;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS numero_dias_aditivados INTEGER DEFAULT 0;

-- Informações do contrato
ALTER TABLE obras ADD COLUMN IF NOT EXISTS num_cnt TEXT;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS objeto_cnt TEXT;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS tipo_cnt TEXT;

-- Paralisação
ALTER TABLE obras ADD COLUMN IF NOT EXISTS dsc_paralisacao TEXT;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS motivo_paralisacao TEXT;

-- Informações extras do CSV
ALTER TABLE obras ADD COLUMN IF NOT EXISTS vl_total_ultima_renovacao NUMERIC(15,2) DEFAULT 0;
ALTER TABLE obras ADD COLUMN IF NOT EXISTS vl_total_aditivo_ultima_renovacao NUMERIC(15,2) DEFAULT 0;

-- ============================================================
-- Remover colunas antigas que não existem no CSV (se existirem)
-- ============================================================
ALTER TABLE obras DROP COLUMN IF EXISTS valor_gasto;
ALTER TABLE obras DROP COLUMN IF EXISTS pct_execucao;
ALTER TABLE obras DROP COLUMN IF EXISTS prazo_original;
ALTER TABLE obras DROP COLUMN IF EXISTS prazo_atual;
ALTER TABLE obras DROP COLUMN IF EXISTS trabalhadores;
ALTER TABLE obras DROP COLUMN IF EXISTS custo_dia;
