import pool from "../db/db.js";

/**
 * Consolida informações necessárias para a tela de geração de mensalidades
 * e gráficos relacionados (Dashboard Admin).
 *
 * Tudo é feito em UMA única consulta SQL para:
 * - evitar múltiplas idas ao banco;
 * - reduzir latência;
 * - facilitar cache no frontend.
 */
export async function getCreateMensalDonationData({
  startDate = null,
  endDate = null,
} = {}) {
  const query = `
    WITH
      campaigns AS (
        SELECT
          c.id,
          c.campain_name,
          c.active
        FROM campain c
        WHERE c.active = true
        ORDER BY c.campain_name
      ),
      mensal_daily AS (
        SELECT
          s.summary_date,
          s.total_mensal
        FROM donor_mensal_daily_summary s
        WHERE ($1::date IS NULL OR s.summary_date >= $1::date)
          AND ($2::date IS NULL OR s.summary_date <= $2::date)
        ORDER BY s.summary_date ASC
      ),
      mensal_evolution AS (
        SELECT
          e.summary_date,
          e.percentual_evolucao
        FROM donor_mensal_daily_evolution e
        ORDER BY e.summary_date ASC
      ),
      month_history AS (
        SELECT
          h.date_ref
        FROM month_history h
        ORDER BY h.date_ref DESC
        LIMIT 24
      )
    SELECT
      COALESCE(
        (
          SELECT json_agg(row_to_json(c)) FROM campaigns c
        ),
        '[]'
      ) AS campaigns,
      COALESCE(
        (
          SELECT json_agg(row_to_json(m)) FROM mensal_daily m
        ),
        '[]'
      ) AS mensal_daily_summary,
      COALESCE(
        (
          SELECT json_agg(row_to_json(e)) FROM mensal_evolution e
        ),
        '[]'
      ) AS mensal_daily_evolution,
      COALESCE(
        (
          SELECT json_agg(row_to_json(h)) FROM month_history h
        ),
        '[]'
      ) AS month_history
  `;

  const values = [startDate || null, endDate || null];
  const { rows } = await pool.query(query, values);
  const row = rows[0] || {};

  return {
    campaigns: Array.isArray(row.campaigns) ? row.campaigns : [],
    mensalDailySummary: Array.isArray(row.mensal_daily_summary)
      ? row.mensal_daily_summary
      : [],
    mensalDailyEvolution: Array.isArray(row.mensal_daily_evolution)
      ? row.mensal_daily_evolution
      : [],
    monthHistory: Array.isArray(row.month_history) ? row.month_history : [],
  };
}

/**
 * Gera mensalidades para um mês de referência.
 *
 * Regras:
 * - Usa donor_mensal como fonte de verdade.
 * - Só gera para registros ativos (active IS NULL ou true).
 * - Gera apenas para doadores cujo dia do mensal coincide com o dia do mês
 *   da data de referência (mesRef).
 * - Não gera duplicado: se já houver doação com donation_monthref no mesmo
 *   mês (date_trunc('month')), não insere novamente.
 * - Registra o mês em month_history para garantir idempotência.
 *
 * Tudo é feito em uma transação.
 */
export async function generateMensalDonations({
  mesRef,
  campain,
  operatorId = 521,
  collectorId = 22,
}) {
  if (!mesRef) {
    throw new Error("Parâmetro 'mesRef' é obrigatório.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Garante idempotência: se já houver histórico para o mês específico,
    // não cria novamente.
    const historyCheck = await client.query(
      `
        SELECT date_ref
        FROM month_history
        WHERE date_ref = $1::date
        FOR UPDATE
      `,
      [mesRef]
    );

    if (historyCheck.rowCount > 0) {
      await client.query("ROLLBACK");
      return {
        alreadyGenerated: true,
        generatedCount: 0,
      };
    }

    // Registra o mês em month_history.
    await client.query(
      `
        INSERT INTO month_history (date_ref)
        VALUES ($1::date)
      `,
      [mesRef]
    );

    // Insere as novas doações de forma vetorizada, sem loop em JS.
    const insertQuery = `
      INSERT INTO donation (
        donor_id,
        operator_code_id,
        donation_value,
        donation_extra,
        donation_day_contact,
        donation_day_to_receive,
        donation_print,
        donation_received,
        donation_description,
        donation_monthref,
        donation_campain,
        collector_code_id
      )
      SELECT
        dm.donor_id,
        $2::int AS operator_code_id,
        COALESCE(dm.donor_mensal_monthly_fee, 0) AS donation_value,
        NULL::numeric AS donation_extra,
        NOW()::date AS donation_day_contact,
        make_date(
          EXTRACT(YEAR FROM $1::date)::int,
          EXTRACT(MONTH FROM $1::date)::int,
          GREATEST(1, LEAST(dm.donor_mensal_day, 28))::int
        ) AS donation_day_to_receive,
        'Não'::text AS donation_print,
        'Não'::text AS donation_received,
        CONCAT('Criado Automaticamente ', to_char(NOW()::timestamp, 'DD/MM/YYYY HH24:MI')) AS donation_description,
        $1::date AS donation_monthref,
        $3::text AS donation_campain,
        $4::int AS collector_code_id
      FROM donor_mensal dm
      WHERE (dm.active IS NULL OR dm.active = true)
        AND dm.donor_mensal_day IS NOT NULL
        AND dm.donor_mensal_day = EXTRACT(DAY FROM $1::date)::int
        AND NOT EXISTS (
          SELECT 1
          FROM donation d
          WHERE d.donor_id = dm.donor_id
            AND date_trunc('month', d.donation_monthref) = date_trunc('month', $1::date)
        )
      RETURNING receipt_donation_id
    `;

    const insertValues = [mesRef, operatorId, campain || null, collectorId];
    const insertResult = await client.query(insertQuery, insertValues);

    await client.query("COMMIT");

    return {
      alreadyGenerated: false,
      generatedCount: insertResult.rowCount,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

