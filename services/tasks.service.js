import pool from "../db/db.js";
import { getDonorById } from "./donor.service.js";

/**
 * task_manager (Postgres): id, reason, status, priority, donor_id,
 * operator_required (FK operator.operator_code_id), operator_activity_conclude (FK),
 * created_at, updated_at, admin_reason.
 * Índices sugeridos: (created_at DESC), (status), (priority, status).
 */
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

async function getTaskForNotification(id) {
  const numericId = Number(id);
  if (!numericId) return null;

  const { rows } = await pool.query(
    `
    SELECT
      t.id,
      t.reason,
      t.status,
      t.priority,
      t.operator_required,
      t.operator_activity_conclude,
      t.created_at,
      t.updated_at,
      t.admin_reason,
      op_req.operator_code_id AS req_operator_code_id,
      op_req.operator_name AS req_operator_name,
      op_concl.operator_code_id AS concl_operator_code_id,
      op_concl.operator_name AS concl_operator_name
    FROM task_manager t
    LEFT JOIN operator op_req ON op_req.operator_code_id = t.operator_required
    LEFT JOIN operator op_concl ON op_concl.operator_code_id = t.operator_activity_conclude
    WHERE t.id = $1
  `,
    [numericId]
  );

  const t = rows[0];
  if (!t) return null;

  return {
    id: t.id,
    reason: t.reason,
    status: t.status,
    priority: t.priority,
    operator_required: t.operator_required,
    operator_activity_conclude: t.operator_activity_conclude,
    created_at: t.created_at,
    updated_at: t.updated_at,
    admin_reason: t.admin_reason,
    operator_required_info:
      t.req_operator_code_id != null
        ? {
            operator_code_id: t.req_operator_code_id,
            operator_name: t.req_operator_name,
          }
        : null,
    operator_conclude_info:
      t.concl_operator_code_id != null
        ? {
            operator_code_id: t.concl_operator_code_id,
            operator_name: t.concl_operator_name,
          }
        : null,
  };
}

async function notifyTaskManagerEvent(type, taskId) {
  try {
    const task = await getTaskForNotification(taskId);
    if (!task) return;
    await pool.query("NOTIFY task_manager_events, $1", [
      JSON.stringify({ type, task }),
    ]);
  } catch {
    // Notificação é best-effort, não deve quebrar fluxo principal
  }
}

/**
 * Retorna lista paginada de tasks com totais para a dashboard.
 * Filtros opcionais: status ('all' | 'pendente' | ... | 'prioridade_alta'), search (texto).
 */
export async function getTasksPage(
  page = 1,
  limit = DEFAULT_PAGE_SIZE,
  filters = {}
) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(limit) || DEFAULT_PAGE_SIZE)
  );
  const offset = (pageNum - 1) * limitNum;
  const statusFilter =
    filters.status === "all" || !filters.status ? null : filters.status;
  const prioridadeAlta = statusFilter === "prioridade_alta";
  const searchTerm =
    typeof filters.search === "string" && filters.search.trim()
      ? `%${filters.search.trim().toLowerCase()}%`
      : null;
  const rawOperator = filters.operator_required ?? filters.operator_code_id;
  const operatorRequired =
    rawOperator !== undefined && rawOperator !== null && rawOperator !== ""
      ? Number(rawOperator)
      : null;
  const filterByOperator =
    operatorRequired !== null && !Number.isNaN(operatorRequired);

  const whereParts = [];
  const params = [];
  let idx = 1;

  if (filterByOperator) {
    whereParts.push(`t.operator_required = $${idx}`);
    params.push(operatorRequired);
    idx += 1;
  }
  if (prioridadeAlta) {
    whereParts.push("(t.priority = 'alta' AND t.status <> 'concluido')");
  } else if (statusFilter) {
    whereParts.push(`t.status = $${idx}`);
    params.push(statusFilter);
    idx += 1;
  }
  if (searchTerm) {
    whereParts.push(
      `(LOWER(t.reason) LIKE $${idx} OR LOWER(op_req.operator_name) LIKE $${idx} OR LOWER(d.donor_name) LIKE $${idx})`
    );
    params.push(searchTerm);
    idx += 1;
  }

  const whereClause =
    whereParts.length > 0 ? "WHERE " + whereParts.join(" AND ") : "";
  const listParams = [...params, limitNum, offset];

  const summaryWhere = filterByOperator
    ? "WHERE operator_required = $1"
    : "";
  const summaryParams = filterByOperator ? [operatorRequired] : [];

  const [summaryResult, listResult] = await Promise.all([
    pool.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'pendente')::int AS pendente,
        COUNT(*) FILTER (WHERE status = 'em_andamento')::int AS em_andamento,
        COUNT(*) FILTER (WHERE status = 'concluido')::int AS concluido,
        COUNT(*) FILTER (WHERE priority = 'alta' AND status <> 'concluido')::int AS prioridade_alta
      FROM task_manager
      ${summaryWhere}
    `,
      summaryParams
    ),
    pool.query(
      `
      SELECT
        t.id, t.reason, t.status, t.priority, t.donor_id,
        t.operator_required, t.operator_activity_conclude, t.created_at, t.updated_at, t.admin_reason,
        op_req.operator_code_id AS req_operator_code_id, op_req.operator_name AS req_operator_name,
        op_concl.operator_code_id AS concl_operator_code_id, op_concl.operator_name AS concl_operator_name,
        d.donor_id AS donor_donor_id, d.donor_name AS donor_name, d.donor_address AS donor_address,
        d.donor_city AS donor_city, d.donor_neighborhood AS donor_neighborhood, d.donor_tel_1 AS donor_tel_1
      FROM task_manager t
      LEFT JOIN operator op_req ON op_req.operator_code_id = t.operator_required
      LEFT JOIN operator op_concl ON op_concl.operator_code_id = t.operator_activity_conclude
      LEFT JOIN donor d ON d.donor_id = t.donor_id
      ${whereClause}
      ORDER BY
        CASE WHEN t.priority = 'alta' AND t.status <> 'concluido' THEN 0 ELSE 1 END,
        CASE WHEN t.status = 'concluido' THEN 1 ELSE 0 END,
        t.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `,
      listParams
    ),
  ]);

  const countQuery =
    whereParts.length > 0
      ? pool.query(
          `SELECT COUNT(*)::int AS cnt FROM task_manager t
           LEFT JOIN operator op_req ON op_req.operator_code_id = t.operator_required
           LEFT JOIN donor d ON d.donor_id = t.donor_id
           ${whereClause}`,
          params
        )
      : Promise.resolve({
          rows: [{ cnt: summaryResult.rows[0].total }],
        });

  const countResult = await countQuery;
  const filteredTotal = Number(countResult.rows[0]?.cnt ?? 0);
  const totalPages = Math.ceil(filteredTotal / limitNum);
  const tasks = listResult.rows ?? [];
  const summary = summaryResult.rows[0] ?? {};
  const total = summary.total ?? 0;

  const normalizedTasks = tasks.map((t) => ({
    id: t.id,
    reason: t.reason,
    status: t.status,
    priority: t.priority,
    donor_id: t.donor_id,
    operator_required: t.operator_required,
    operator_activity_conclude: t.operator_activity_conclude,
    created_at: t.created_at,
    updated_at: t.updated_at,
    admin_reason: t.admin_reason,
    operator_required_info:
      t.req_operator_code_id != null
        ? { operator_code_id: t.req_operator_code_id, operator_name: t.req_operator_name }
        : null,
    operator_conclude_info:
      t.concl_operator_code_id != null
        ? {
            operator_code_id: t.concl_operator_code_id,
            operator_name: t.concl_operator_name,
          }
        : null,
    donor:
      t.donor_donor_id != null
        ? {
            donor_id: t.donor_donor_id,
            donor_name: t.donor_name,
            donor_address: t.donor_address,
            donor_city: t.donor_city,
            donor_neighborhood: t.donor_neighborhood,
            donor_tel_1: t.donor_tel_1,
          }
        : null,
  }));

  return {
    tasks: normalizedTasks,
    page: pageNum,
    totalPages,
    total: filteredTotal,
    summary: {
      total: summary.total ?? 0,
      pendente: summary.pendente ?? 0,
      em_andamento: summary.em_andamento ?? 0,
      concluido: summary.concluido ?? 0,
      prioridade_alta: summary.prioridade_alta ?? 0,
    },
  };
}

/**
 * Cria uma nova tarefa.
 */
export async function createTask(payload) {
  const {
    reason,
    priority = "media",
    operator_required,
    donor_id = null,
  } = payload;

  if (!reason || !String(reason).trim()) throw new Error("reason é obrigatório");

  const now = new Date().toISOString();
  const query = `
    INSERT INTO task_manager (
      reason, priority, operator_required, status,
      donor_id, created_at, updated_at
    )
    VALUES ($1, $2, $3, 'pendente', $4, $5, $6)
    RETURNING id, reason, status, priority, donor_id, created_at
  `;
  const values = [
    String(reason).trim(),
    priority === "alta" ? "alta" : "media",
    operator_required ?? null,
    donor_id ?? null,
    now,
    now,
  ];
  const { rows } = await pool.query(query, values);
  const row = rows[0];
  if (!row) return null;

  await notifyTaskManagerEvent("created", row.id);
  return row;
}

/**
 * Atualiza apenas o status da task (e opcionalmente quem concluiu).
 */
export async function updateTaskStatus(taskId, status, operatorCodeId = null) {
  const id = Number(taskId);
  if (!id) throw new Error("ID da tarefa inválido");

  const updates = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (
    (status === "em_andamento" || status === "concluido") &&
    operatorCodeId != null
  ) {
    updates.operator_activity_conclude = operatorCodeId;
  }

  const setClause = Object.keys(updates)
    .map((k, i) => `${k} = $${i + 2}`)
    .join(", ");
  const values = [id, ...Object.values(updates)];

  const query = `
    UPDATE task_manager
    SET ${setClause}
    WHERE id = $1
    RETURNING id, status, updated_at, operator_activity_conclude
  `;
  const { rows } = await pool.query(query, values);
  if (rows.length === 0) throw new Error("Tarefa não encontrada");

  await notifyTaskManagerEvent("updated", id);
  return rows[0];
}

/**
 * Conclui a tarefa com admin_reason e registra quem concluiu.
 */
export async function concludeTask(taskId, adminReason, operatorCodeId = null) {
  const id = Number(taskId);
  if (!id) throw new Error("ID da tarefa inválido");

  const query = `
    UPDATE task_manager
    SET
      status = 'concluido',
      admin_reason = $2,
      updated_at = $3,
      operator_activity_conclude = COALESCE($4, operator_activity_conclude)
    WHERE id = $1
    RETURNING id, status, updated_at
  `;
  const values = [
    id,
    adminReason,
    new Date().toISOString(),
    operatorCodeId ?? null,
  ];
  const { rows } = await pool.query(query, values);
  if (rows.length === 0) throw new Error("Tarefa não encontrada");

  await notifyTaskManagerEvent("updated", id);
  return rows[0];
}

/**
 * Dados completos para o modal de detalhes: task (já vem da lista), donor, collectors, operators.
 * Uma única chamada HTTP para o frontend.
 */
export async function getTaskDetailsForModal(taskId) {
  const id = Number(taskId);
  if (!id) return null;

  const [taskRowResult, donorIdResult, operatorsResult, collectorsResult] =
    await Promise.all([
      pool.query(
        `SELECT t.id, t.reason, t.status, t.priority, t.donor_id,
                t.operator_required, t.operator_activity_conclude, t.created_at, t.updated_at, t.admin_reason,
                op_req.operator_name AS req_operator_name,
                op_concl.operator_name AS concl_operator_name
         FROM task_manager t
         LEFT JOIN operator op_req ON op_req.operator_code_id = t.operator_required
         LEFT JOIN operator op_concl ON op_concl.operator_code_id = t.operator_activity_conclude
         WHERE t.id = $1`,
        [id]
      ),
      pool.query(
        `SELECT donor_id FROM task_manager WHERE id = $1`,
        [id]
      ),
      pool.query(
        `SELECT operator_code_id, operator_name FROM operator WHERE operator_active = true ORDER BY operator_name`
      ),
      pool.query(
        `SELECT collector_code_id, collector_name FROM collector WHERE collector_name IS DISTINCT FROM '???' ORDER BY collector_name`
      ),
    ]);

  const taskRow = taskRowResult.rows[0];
  if (!taskRow) return null;

  const donorId = taskRow.donor_id ?? donorIdResult.rows[0]?.donor_id;
  const donor = donorId ? await getDonorById(donorId) : null;

  const task = {
    id: taskRow.id,
    reason: taskRow.reason,
    status: taskRow.status,
    priority: taskRow.priority,
    donor_id: taskRow.donor_id,
    operator_required: taskRow.operator_required,
    operator_activity_conclude: taskRow.operator_activity_conclude,
    created_at: taskRow.created_at,
    updated_at: taskRow.updated_at,
    admin_reason: taskRow.admin_reason,
    operator_required_info: taskRow.req_operator_name
      ? { operator_name: taskRow.req_operator_name }
      : null,
    operator_conclude_info: taskRow.concl_operator_name
      ? { operator_name: taskRow.concl_operator_name }
      : null,
  };

  return {
    task,
    donor,
    operators: operatorsResult.rows || [],
    collectors: collectorsResult.rows || [],
  };
}
