import pool from "../db/db.js";

function normalizeDateRange(startDate, endDate) {
  const dataAtual = new Date();
  const ano = dataAtual.getFullYear();
  const mes = String(dataAtual.getMonth() + 1).padStart(2, "0");
  const primeiroDia = "01";
  const ultimoDia = String(
    new Date(ano, dataAtual.getMonth() + 1, 0).getDate()
  ).padStart(2, "0");

  let dataInicio;
  let dataFim;

  if (startDate && endDate) {
    dataInicio = startDate;
    dataFim = endDate;
  } else if (startDate) {
    dataInicio = startDate;
    dataFim = `${ano}-${mes}-${ultimoDia}`;
  } else if (endDate) {
    dataInicio = `${ano}-${mes}-${primeiroDia}`;
    dataFim = endDate;
  } else {
    dataInicio = `${ano}-${mes}-${primeiroDia}`;
    dataFim = `${ano}-${mes}-${ultimoDia}`;
  }

  return { dataInicio, dataFim };
}

/**
 * Agrega doações recebidas por dia em uma única consulta.
 * - Considera apenas donation_received = 'Sim' e operator_code_id não nulo.
 * - Filtra por intervalo de datas normalizado (mês atual quando não informado).
 */
export async function getDonationsReceivedSummary({ startDate, endDate }) {
  const { dataInicio, dataFim } = normalizeDateRange(startDate, endDate);

  const query = `
    WITH daily AS (
      SELECT
        d.donation_day_received::date AS date,
        COUNT(*) AS total_count,
        SUM(d.donation_value) AS total_value
      FROM donation d
      WHERE d.donation_received = 'Sim'
        AND d.operator_code_id IS NOT NULL
        AND d.donation_day_received >= $1
        AND d.donation_day_received <= $2
      GROUP BY d.donation_day_received::date
    )
    SELECT
      date,
      total_count,
      total_value,
      SUM(total_count) OVER () AS grand_total_count,
      SUM(total_value) OVER () AS grand_total_value
    FROM daily
    ORDER BY date ASC
  `;

  const values = [dataInicio, dataFim];

  const { rows } = await pool.query(query, values);

  if (!rows || rows.length === 0) {
    return {
      startDate: dataInicio,
      endDate: dataFim,
      totalCount: 0,
      totalValue: 0,
      days: [],
    };
  }

  const totalCount = Number(rows[0].grand_total_count) || 0;
  const totalValue = Number(rows[0].grand_total_value) || 0;

  const days = rows.map((row) => ({
    date: row.date,
    count: Number(row.total_count) || 0,
    totalValue: Number(row.total_value) || 0,
  }));

  return {
    startDate: dataInicio,
    endDate: dataFim,
    totalCount,
    totalValue,
    days,
  };
}

