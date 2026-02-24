import pool from "../db/db.js";

function buildMonthRange(month) {
  if (!month || typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Parâmetro 'month' inválido. Use o formato YYYY-MM.");
  }

  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr); // 1-12

  if (!year || monthIndex < 1 || monthIndex > 12) {
    throw new Error("Parâmetro 'month' inválido. Use o formato YYYY-MM.");
  }

  const startDate = `${yearStr}-${monthStr}-01`;

  const isDecember = monthIndex === 12;
  const nextYear = isDecember ? year + 1 : year;
  const nextMonth = isDecember ? 1 : monthIndex + 1;
  const nextMonthStr = String(nextMonth).padStart(2, "0");
  const endDate = `${nextYear}-${nextMonthStr}-01`;

  return { startDate, endDate };
}

export async function getMonthHistory(month) {
  const { startDate, endDate } = buildMonthRange(month);

  const query = `
    WITH mensal AS (
      SELECT
        dm.donor_id,
        dm.donor_mensal_day,
        dm.donor_mensal_monthly_fee,
        d.donor_name,
        d.donor_tel_1
      FROM donor_mensal dm
      JOIN donor d ON d.donor_id = dm.donor_id
      WHERE dm.active IS NULL OR dm.active = true
    ),
    donations_filtered AS (
      SELECT
        don.receipt_donation_id,
        don.donor_id,
        don.donation_print,
        don.donation_received,
        don.donation_value,
        don.donation_monthref,
        don.donation_day_to_receive,
        don.donation_day_received,
        c.collector_name
      FROM donation don
      LEFT JOIN collector c ON c.collector_code_id = don.collector_code_id
      WHERE don.donation_monthref >= $1::date
        AND don.donation_monthref < $2::date
    )
    SELECT
      m.donor_id,
      m.donor_mensal_day,
      m.donor_mensal_monthly_fee,
      m.donor_name,
      m.donor_tel_1,
      COALESCE(
        json_agg(
          json_build_object(
            'receipt_donation_id', d.receipt_donation_id,
            'donor_id', d.donor_id,
            'donation_print', d.donation_print,
            'donation_received', d.donation_received,
            'donation_value', d.donation_value,
            'donation_monthref', d.donation_monthref,
            'donation_day_to_receive', d.donation_day_to_receive,
            'donation_day_received', d.donation_day_received,
            'collector',
              CASE
                WHEN d.collector_name IS NOT NULL
                  THEN json_build_object('collector_name', d.collector_name)
                ELSE NULL
              END
          )
        ) FILTER (WHERE d.receipt_donation_id IS NOT NULL),
        '[]'
      ) AS donations,
      COALESCE(SUM(COALESCE(d.donation_value, 0)), 0) AS total_value,
      COUNT(d.receipt_donation_id) AS movements_count,
      BOOL_OR(d.donation_print = 'Sim') AS is_printed,
      BOOL_OR(d.donation_received = 'Sim') AS is_received,
      (
        SELECT df.collector_name
        FROM donations_filtered df
        WHERE df.donor_id = m.donor_id
          AND df.collector_name IS NOT NULL
        ORDER BY df.donation_monthref DESC, df.donation_day_received DESC NULLS LAST
        LIMIT 1
      ) AS collector_name
    FROM mensal m
    LEFT JOIN donations_filtered d ON d.donor_id = m.donor_id
    GROUP BY
      m.donor_id,
      m.donor_mensal_day,
      m.donor_mensal_monthly_fee,
      m.donor_name,
      m.donor_tel_1
    ORDER BY
      m.donor_mensal_day NULLS LAST,
      m.donor_name;
  `;

  const values = [startDate, endDate];
  const { rows } = await pool.query(query, values);

  return rows.map((row) => ({
    donor_id: row.donor_id,
    donor_mensal_day: row.donor_mensal_day,
    donor_mensal_monthly_fee: Number(row.donor_mensal_monthly_fee) || 0,
    donor_name: row.donor_name,
    donor_tel_1: row.donor_tel_1,
    donations: Array.isArray(row.donations) ? row.donations : [],
    total_value: Number(row.total_value) || 0,
    movements_count: Number(row.movements_count) || 0,
    isPrinted: Boolean(row.is_printed),
    isReceived: Boolean(row.is_received),
    collector_name: row.collector_name || null,
  }));
}

