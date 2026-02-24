import pool from "../db/db.js";

const DATE_FIELD_BY_TYPE = {
  received: "donation_day_received",
  open: "donation_day_to_receive",
  created: "donation_day_contact",
};

/**
 * Retorna o nome da coluna de data conforme o tipo de busca.
 */
function getDateField(searchType) {
  return DATE_FIELD_BY_TYPE[searchType] || "donation_day_received";
}

/**
 * Relatório de doações do operador em uma única query.
 * - searchType: 'received' | 'open' | 'created'
 * - received: donation_received = 'Sim' e filtra por donation_day_received
 * - open: por donation_day_to_receive
 * - created: por donation_day_contact
 * Retorno: { totalValue, donations }.
 */
export async function getOperatorReport({
  startDate,
  endDate,
  operatorId = null,
  searchType = "received",
}) {
  if (!startDate || !endDate) {
    return { totalValue: 0, donations: [] };
  }

  const dateField = getDateField(searchType);
  const operatorFilter = operatorId ? "AND d.operator_code_id = $3" : "";

  const query = `
    WITH filtered AS (
      SELECT
        d.receipt_donation_id,
        d.donation_value,
        d.donation_day_received,
        d.donation_day_to_receive,
        d.donation_day_contact,
        d.operator_code_id,
        donor.donor_name,
        op.operator_name
      FROM donation d
      INNER JOIN donor ON donor.donor_id = d.donor_id
      LEFT JOIN operator op ON op.operator_code_id = d.operator_code_id
      WHERE d.operator_code_id IS NOT NULL
        AND d.${dateField} >= $1::date
        AND d.${dateField} <= $2::date
        ${searchType === "received" ? "AND (d.donation_received = 'Sim' OR d.donation_received = 'sim')" : ""}
        ${operatorFilter}
    ),
    agg AS (
      SELECT
        COALESCE(SUM(donation_value), 0) AS total_value,
        COALESCE(
          json_agg(
            json_build_object(
              'receipt_donation_id', receipt_donation_id,
              'donation_value', donation_value,
              'donation_day_received', donation_day_received,
              'donation_day_to_receive', donation_day_to_receive,
              'donation_day_contact', donation_day_contact,
              'operator_code_id', operator_code_id,
              'donor', json_build_object('donor_name', donor_name),
              'operator_name', json_build_object('operator_name', operator_name)
            )
            ORDER BY donation_value DESC NULLS LAST
          ) FILTER (WHERE receipt_donation_id IS NOT NULL),
          '[]'
        ) AS donations
      FROM filtered
    )
    SELECT total_value::numeric AS total_value, donations FROM agg
  `;

  const values = operatorId ? [startDate, endDate, operatorId] : [startDate, endDate];

  const { rows } = await pool.query(query, values);
  const row = rows[0];

  if (!row) {
    return { totalValue: 0, donations: [] };
  }

  const donations =
    typeof row.donations === "string" ? JSON.parse(row.donations || "[]") : row.donations || [];

  return {
    totalValue: Number(row.total_value) || 0,
    donations,
  };
}
