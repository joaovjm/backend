import pool from "../db/db.js";

/**
 * Doações pendentes de impressão para a tela Verificação de Impressão.
 * - donation_print = 'Não', donation_received = 'Não'
 * - donation_day_to_receive no intervalo [startDate, endDate]
 * - Filtro opcional por tipo de doador (donor_type: Avulso | Mensal | Todos)
 * - Para cada doador, sugere coletador da última doação recebida (excluindo 10 e 11)
 */
export async function getDonationsForPrint({
  startDate,
  endDate,
  donationType = "Todos",
}) {
  if (!startDate || !endDate) {
    return [];
  }

  const query = `
    WITH base AS (
      SELECT
        d.receipt_donation_id,
        d.donor_id,
        d.donation_value,
        d.donation_print,
        d.donation_received,
        d.donation_day_to_receive,
        d.donation_monthref,
        d.collector_code_id,
        d.operator_code_id,
        d.donation_description,
        c.collector_name,
        op.operator_name,
        dn.donor_id AS donor_donor_id,
        dn.donor_name AS donor_name,
        dn.donor_address AS donor_address,
        dn.donor_city AS donor_city,
        dn.donor_neighborhood AS donor_neighborhood,
        dn.donor_tel_1 AS donor_tel_1,
        dn.donor_type AS donor_type,
        do_obs.donor_observation,
        do_ref.donor_reference,
        dm.donor_mensal_day,
        dm.active AS donor_mensal_active
      FROM donation d
      JOIN donor dn ON dn.donor_id = d.donor_id
      LEFT JOIN collector c ON c.collector_code_id = d.collector_code_id
      LEFT JOIN operator op ON op.operator_code_id = d.operator_code_id
      LEFT JOIN donor_observation do_obs ON do_obs.donor_id = d.donor_id
      LEFT JOIN donor_reference do_ref ON do_ref.donor_id = d.donor_id
      LEFT JOIN donor_mensal dm ON dm.donor_id = d.donor_id
      WHERE d.donation_print = 'Não'
        AND d.donation_received = 'Não'
        AND d.donation_day_to_receive >= $1::date
        AND d.donation_day_to_receive <= $2::date
    ),
    suggested AS (
      SELECT DISTINCT ON (d2.donor_id)
        d2.donor_id,
        d2.collector_code_id AS ult_collector_id,
        c2.collector_name AS ult_collector_name
      FROM donation d2
      JOIN collector c2 ON c2.collector_code_id = d2.collector_code_id
      WHERE d2.donation_received = 'Sim'
        AND d2.collector_code_id IS NOT NULL
        AND d2.collector_code_id NOT IN (10, 11)
      ORDER BY d2.donor_id, d2.donation_day_received DESC NULLS LAST
    )
    SELECT
      b.*,
      s.ult_collector_id,
      s.ult_collector_name
    FROM base b
    LEFT JOIN suggested s ON s.donor_id = b.donor_id
    ORDER BY
      CASE WHEN b.collector_code_id = 22 THEN 1 ELSE 0 END,
      b.collector_code_id NULLS LAST,
      b.receipt_donation_id
  `;

  const { rows } = await pool.query(query, [startDate, endDate]);

  let list = rows.map((row) => {
    const donor = {
      donor_id: row.donor_donor_id,
      donor_name: row.donor_name,
      donor_address: row.donor_address,
      donor_city: row.donor_city,
      donor_neighborhood: row.donor_neighborhood,
      donor_tel_1: row.donor_tel_1,
      donor_type: row.donor_type,
      donor_observation: row.donor_observation
        ? { donor_observation: row.donor_observation }
        : undefined,
      donor_reference: row.donor_reference
        ? { donor_reference: row.donor_reference }
        : undefined,
      donor_mensal:
        row.donor_mensal_day != null || row.donor_mensal_active != null
          ? {
              donor_mensal_day: row.donor_mensal_day,
              active: row.donor_mensal_active,
            }
          : undefined,
    };

    const hasSuggested =
      row.ult_collector_id != null && row.ult_collector_name != null;
    const useCollectorId = hasSuggested ? row.ult_collector_id : row.collector_code_id;
    const useCollectorName = hasSuggested ? row.ult_collector_name : row.collector_name;

    return {
      receipt_donation_id: row.receipt_donation_id,
      donor_id: row.donor_id,
      donation_value: row.donation_value,
      donation_print: row.donation_print,
      donation_received: row.donation_received,
      donation_day_to_receive: row.donation_day_to_receive,
      donation_monthref: row.donation_monthref,
      donation_description: row.donation_description,
      collector_code_id: useCollectorId,
      collector: { collector_name: useCollectorName },
      ult_collector: row.ult_collector_id,
      collector_ult: row.ult_collector_name
        ? { collector_name: row.ult_collector_name }
        : null,
      operator_code_id: row.operator_code_id,
      operator: row.operator_name ? { operator_name: row.operator_name } : null,
      donor,
      ...(hasSuggested && {
        original_collector_code_id: row.collector_code_id,
      }),
    };
  });

  if (donationType !== "Todos") {
    list = list.filter((item) => item.donor?.donor_type === donationType);
  }

  return list;
}
