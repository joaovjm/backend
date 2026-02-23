import pool from "../db/db.js";

const ACTIVITY_TYPES = {
  WORKLIST_CLICK: "worklist_click",
  NEW_DONATION: "new_donation",
  SCHEDULED: "scheduled",
  NOT_ANSWERED: "not_answered",
  CANNOT_HELP: "cannot_help",
  WHATSAPP: "whatsapp",
  LEAD_NOT_ANSWERED: "lead_not_answered",
  LEAD_CANNOT_HELP: "lead_cannot_help",
  LEAD_SCHEDULED: "lead_scheduled",
  LEAD_SUCCESS: "lead_success",
  LEAD_DONATION_FROM_SCHEDULED: "lead_donation_from_scheduled",
};

/**
 * Considera valor de data "ausente" quando undefined, null ou string vazia/em branco.
 */
function isDateMissing(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

/**
 * Normaliza startDate e endDate para toda a dashboard:
 * - Se não recebidos ou vierem como undefined/null/string vazia → primeiro dia do mês atual até o dia atual da consulta.
 */
function normalizeDateRange(startDate, endDate) {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const y = firstDay.getFullYear();
  const m = String(firstDay.getMonth() + 1).padStart(2, "0");
  const d = String(firstDay.getDate()).padStart(2, "0");
  const todayY = now.getFullYear();
  const todayM = String(now.getMonth() + 1).padStart(2, "0");
  const todayD = String(now.getDate()).padStart(2, "0");

  const start = isDateMissing(startDate) ? `${y}-${m}-${d}` : String(startDate).trim();
  const end = isDateMissing(endDate) ? `${todayY}-${todayM}-${todayD}` : String(endDate).trim();

  return { startDate: start, endDate: end };
}

/**
 * Busca doações recebidas (pool) + meta. Scheduling não é usado no DashboardAdmin.
 */
async function getReceivedAndMetaFromPool({ startDate, endDate, operatorId }) {
  const query = `
    WITH received_filtered AS (
      SELECT
        d.receipt_donation_id,
        d.donation_value,
        d.donation_extra,
        d.donation_day_received,
        d.operator_code_id,
        donor.donor_name,
        op.operator_name
      FROM donation d
      LEFT JOIN donor ON donor.donor_id = d.donor_id
      LEFT JOIN operator op ON op.operator_code_id = d.operator_code_id
      WHERE d.donation_received = 'Sim'
        AND ($1::date IS NULL OR d.donation_day_received >= $1)
        AND ($2::date IS NULL OR d.donation_day_received <= $2)
        AND ($3::int IS NULL OR d.operator_code_id = $3)
    ),
    received_agg AS (
      SELECT
        COALESCE(SUM(donation_value), 0) AS value_received,
        COALESCE(
          json_agg(
            json_build_object(
              'donation_id', receipt_donation_id,
              'donor_name', donor_name,
              'operator_name', operator_name,
              'operator_code_id', operator_code_id,
              'donation_value', donation_value,
              'donation_extra', donation_extra,
              'donation_day_received', donation_day_received
            )
          ) FILTER (WHERE receipt_donation_id IS NOT NULL),
          '[]'
        ) AS donations_received
      FROM received_filtered
    ),
    meta_agg AS (
      SELECT COALESCE(json_agg(m), '[]') AS meta
      FROM (
        SELECT * FROM operator_meta
        WHERE status = 'Ativo'
          AND ($3::int IS NULL OR operator_code_id = $3)
        ORDER BY start_date DESC
        LIMIT 1
      ) m
    )
    SELECT
      r.value_received,
      r.donations_received,
      (SELECT meta FROM meta_agg) AS meta
    FROM received_agg r
  `;
  const values = [startDate || null, endDate || null, operatorId || null];
  const { rows } = await pool.query(query, values);
  const row = rows[0];
  return {
    value_received: row?.value_received ?? 0,
    donations_received: row?.donations_received ?? "[]",
    meta: row?.meta ?? "[]",
    scheduled: "[]",
  };
}

/**
 * Busca doações não recebidas no Postgres e separa confirmação / em aberto
 */
async function getNotReceivedFromPool({
  startDate,
  endDate,
  operatorId,
  operatorType,
}) {
  const query = `
    SELECT
      d.receipt_donation_id,
      d.donor_id,
      d.donation_description,
      d.donation_value,
      d.donation_extra,
      d.donation_day_contact,
      d.donation_day_to_receive,
      d.donation_print,
      d.donation_monthref,
      d.operator_code_id,
      d.collector_code_id,
      d.confirmation_scheduled,
      d.confirmation_status,
      d.donation_received,
      donor.donor_name AS donor_name,
      donor.donor_address AS donor_address,
      donor.donor_tel_1 AS donor_tel_1,
      dt2.donor_tel_2 AS donor_tel_2,
      dt3.donor_tel_3 AS donor_tel_3,
      op.operator_name AS operator_name,
      c.collector_name AS collector_name,
      dcr.donor_confirmation_reason AS donor_confirmation_reason,
      dm.donor_mensal_day AS donor_mensal_day
    FROM donation d
    LEFT JOIN donor ON donor.donor_id = d.donor_id
    LEFT JOIN operator op ON op.operator_code_id = d.operator_code_id
    LEFT JOIN collector c ON c.collector_code_id = d.collector_code_id
    LEFT JOIN donor_confirmation_reason dcr ON dcr.receipt_donation_id = d.receipt_donation_id
    LEFT JOIN LATERAL (
      SELECT donor_tel_2
      FROM donor_tel_2
      WHERE donor_tel_2.donor_id = d.donor_id
      LIMIT 1
    ) dt2 ON true
    LEFT JOIN LATERAL (
      SELECT donor_tel_3
      FROM donor_tel_3
      WHERE donor_tel_3.donor_id = d.donor_id
      LIMIT 1
    ) dt3 ON true
    LEFT JOIN LATERAL (
      SELECT donor_mensal_day
      FROM donor_mensal
      WHERE donor_mensal.donor_id = d.donor_id
      LIMIT 1
    ) dm ON true
    WHERE (d.donation_received = 'Não' OR d.donation_received = 'Nao')
      AND (d.collector_code_id IS NULL OR d.collector_code_id != 11)
      AND (d.donation_day_to_receive IS NULL OR (d.donation_day_to_receive >= $1::date AND d.donation_day_to_receive <= $2::date))
      AND ($3::int IS NULL OR d.operator_code_id = $3)
    ORDER BY d.donation_day_to_receive DESC NULLS LAST
  `;
  const values = [startDate, endDate, operatorId || null];

  let rows = [];
  try {
    const result = await pool.query(query, values);
    rows = result.rows || [];
  } catch (err) {
    console.error("[dashboard] getNotReceivedFromPool erro:", err?.message);
    return getEmptyNotReceived();
  }

  const donationConfirmation = [];
  const fullNotReceivedDonations = [];
  let confirmations = 0;
  let valueConfirmations = 0;
  let openDonations = 0;
  let valueOpenDonations = 0;

  const isAdmin = operatorType === "Admin";

  for (const row of rows) {
    const inConfirmation = Number(row.collector_code_id) === 10;
    const includeConfirmation =
      inConfirmation && (isAdmin || Number(row.operator_code_id) === Number(operatorId));
    const inOpen = Number(row.collector_code_id) !== 10;
    const includeOpen = inOpen && (isAdmin || Number(row.operator_code_id) === Number(operatorId));

    if (includeConfirmation) {
      confirmations += 1;
      valueConfirmations += Number(row.donation_value) || 0;
      donationConfirmation.push(mapRowToDonationConfirmation(row));
    }
    if (includeOpen) {
      openDonations += 1;
      valueOpenDonations += Number(row.donation_value) || 0;
      fullNotReceivedDonations.push(mapRowToFullNotReceived(row));
    }
  }

  return {
    confirmations,
    valueConfirmations,
    openDonations,
    valueOpenDonations,
    donationConfirmation,
    fullNotReceivedDonations,
  };
}

function mapRowToDonationConfirmation(row) {
  return {
    receipt_donation_id: row.receipt_donation_id,
    donor_id: row.donor_id,
    donor_name: row.donor_name,
    donor_address: row.donor_address,
    donor_tel_1: row.donor_tel_1,
    donor_tel_2: row.donor_tel_2,
    donor_tel_3: row.donor_tel_3,
    donation_extra: row.donation_extra,
    donation_day_contact: row.donation_day_contact,
    donation_day_to_receive: row.donation_day_to_receive,
    donation_print: row.donation_print,
    donation_monthref: row.donation_monthref,
    donation_description: row.donation_description,
    operator_code_id: row.operator_code_id,
    operator_name: row.operator_name,
    donation_received: row.donation_received,
    donation_value: row.donation_value,
    collector_code_id: row.collector_code_id,
    donor_confirmation_reason: row.donor_confirmation_reason,
    confirmation_scheduled: row.confirmation_scheduled,
    confirmation_status: row.confirmation_status,
    donor_mensal_day: row.donor_mensal_day,
  };
}

function mapRowToFullNotReceived(row) {
  return {
    receipt_donation_id: row.receipt_donation_id,
    donor_id: row.donor_id,
    donor_name: row.donor_name,
    donation_value: row.donation_value,
    collector_code_id: row.collector_code_id,
    donor_confirmation_reason: row.donor_confirmation_reason,
    collector_name: row.collector_name,
    donation_day_to_receive: row.donation_day_to_receive,
    donor_address: row.donor_address,
    donor_tel_1: row.donor_tel_1,
    donor_tel_2: row.donor_tel_2,
    donor_tel_3: row.donor_tel_3,
    operator_code_id: row.operator_code_id,
    operator_name: row.operator_name,
  };
}

function getEmptyNotReceived() {
  return {
    confirmations: 0,
    valueConfirmations: 0,
    openDonations: 0,
    valueOpenDonations: 0,
    donationConfirmation: [],
    fullNotReceivedDonations: [],
  };
}

/**
 * Busca atividades de operadoras no Postgres (tabela operator_activity)
 */
async function getOperatorActivitiesFromPool({ startDate, endDate }) {
  const query = `
    SELECT *
    FROM operator_activity
    WHERE created_at >= $1::timestamptz
      AND created_at <= $2::timestamptz
    ORDER BY created_at DESC
  `;
  const from = new Date(startDate);
  from.setHours(0, 0, 0, 0);
  const to = new Date(endDate);
  to.setHours(23, 59, 59, 999);

  let rows = [];
  try {
    const result = await pool.query(query, [from.toISOString(), to.toISOString()]);
    rows = result.rows || [];
  } catch {
    return { activities: [], grouped: {} };
  }

  const grouped = rows.reduce((acc, activity) => {
    const name = activity.operator_name;
    if (!acc[name]) {
      acc[name] = {
        operatorId: activity.operator_code_id,
        operatorName: name,
        activities: [],
        counts: Object.keys(ACTIVITY_TYPES).reduce((c, k) => {
          c[ACTIVITY_TYPES[k]] = 0;
          return c;
        }, {}),
        total: 0,
      };
    }
    acc[name].activities.push(activity);
    acc[name].counts[activity.activity_type] =
      (acc[name].counts[activity.activity_type] || 0) + 1;
    acc[name].total += 1;
    return acc;
  }, {});

  return { activities: rows, grouped };
}

/**
 * Busca evolução diária do mensal no Postgres (tabela donor_mensal_daily_evolution)
 */
async function getDonorMonthlyEvolutionFromPool() {
  const query = `
    SELECT *
    FROM donor_mensal_daily_evolution
    ORDER BY summary_date DESC
    LIMIT 1
  `;
  try {
    const { rows } = await pool.query(query);
    const data = rows[0];
    if (!data) return { percentual_evolucao: 0 };
    return {
      percentual_evolucao: data.percentual_evolucao ?? 0,
      ...data,
    };
  } catch {
    return { percentual_evolucao: 0 };
  }
}

async function safeGet(name, fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.error(`[dashboard] Erro em ${name}:`, err?.message);
    return fallback;
  }
}

/**
 * Leads agendados (leads_status = 'agendado') para o operador.
 */
async function getScheduledLeadsFromPool(operatorId) {
  const id = Number(operatorId);
  if (!id) return [];

  const query = `
    SELECT l.*, op.operator_name
    FROM leads l
    LEFT JOIN operator op ON op.operator_code_id = l.operator_code_id
    WHERE l.leads_status = 'agendado' AND l.operator_code_id = $1
    ORDER BY l.leads_scheduling_date ASC NULLS LAST
  `;
  const { rows } = await pool.query(query, [id]);
  return rows || [];
}

/**
 * Requests agendados (request_status contém 'Agendado') para o operador.
 */
async function getSchedulingRequestFromPool(operatorId) {
  const id = Number(operatorId);
  if (!id) return [];

  const query = `
    SELECT
      r.id,
      r.donor_id,
      r.operator_code_id,
      r.request_scheduled_date,
      r.request_observation,
      r.request_tel_success,
      d.donor_name,
      d.donor_address,
      d.donor_tel_1
    FROM request r
    LEFT JOIN donor d ON d.donor_id = r.donor_id
    WHERE r.operator_code_id = $1
      AND r.request_active = 'True'
      AND r.request_status::text LIKE '%Agendado%'
    ORDER BY r.request_scheduled_date ASC NULLS LAST
  `;
  try {
    const { rows } = await pool.query(query, [id]);
    return (rows || []).map((row) => ({
      id: row.id,
      donor_id: row.donor_id,
      operator_code_id: row.operator_code_id,
      request_scheduled_date: row.request_scheduled_date,
      request_observation: row.request_observation,
      request_tel_success: row.request_tel_success,
      donor: {
        donor_name: row.donor_name,
        donor_address: row.donor_address,
        donor_tel_1: row.donor_tel_1,
      },
    }));
  } catch (e) {
    return [];
  }
}

/**
 * Doações com confirmation_status = 'Agendado' para o operador.
 */
async function getScheduledDonationsFromPool(operatorId) {
  const id = Number(operatorId);
  if (!id) return [];

  const query = `
    SELECT
      d.receipt_donation_id,
      d.donor_id,
      d.operator_code_id,
      d.confirmation_scheduled,
      d.confirmation_status,
      d.confirmation_observation,
      d.donation_value,
      d.donation_day_contact,
      donor.donor_name,
      donor.donor_tel_1,
      donor.donor_address,
      donor.donor_city,
      donor.donor_neighborhood,
      op.operator_name
    FROM donation d
    LEFT JOIN donor ON donor.donor_id = d.donor_id
    LEFT JOIN operator op ON op.operator_code_id = d.operator_code_id
    WHERE d.confirmation_status = 'Agendado'
      AND d.confirmation_scheduled IS NOT NULL
      AND d.operator_code_id = $1
    ORDER BY d.confirmation_scheduled ASC
  `;
  const { rows } = await pool.query(query, [id]);
  return (rows || []).map((row) => ({
    id: row.receipt_donation_id,
    donor_id: row.donor_id,
    operator_code_id: row.operator_code_id,
    scheduled_date: row.confirmation_scheduled,
    scheduled_observation: row.confirmation_observation || null,
    scheduled_tel_success: row.donor_tel_1 || null,
    scheduled_value: row.donation_value,
    donor: {
      donor_name: row.donor_name,
      donor_tel_1: row.donor_tel_1,
      donor_address: row.donor_address,
      donor_city: row.donor_city,
      donor_neighborhood: row.donor_neighborhood,
    },
    operator_name: row.operator_name,
    donation_id: row.receipt_donation_id,
    source: "donation_agendada",
  }));
}

/**
 * Agendados da tabela scheduled (status = 'pendente') para o operador.
 */
async function getScheduledFromTableFromPool(operatorId) {
  const id = Number(operatorId);
  if (!id) return [];

  const query = `
    SELECT
      s.scheduled_id,
      s.operator_code_id,
      s.scheduled_date,
      s.observation,
      s.entity_type,
      s.entity_id,
      op.operator_name
    FROM scheduled s
    LEFT JOIN operator op ON op.operator_code_id = s.operator_code_id
    WHERE s.status = 'pendente' AND s.operator_code_id = $1
    ORDER BY s.scheduled_date ASC
  `;
  const { rows } = await pool.query(query, [id]);
  if (!rows?.length) return [];

  const donorIds = rows
    .filter((r) => r.entity_type === "doação" && r.entity_id)
    .map((r) => r.entity_id);

  let donorsMap = {};
  if (donorIds.length > 0) {
    const placeholders = donorIds.map((_, i) => `$${i + 1}`).join(", ");
    const donorQuery = `
      SELECT donor_id, donor_name, donor_tel_1, donor_address, donor_city, donor_neighborhood
      FROM donor WHERE donor_id IN (${placeholders})
    `;
    const { rows: donorRows } = await pool.query(donorQuery, donorIds);
    donorRows?.forEach((d) => {
      donorsMap[d.donor_id] = d;
    });
  }

  return rows.map((s) => {
    const donor =
      s.entity_type === "doação" && s.entity_id ? donorsMap[s.entity_id] : null;
    return {
      id: s.scheduled_id,
      donor_id: s.entity_type === "doação" ? s.entity_id : null,
      operator_code_id: s.operator_code_id,
      scheduled_date: s.scheduled_date,
      scheduled_observation: s.observation || null,
      scheduled_tel_success: donor?.donor_tel_1 || null,
      donor: donor
        ? {
            donor_name: donor.donor_name,
            donor_tel_1: donor.donor_tel_1,
            donor_address: donor.donor_address,
            donor_city: donor.donor_city,
            donor_neighborhood: donor.donor_neighborhood,
          }
        : null,
      operator_name: s.operator_name,
      entity_type: s.entity_type,
      entity_id: s.entity_id,
      source: "scheduled_table",
    };
  });
}

/**
 * Dashboard consolidado.
 * - operatorType === 'Admin': received, not-received e confirmation de todos os operadores.
 * - Caso contrário: filtrado por operatorId.
 * startDate/endDate não informados = primeiro dia do mês atual até hoje.
 */
export async function getDashboard({
  startDate,
  endDate,
  operatorId,
  operatorType = "Admin",
}) {
  const { startDate: normalizedStart, endDate: normalizedEnd } =
    normalizeDateRange(startDate, endDate);

  const isAdmin = operatorType === "Admin";
  const filterOperatorId = isAdmin ? null : operatorId;
  const filterOperatorType = operatorType;

  const [poolResult, notReceived, operatorActivities, donorEvolution] =
    await Promise.all([
      safeGet(
        "getReceivedAndMetaFromPool",
        () =>
          getReceivedAndMetaFromPool({
            startDate: normalizedStart,
            endDate: normalizedEnd,
            operatorId: filterOperatorId,
          }),
        {
          value_received: 0,
          donations_received: "[]",
          meta: "[]",
          scheduled: "[]",
        }
      ),
      safeGet(
        "getNotReceivedFromPool",
        () =>
          getNotReceivedFromPool({
            startDate: normalizedStart,
            endDate: normalizedEnd,
            operatorId: filterOperatorId,
            operatorType: filterOperatorType,
          }),
        getEmptyNotReceived()
      ),
      safeGet(
        "getOperatorActivitiesFromPool",
        () =>
          getOperatorActivitiesFromPool({
            startDate: normalizedStart,
            endDate: normalizedEnd,
          }),
        { activities: [], grouped: {} }
      ),
      safeGet(
        "getDonorMonthlyEvolutionFromPool",
        getDonorMonthlyEvolutionFromPool,
        { percentual_evolucao: 0 }
      ),
    ]);

  const donationsReceived =
    typeof poolResult.donations_received === "string"
      ? JSON.parse(poolResult.donations_received || "[]")
      : poolResult.donations_received || [];

  const meta =
    typeof poolResult.meta === "string"
      ? JSON.parse(poolResult.meta || "[]")
      : poolResult.meta || [];

  let scheduled = [];
  let scheduledDonations = [];
  let scheduledFromTable = [];

  if (filterOperatorId) {
    const [leads, requestAgendado, donationsAgendadas, tableAgendados] =
      await Promise.all([
        safeGet(
          "getScheduledLeadsFromPool",
          () => getScheduledLeadsFromPool(filterOperatorId),
          []
        ),
        safeGet(
          "getSchedulingRequestFromPool",
          () => getSchedulingRequestFromPool(filterOperatorId),
          []
        ),
        safeGet(
          "getScheduledDonationsFromPool",
          () => getScheduledDonationsFromPool(filterOperatorId),
          []
        ),
        safeGet(
          "getScheduledFromTableFromPool",
          () => getScheduledFromTableFromPool(filterOperatorId),
          []
        ),
      ]);
    scheduled = [...(leads || []), ...(requestAgendado || [])];
    scheduledDonations = donationsAgendadas || [];
    scheduledFromTable = tableAgendados || [];
  }

  return {
    valueReceived: Number(poolResult.value_received) || 0,
    donationsReceived,
    confirmations: notReceived.confirmations,
    valueConfirmations: notReceived.valueConfirmations,
    openDonations: notReceived.openDonations,
    valueOpenDonations: notReceived.valueOpenDonations,
    donationConfirmation: notReceived.donationConfirmation,
    fullNotReceivedDonations: notReceived.fullNotReceivedDonations,
    operatorActivities,
    meta,
    scheduled,
    scheduledDonations,
    scheduledFromTable,
    donorMonthlyPercentDailyEvolution: donorEvolution,
  };
}
