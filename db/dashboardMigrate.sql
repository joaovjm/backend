--  Tabela dashboard_metrics

CREATE TABLE IF NOT EXISTS dashboard_metrics (
  id                        integer PRIMARY KEY,
  operator_code_id          integer NULL,
  total_received            numeric(14,2) NOT NULL DEFAULT 0,
  confirmations             integer       NOT NULL DEFAULT 0,
  total_confirmations_value numeric(14,2) NOT NULL DEFAULT 0,
  open_donations            integer       NOT NULL DEFAULT 0,
  value_open_donations      numeric(14,2) NOT NULL DEFAULT 0,
  updated_at                timestamptz   NOT NULL DEFAULT now()
);

-- Registro global (id = 1, sem operador)
INSERT INTO dashboard_metrics (id, operator_code_id)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION refresh_dashboard_metrics()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Limpa métricas anteriores
  DELETE FROM dashboard_metrics;

  -- Métricas globais (id = 1)
  INSERT INTO dashboard_metrics (
    id,
    operator_code_id,
    total_received,
    confirmations,
    total_confirmations_value,
    open_donations,
    value_open_donations,
    updated_at
  )
  SELECT
    1 AS id,
    NULL::integer AS operator_code_id,
    COALESCE(SUM(CASE WHEN d.donation_received = 'Sim' THEN d.donation_value END), 0) AS total_received,
    COUNT(*) FILTER (
      WHERE (d.donation_received = 'Não' OR d.donation_received = 'Nao')
        AND d.collector_code_id = 10
    ) AS confirmations,
    COALESCE(SUM(
      CASE
        WHEN (d.donation_received = 'Não' OR d.donation_received = 'Nao')
         AND d.collector_code_id = 10
        THEN d.donation_value
      END
    ), 0) AS total_confirmations_value,
    COUNT(*) FILTER (
      WHERE (d.donation_received = 'Não' OR d.donation_received = 'Nao')
        AND (d.collector_code_id IS NULL OR d.collector_code_id NOT IN (10, 11))
    ) AS open_donations,
    COALESCE(SUM(
      CASE
        WHEN (d.donation_received = 'Não' OR d.donation_received = 'Nao')
         AND (d.collector_code_id IS NULL OR d.collector_code_id NOT IN (10, 11))
        THEN d.donation_value
      END
    ), 0) AS value_open_donations,
    now() AS updated_at
  FROM donation d;

  -- Métricas por operador (1 linha por operator_code_id)
  INSERT INTO dashboard_metrics (
    id,
    operator_code_id,
    total_received,
    confirmations,
    total_confirmations_value,
    open_donations,
    value_open_donations,
    updated_at
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY d.operator_code_id) + 1 AS id,
    d.operator_code_id,
    COALESCE(SUM(CASE WHEN d.donation_received = 'Sim' THEN d.donation_value END), 0) AS total_received,
    COUNT(*) FILTER (
      WHERE (d.donation_received = 'Não' OR d.donation_received = 'Nao')
        AND d.collector_code_id = 10
    ) AS confirmations,
    COALESCE(SUM(
      CASE
        WHEN (d.donation_received = 'Não' OR d.donation_received = 'Nao')
         AND d.collector_code_id = 10
        THEN d.donation_value
      END
    ), 0) AS total_confirmations_value,
    COUNT(*) FILTER (
      WHERE (d.donation_received = 'Não' OR d.donation_received = 'Nao')
        AND (d.collector_code_id IS NULL OR d.collector_code_id NOT IN (10, 11))
    ) AS open_donations,
    COALESCE(SUM(
      CASE
        WHEN (d.donation_received = 'Não' OR d.donation_received = 'Nao')
         AND (d.collector_code_id IS NULL OR d.collector_code_id NOT IN (10, 11))
        THEN d.donation_value
      END
    ), 0) AS value_open_donations,
    now() AS updated_at
  FROM donation d
  WHERE d.operator_code_id IS NOT NULL
  GROUP BY d.operator_code_id;

  RETURN NULL;
END;
$$;

-- Trigger para atualizar as métricas automaticamente
DROP TRIGGER IF EXISTS trg_refresh_dashboard_metrics ON donation;

CREATE TRIGGER trg_refresh_dashboard_metrics
AFTER INSERT OR UPDATE OR DELETE ON donation
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_dashboard_metrics();


-- View para obter o telefone primário do doador
CREATE OR REPLACE VIEW donor_phone_primary AS
SELECT
  d.donor_id,
  COALESCE(dt1.donor_tel_1, dt2.donor_tel_2, dt3.donor_tel_3) AS donor_phone
FROM donor d
LEFT JOIN donor_tel_1 dt1 ON dt1.donor_id = d.donor_id
LEFT JOIN donor_tel_2 dt2 ON dt2.donor_id = d.donor_id
LEFT JOIN donor_tel_3 dt3 ON dt3.donor_id = d.donor_id;

-- View para obter o dia mensal do doador mensal
CREATE OR REPLACE VIEW donor_mensal_primary AS
SELECT
  dm.donor_id,
  MIN(dm.donor_mensal_day) AS donor_mensal_day
FROM donor_mensal dm
GROUP BY dm.donor_id;