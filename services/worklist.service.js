import pool from "../db/db.js";

/**
 * Retorna os nomes das listas de trabalho disponíveis para o operador.
 * Apenas listas ativas (request_name.active = true), request_end_date >= hoje
 * e que tenham ao menos um request do operador.
 */
export async function getWorklistNames(operatorId) {
  const id = Number(operatorId);
  if (!id) return [];

  const query = `
    SELECT DISTINCT r.request_name AS name
    FROM request r
    INNER JOIN request_name rn ON rn.name = r.request_name
    WHERE r.request_active = 'True'
      AND (r.request_end_date IS NULL OR r.request_end_date >= CURRENT_DATE)
      AND r.operator_code_id = $1
      AND (rn.active IS NULL OR rn.active = true)
    ORDER BY r.request_name
  `;
  const { rows } = await pool.query(query, [id]);
  return rows.map((r) => ({ name: r.name }));
}

/**
 * Monta um item da worklist no formato esperado pelo frontend.
 */
function mapWorklistRow(row) {
  return {
    id: row.id,
    donor_id: row.donor_id,
    operator_code_id: row.operator_code_id,
    request_name: row.request_name,
    request_start_date: row.request_start_date,
    request_end_date: row.request_end_date,
    request_status: row.request_status,
    request_date_accessed: row.request_date_accessed,
    receipt_donation_id: row.receipt_donation_id,
    donor: {
      donor_name: row.donor_name,
      donor_tel_1: row.donor_tel_1,
    },
    donor_tel_2b: row.donor_tel_2 != null ? { donor_tel_2: { donor_tel_2: row.donor_tel_2 } } : null,
    donor_tel_3b: row.donor_tel_3 != null ? { donor_tel_3: { donor_tel_3: row.donor_tel_3 } } : null,
    donor_mensal:
      row.donor_mensal_day != null || row.donor_mensal_monthly_fee != null
        ? {
            donor_mensal: {
              donor_mensal_day: row.donor_mensal_day,
              donor_mensal_monthly_fee: row.donor_mensal_monthly_fee,
            },
          }
        : null,
    donation: {
      donation_value: row.donation_value,
      donation_day_received: row.donation_day_received,
      operator_code_id: row.donation_operator_code_id,
    },
  };
}

/**
 * Retorna os itens da lista de trabalho para o operador e nome de lista.
 * Uma única query com JOINs evita N+1 e múltiplas idas ao banco.
 */
export async function getWorklistRequests(operatorId, requestName) {
  const id = Number(operatorId);
  if (!id || !requestName || String(requestName).trim() === "") return [];

  const query = `
    SELECT
      r.id,
      r.donor_id,
      r.operator_code_id,
      r.request_name,
      r.request_start_date,
      r.request_end_date,
      r.request_status,
      r.request_date_accessed,
      r.receipt_donation_id,
      d.donor_name,
      d.donor_tel_1,
      dt2.donor_tel_2,
      dt3.donor_tel_3,
      dm.donor_mensal_day,
      dm.donor_mensal_monthly_fee,
      don.donation_value,
      don.donation_day_received,
      don.operator_code_id AS donation_operator_code_id
    FROM request r
    INNER JOIN donor d ON d.donor_id = r.donor_id
    LEFT JOIN LATERAL (
      SELECT donor_tel_2 FROM donor_tel_2 WHERE donor_tel_2.donor_id = r.donor_id LIMIT 1
    ) dt2 ON true
    LEFT JOIN LATERAL (
      SELECT donor_tel_3 FROM donor_tel_3 WHERE donor_tel_3.donor_id = r.donor_id LIMIT 1
    ) dt3 ON true
    LEFT JOIN LATERAL (
      SELECT donor_mensal_day, donor_mensal_monthly_fee
      FROM donor_mensal
      WHERE donor_mensal.donor_id = r.donor_id AND (donor_mensal.active IS NULL OR donor_mensal.active = true)
      LIMIT 1
    ) dm ON true
    LEFT JOIN donation don ON don.receipt_donation_id = r.receipt_donation_id
    WHERE r.operator_code_id = $1
      AND r.request_name = $2
      AND r.request_active = 'True'
    ORDER BY r.id
  `;
  const { rows } = await pool.query(query, [id, String(requestName).trim()]);
  return rows.map(mapWorklistRow);
}

/**
 * Retorna um único item da worklist por id do request (para atualização após edição no modal).
 */
export async function getWorklistRequestById(operatorId, requestName, requestId) {
  const opId = Number(operatorId);
  const reqId = Number(requestId);
  if (!opId || !requestName || !reqId) return null;

  const query = `
    SELECT
      r.id,
      r.donor_id,
      r.operator_code_id,
      r.request_name,
      r.request_start_date,
      r.request_end_date,
      r.request_status,
      r.request_date_accessed,
      r.receipt_donation_id,
      d.donor_name,
      d.donor_tel_1,
      dt2.donor_tel_2,
      dt3.donor_tel_3,
      dm.donor_mensal_day,
      dm.donor_mensal_monthly_fee,
      don.donation_value,
      don.donation_day_received,
      don.operator_code_id AS donation_operator_code_id
    FROM request r
    INNER JOIN donor d ON d.donor_id = r.donor_id
    LEFT JOIN LATERAL (SELECT donor_tel_2 FROM donor_tel_2 WHERE donor_tel_2.donor_id = r.donor_id LIMIT 1) dt2 ON true
    LEFT JOIN LATERAL (SELECT donor_tel_3 FROM donor_tel_3 WHERE donor_tel_3.donor_id = r.donor_id LIMIT 1) dt3 ON true
    LEFT JOIN LATERAL (
      SELECT donor_mensal_day, donor_mensal_monthly_fee
      FROM donor_mensal
      WHERE donor_mensal.donor_id = r.donor_id AND (donor_mensal.active IS NULL OR donor_mensal.active = true)
      LIMIT 1
    ) dm ON true
    LEFT JOIN donation don ON don.receipt_donation_id = r.receipt_donation_id
    WHERE r.operator_code_id = $1 AND r.request_name = $2 AND r.request_active = 'True' AND r.id = $3
  `;
  const { rows } = await pool.query(query, [opId, String(requestName).trim(), reqId]);
  const row = rows[0];
  return row ? mapWorklistRow(row) : null;
}

/**
 * Dados consolidados da WorkList em uma única chamada.
 * - worklistNames: sempre preenchido.
 * - worklistRequests: preenchido apenas quando requestName é informado.
 */
export async function getWorklist(operatorId, requestName = null) {
  const id = Number(operatorId);
  if (!id) {
    return { worklistNames: [], worklistRequests: null };
  }

  const [names, requests] = await Promise.all([
    getWorklistNames(id),
    requestName && String(requestName).trim()
      ? getWorklistRequests(id, requestName)
      : Promise.resolve(null),
  ]);

  return {
    worklistNames: names,
    worklistRequests: requests,
  };
}

/**
 * Atualiza request_date_accessed do request e registra atividade do operador.
 */
export async function updateRequestAccess(requestId, { operatorId, operatorName, donorId, donorName, requestName }) {
  const reqId = Number(requestId);
  if (!reqId) throw new Error("requestId inválido");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const now = new Date();
    await client.query(
      "UPDATE request SET request_date_accessed = $1 WHERE id = $2",
      [now, reqId]
    );

    if (operatorId != null && operatorName) {
      await client.query(
        `INSERT INTO operator_activity (operator_code_id, operator_name, activity_type, donor_id, donor_name, request_name, created_at)
         VALUES ($1, $2, 'worklist_click', $3, $4, $5, $6)`,
        [
          Number(operatorId),
          operatorName,
          donorId ?? null,
          donorName ?? null,
          requestName ?? null,
          now.toISOString(),
        ]
      );
    }

    await client.query("COMMIT");
    return { request_date_accessed: now };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Atualiza o request_status de um request (array de status).
 */
export async function updateRequestStatus(requestId, requestStatus) {
  const reqId = Number(requestId);
  if (!reqId) throw new Error("requestId inválido");

  const statusArray = Array.isArray(requestStatus)
    ? requestStatus
    : requestStatus != null && requestStatus !== ""
    ? [String(requestStatus)]
    : [];

  const statusJson =
    statusArray.length > 0 ? JSON.stringify(statusArray) : JSON.stringify([]);

  const query = `
    UPDATE request SET request_status = $2 WHERE id = $1
    RETURNING id, request_status, request_date_accessed
  `;
  const { rows } = await pool.query(query, [reqId, statusJson]);
  return rows[0] ?? null;
}

/**
 * Retorna dados consolidados para o ModalWorklist em uma única query otimizada:
 * maxGeneral, maxPeriod, penultimate, countNotReceived, lastThreeDonations.
 * Usa período de request_name quando existir.
 */
export async function getWorklistModalDetail(donorId, requestName) {
  const donorIdNum = Number(donorId);
  if (!donorIdNum) {
    return {
      maxGeneral: [],
      maxPeriod: [],
      penultimate: [],
      countNotReceived: 0,
      lastThreeDonations: [],
    };
  }

  const requestNameStr =
    requestName != null && String(requestName).trim() !== ""
      ? String(requestName).trim()
      : null;

  const query = `
    WITH period AS (
      SELECT start_period_request AS start_p, end_period_request AS end_p
      FROM request_name
      WHERE name = $2
      LIMIT 1
    ),
    donations_ordered AS (
      SELECT
        d.donation_value AS value,
        d.donation_day_received AS day,
        d.donation_description AS description,
        d.donation_received AS received,
        ROW_NUMBER() OVER (ORDER BY d.donation_day_received DESC NULLS LAST) AS rn
      FROM donation d
      WHERE d.donor_id = $1
    ),
    first_sim_rn AS (
      SELECT MIN(rn) AS r FROM donations_ordered WHERE received = 'Sim'
    ),
    count_nr AS (
      SELECT COUNT(*)::int AS cnt
      FROM donations_ordered o
      WHERE o.received = 'Não'
        AND o.rn < COALESCE((SELECT r FROM first_sim_rn), 2147483647)
    ),
    received_only AS (
      SELECT value, day, description FROM donations_ordered WHERE received = 'Sim'
    ),
    max_general AS (
      SELECT json_agg(
        json_build_object('value', value, 'day', day, 'description', description)
      ) AS arr
      FROM (SELECT value, day, description FROM received_only ORDER BY value DESC NULLS LAST LIMIT 1) m
    ),
    max_period AS (
      SELECT json_agg(
        json_build_object('value', m.value, 'day', m.day, 'description', m.description)
      ) AS arr
      FROM (
        SELECT r.value, r.day, r.description
        FROM received_only r
        CROSS JOIN period p
        WHERE p.start_p IS NOT NULL AND p.end_p IS NOT NULL
          AND r.day >= p.start_p AND r.day <= p.end_p
        ORDER BY r.value DESC NULLS LAST
        LIMIT 1
      ) m
    ),
    penultimate_row AS (
      SELECT json_agg(
        json_build_object('value', value, 'day', day, 'description', description)
      ) AS arr
      FROM (SELECT value, day, description FROM received_only ORDER BY day DESC NULLS LAST LIMIT 1) p
    ),
    last_three AS (
      SELECT json_agg(
        json_build_object('value', value, 'day', day, 'description', description)
        ORDER BY day DESC NULLS LAST
      ) AS arr
      FROM (SELECT value, day, description FROM received_only ORDER BY day DESC NULLS LAST LIMIT 3) t
    )
    SELECT
      (SELECT cnt FROM count_nr) AS count_not_received,
      (SELECT arr FROM max_general) AS max_general,
      (SELECT arr FROM max_period) AS max_period,
      (SELECT arr FROM penultimate_row) AS penultimate,
      (SELECT arr FROM last_three) AS last_three_donations
  `;

  try {
    const { rows } = await pool.query(query, [donorIdNum, requestNameStr || ""]);
    const row = rows[0];

    const toArray = (v) => {
      if (v == null) return [];
      if (Array.isArray(v)) return v;
      try {
        const parsed = typeof v === "string" ? JSON.parse(v) : v;
        return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
      } catch {
        return [];
      }
    };

    return {
      maxGeneral: toArray(row?.max_general),
      maxPeriod: toArray(row?.max_period),
      penultimate: toArray(row?.penultimate),
      countNotReceived: Number(row?.count_not_received) || 0,
      lastThreeDonations: toArray(row?.last_three_donations) || [],
    };
  } catch (err) {
    console.error("[worklist] getWorklistModalDetail:", err?.message);
    return {
      maxGeneral: [],
      maxPeriod: [],
      penultimate: [],
      countNotReceived: 0,
      lastThreeDonations: [],
    };
  }
}

/**
 * Atualiza agendamento do request (request_status Agendado, data, observação, telefone).
 */
export async function updateRequestSchedule(requestId, payload) {
  const reqId = Number(requestId);
  if (!reqId) throw new Error("requestId inválido");

  const { request_scheduled_date, request_observation, request_tel_success } =
    payload ?? {};

  const query = `
    UPDATE request
    SET
      request_status = $2,
      request_scheduled_date = $3,
      request_observation = $4,
      request_tel_success = $5
    WHERE id = $1
    RETURNING id, request_status, request_scheduled_date, request_observation, request_tel_success
  `;
  const statusArray = ["Agendado"];
  const statusJson = JSON.stringify(statusArray);
  const values = [
    reqId,
    statusJson,
    request_scheduled_date ?? null,
    request_observation ?? null,
    request_tel_success ?? null,
  ];
  const { rows } = await pool.query(query, values);
  return rows[0] ?? null;
}

/**
 * Registra atividade do operador (inserção em operator_activity).
 */
export async function registerOperatorActivity(payload) {
  const {
    operatorId,
    operatorName,
    activityType,
    donorId = null,
    donorName = null,
    requestName = null,
    metadata = null,
  } = payload ?? {};

  if (operatorId == null || !operatorName || !activityType) return null;

  const query = `
    INSERT INTO operator_activity (operator_code_id, operator_name, activity_type, donor_id, donor_name, request_name, metadata, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;
  const values = [
    Number(operatorId),
    operatorName,
    activityType,
    donorId ?? null,
    donorName ?? null,
    requestName ?? null,
    metadata != null ? JSON.stringify(metadata) : null,
    new Date().toISOString(),
  ];
  const { rows } = await pool.query(query, values);
  return rows[0] ?? null;
}
