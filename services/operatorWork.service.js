import pool from "../db/db.js";

function createEmptySummary() {
  return {
    names: [],
    countReceived: {},
    addValueReceived: {},
    countNotReceived: {},
    addValueNotReceived: {},
    addValueExtraReceived: {},
  };
}

function chooseDateField(startDate) {
  if (!startDate) return "donation_day_received";

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const todayIso = `${y}-${m}-${d}`;

  return startDate > todayIso ? "donation_day_to_receive" : "donation_day_received";
}

export async function getOperatorWorkSummary({ startDate, endDate }) {
  if (!startDate || !endDate) {
    return createEmptySummary();
  }

  const dateField = chooseDateField(startDate);

  const query = `
    SELECT
      d.operator_code_id,
      op.operator_name,
      SUM(CASE WHEN d.donation_received = 'Sim' THEN 1 ELSE 0 END) AS count_received,
      SUM(CASE WHEN d.donation_received = 'Sim' THEN d.donation_value ELSE 0 END) AS value_received,
      SUM(CASE WHEN d.donation_received = 'Sim' THEN d.donation_extra ELSE 0 END) AS extra_received,
      SUM(CASE WHEN d.donation_received <> 'Sim' THEN 1 ELSE 0 END) AS count_not_received,
      SUM(CASE WHEN d.donation_received <> 'Sim' THEN d.donation_value ELSE 0 END) AS value_not_received
    FROM donation d
    LEFT JOIN operator op ON op.operator_code_id = d.operator_code_id
    WHERE d.operator_code_id IS NOT NULL
      AND d.${dateField} >= $1::date
      AND d.${dateField} <= $2::date
    GROUP BY d.operator_code_id, op.operator_name
    ORDER BY op.operator_name
  `;

  const values = [startDate, endDate];
  const { rows } = await pool.query(query, values);

  if (!rows || rows.length === 0) {
    return createEmptySummary();
  }

  const names = [];
  const countReceived = {};
  const addValueReceived = {};
  const countNotReceived = {};
  const addValueNotReceived = {};
  const addValueExtraReceived = {};

  for (const row of rows) {
    const name = row.operator_name || "Sem nome";
    const id = row.operator_code_id;

    names.push({ name, id });
    countReceived[name] = Number(row.count_received) || 0;
    addValueReceived[name] = Number(row.value_received) || 0;
    countNotReceived[name] = Number(row.count_not_received) || 0;
    addValueNotReceived[name] = Number(row.value_not_received) || 0;
    addValueExtraReceived[name] = Number(row.extra_received) || 0;
  }

  return {
    names,
    countReceived,
    addValueReceived,
    countNotReceived,
    addValueNotReceived,
    addValueExtraReceived,
  };
}

export async function getCollectorWorkSummary({ startDate, endDate }) {
  if (!startDate || !endDate) {
    return createEmptySummary();
  }

  const dateField = chooseDateField(startDate);

  const query = `
    SELECT
      d.collector_code_id,
      c.collector_name,
      SUM(CASE WHEN d.donation_received = 'Sim' THEN 1 ELSE 0 END) AS count_received,
      SUM(CASE WHEN d.donation_received = 'Sim' THEN d.donation_value ELSE 0 END) AS value_received,
      0 AS extra_received,
      SUM(CASE WHEN d.donation_received <> 'Sim' THEN 1 ELSE 0 END) AS count_not_received,
      SUM(CASE WHEN d.donation_received <> 'Sim' THEN d.donation_value ELSE 0 END) AS value_not_received
    FROM donation d
    LEFT JOIN collector c ON c.collector_code_id = d.collector_code_id
    WHERE d.collector_code_id IS NOT NULL
      AND d.${dateField} >= $1::date
      AND d.${dateField} <= $2::date
    GROUP BY d.collector_code_id, c.collector_name
    ORDER BY c.collector_name
  `;

  const values = [startDate, endDate];
  const { rows } = await pool.query(query, values);

  if (!rows || rows.length === 0) {
    return createEmptySummary();
  }

  const names = [];
  const countReceived = {};
  const addValueReceived = {};
  const countNotReceived = {};
  const addValueNotReceived = {};
  const addValueExtraReceived = {};

  for (const row of rows) {
    const name = row.collector_name || "Sem nome";
    const id = row.collector_code_id;

    names.push({ name, id });
    countReceived[name] = Number(row.count_received) || 0;
    addValueReceived[name] = Number(row.value_received) || 0;
    countNotReceived[name] = Number(row.count_not_received) || 0;
    addValueNotReceived[name] = Number(row.value_not_received) || 0;
    addValueExtraReceived[name] = 0;
  }

  return {
    names,
    countReceived,
    addValueReceived,
    countNotReceived,
    addValueNotReceived,
    addValueExtraReceived,
  };
}

export async function getOperatorWorkDonations({
  startDate,
  endDate,
  entityType,
  entityId,
  statusFilter,
}) {
  if (!startDate || !endDate || !entityType || !entityId) {
    return [];
  }

  const field =
    entityType === "collector" ? "collector_code_id" : "operator_code_id";

  const query = `
    SELECT
      d.receipt_donation_id,
      d.donation_value,
      d.donation_day_to_receive,
      d.donation_day_received,
      d.donation_print,
      d.donation_received,
      d.donor_id,
      donor.donor_name,
      donor.donor_tel_1,
      d.operator_code_id,
      op.operator_name,
      d.collector_code_id,
      col.collector_name
    FROM donation d
    LEFT JOIN donor ON donor.donor_id = d.donor_id
    LEFT JOIN operator op ON op.operator_code_id = d.operator_code_id
    LEFT JOIN collector col ON col.collector_code_id = d.collector_code_id
    WHERE d.${field} = $3
      AND d.donation_day_received >= $1::date
      AND d.donation_day_received <= $2::date
      AND ($4::text IS NULL OR d.donation_received = $4)
    ORDER BY d.donation_day_received DESC NULLS LAST, d.receipt_donation_id DESC
  `;

  const values = [startDate, endDate, entityId, statusFilter || null];

  const { rows } = await pool.query(query, values);

  return (rows || []).map((row) => ({
    receipt_donation_id: row.receipt_donation_id,
    donation_value: row.donation_value,
    donation_day_to_receive: row.donation_day_to_receive,
    donation_day_received: row.donation_day_received,
    donation_print: row.donation_print,
    donation_received: row.donation_received,
    donor_id: row.donor_id,
    donor: {
      donor_name: row.donor_name,
      donor_tel_1: row.donor_tel_1,
    },
    operator_code_id: row.operator_code_id,
    operator: row.operator_name
      ? { operator_name: row.operator_name }
      : null,
    collector_code_id: row.collector_code_id,
    collector: row.collector_name
      ? { collector_name: row.collector_name }
      : null,
  }));
}

