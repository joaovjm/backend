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

function mapMetricsRow(row) {
  if (!row) {
    return {
      totalReceived: 0,
      confirmations: 0,
      totalConfirmationsValue: 0,
      openDonations: 0,
      valueOpenDonations: 0,
      updatedAt: null,
      operatorCodeId: null,
    };
  }

  return {
    totalReceived: Number(row.total_received) || 0,
    confirmations: Number(row.confirmations) || 0,
    totalConfirmationsValue: Number(row.total_confirmations_value) || 0,
    openDonations: Number(row.open_donations) || 0,
    valueOpenDonations: Number(row.value_open_donations) || 0,
    updatedAt: row.updated_at,
    operatorCodeId: row.operator_code_id ?? null,
  };
}

function buildDashboardResponse(metrics, { operatorActivities, donorEvolution }) {
  return {
    // mesmos nomes que o frontend já utiliza
    valueReceived: metrics.totalReceived,
    confirmations: metrics.confirmations,
    valueConfirmations: metrics.totalConfirmationsValue,
    openDonations: metrics.openDonations,
    valueOpenDonations: metrics.valueOpenDonations,

    // campos de lista que antes eram montados com queries pesadas
    // agora são sempre arrays vazios (mas mantidos para compatibilidade)
    donationsReceived: [],
    donationConfirmation: [],
    fullNotReceivedDonations: [],
    scheduled: [],
    scheduledDonations: [],
    scheduledFromTable: [],

    // atividades e evolução mensal diária continuam existindo
    operatorActivities: operatorActivities ?? { activities: [], grouped: {} },
    meta: [],
    donorMonthlyPercentDailyEvolution: donorEvolution ?? {
      percentual_evolucao: 0,
    },

    // metadado de quando as métricas foram atualizadas
    updatedAt: metrics.updatedAt,
  };
}

export async function getDashboard() {
  const metricsSql = `
    SELECT
      id,
      operator_code_id,
      total_received,
      confirmations,
      total_confirmations_value,
      open_donations,
      value_open_donations,
      updated_at
    FROM dashboard_metrics
    WHERE id = 1
  `;

  try {
    const [metricsResult, operatorActivities, donorEvolution] =
      await Promise.all([
        pool.query(metricsSql),
        // mantém o endpoint compatível, mas com uma query leve
        getOperatorActivities({ startDate: null, endDate: null }),
        getDonorMonthlyEvolution(),
      ]);

    const metrics = mapMetricsRow(metricsResult.rows?.[0] || null);
    return buildDashboardResponse(metrics, {
      operatorActivities,
      donorEvolution,
    });
  } catch (err) {
    console.error("[dashboard] Erro ao montar dashboard global:", err);
    const emptyMetrics = mapMetricsRow(null);
    return buildDashboardResponse(emptyMetrics, {
      operatorActivities: { activities: [], grouped: {} },
      donorEvolution: { percentual_evolucao: 0 },
    });
  }
}

export async function getDashboardByOperator(operatorId) {
  const id = Number(operatorId);
  if (!id) {
    const emptyMetrics = mapMetricsRow(null);
    return buildDashboardResponse(emptyMetrics, {
      operatorActivities: { activities: [], grouped: {} },
      donorEvolution: { percentual_evolucao: 0 },
    });
  }

  const metricsSql = `
    SELECT
      id,
      operator_code_id,
      total_received,
      confirmations,
      total_confirmations_value,
      open_donations,
      value_open_donations,
      updated_at
    FROM dashboard_metrics
    WHERE operator_code_id = $1
  `;

  try {
    const [metricsResult, donorEvolution] = await Promise.all([
      pool.query(metricsSql, [id]),
      getDonorMonthlyEvolution(),
    ]);

    const metrics = mapMetricsRow(metricsResult.rows?.[0] || null);
    // para o dashboard por operador, não é obrigatório agrupar atividades aqui:
    // o frontend pode usar /dashboard/activities se precisar de detalhes.
    return buildDashboardResponse(metrics, {
      operatorActivities: { activities: [], grouped: {} },
      donorEvolution,
    });
  } catch (err) {
    console.error(
      "[dashboard] Erro ao montar dashboard por operador:",
      err,
    );
    const emptyMetrics = mapMetricsRow(null);
    return buildDashboardResponse(emptyMetrics, {
      operatorActivities: { activities: [], grouped: {} },
      donorEvolution: { percentual_evolucao: 0 },
    });
  }
}

export async function getOperatorActivities({ startDate, endDate }) {
  const query = `
    SELECT *
    FROM operator_activity
    WHERE created_at >= $1::timestamptz
      AND ($2::timestamptz IS NULL OR created_at <= $2::timestamptz)
    ORDER BY created_at DESC
  `;

  const from = new Date(startDate || new Date());
  from.setHours(0, 0, 0, 0);
  const toIso = endDate
    ? (() => {
        const to = new Date(endDate);
        to.setHours(23, 59, 59, 999);
        return to.toISOString();
      })()
    : null;

  let rows = [];
  try {
    const result = await pool.query(query, [from.toISOString(), toIso]);
    rows = result.rows || [];
  } catch (err) {
    console.error("[dashboard] Erro ao buscar atividades:", err);
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

export async function getDonorMonthlyEvolution() {
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
  } catch (err) {
    console.error(
      "[dashboard] Erro ao buscar evolução mensal diária:",
      err,
    );
    return { percentual_evolucao: 0 };
  }
}

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
    console.error("[dashboard] Erro ao buscar requests agendadas:", e);
    return [];
  }
}

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

export async function getOperatorScheduled(operatorId) {
  const id = Number(operatorId);
  if (!id) {
    return {
      leads: [],
      requests: [],
      donations: [],
      scheduledTable: [],
    };
  }

  const [leads, requests, donations, scheduledTable] = await Promise.all([
    getScheduledLeadsFromPool(id),
    getSchedulingRequestFromPool(id),
    getScheduledDonationsFromPool(id),
    getScheduledFromTableFromPool(id),
  ]);

  return {
    leads,
    requests,
    donations,
    scheduledTable,
  };
}

