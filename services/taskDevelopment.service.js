import pool from "../db/db.js";

/**
 * Tarefas de desenvolvimento (Postgres).
 *
 * Tabela sugerida:
 * developer_task (
 *   id                SERIAL PRIMARY KEY,
 *   title             TEXT NOT NULL,
 *   description       TEXT NOT NULL,
 *   images            TEXT[] DEFAULT '{}',
 *   priority          TEXT NOT NULL DEFAULT 'media', -- 'baixa' | 'media' | 'alta'
 *   status            TEXT NOT NULL DEFAULT 'pendente', -- 'pendente' | 'em_andamento' | 'concluido' | 'cancelado'
 *   admin_created_by  INTEGER REFERENCES operator(operator_code_id),
 *   developer_response TEXT,
 *   created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   completed_at      TIMESTAMPTZ
 * );
 *
 * Índices recomendados (criados via migrations/SQL, não aqui no código):
 * - CREATE INDEX idx_developer_task_status ON developer_task (status);
 * - CREATE INDEX idx_developer_task_priority_status ON developer_task (priority, status);
 * - CREATE INDEX idx_developer_task_created_at ON developer_task (created_at DESC);
 */

function normalizePriority(priority) {
  if (priority === "alta") return "alta";
  if (priority === "baixa") return "baixa";
  return "media";
}

function mapRowToTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    images: row.images ?? [],
    priority: row.priority,
    status: row.status,
    admin_created_by: row.admin_created_by,
    developer_response: row.developer_response,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    admin:
      row.admin_operator_code_id != null
        ? {
            operator_code_id: row.admin_operator_code_id,
            operator_name: row.admin_operator_name,
          }
        : null,
  };
}

async function notifyDeveloperTaskEvent(type, task) {
  try {
    await pool.query("NOTIFY developer_task_events, $1", [
      JSON.stringify({ type, task }),
    ]);
  } catch (e) {
    // Notificação é melhor esforço; não deve quebrar fluxo principal
  }
}

/**
 * Retorna todas as tarefas de desenvolvimento + resumo agregado.
 * Filtros opcionais:
 * - adminId: mostra apenas tarefas criadas por um determinado admin.
 * Única chamada para a dashboard/admin de tarefas.
 */
export async function getTaskDevelopment(filters = {}) {
  const adminId =
    filters.adminId !== undefined && filters.adminId !== null
      ? Number(filters.adminId)
      : null;

  const whereParts = [];
  const params = [];
  let idx = 1;

  if (adminId) {
    whereParts.push(`dt.admin_created_by = $${idx}`);
    params.push(adminId);
    idx += 1;
  }

  const whereClause =
    whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

  const summaryQuery = `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'pendente')::int AS pendente,
      COUNT(*) FILTER (WHERE status = 'em_andamento')::int AS em_andamento,
      COUNT(*) FILTER (WHERE status = 'concluido')::int AS concluido,
      COUNT(*) FILTER (WHERE status = 'cancelado')::int AS cancelado,
      COUNT(*) FILTER (WHERE priority = 'alta' AND status <> 'concluido')::int AS prioridade_alta
    FROM developer_task dt
    ${whereClause}
  `;

  const listQuery = `
    SELECT
      dt.id,
      dt.title,
      dt.description,
      dt.images,
      dt.priority,
      dt.status,
      dt.admin_created_by,
      dt.developer_response,
      dt.created_at,
      dt.updated_at,
      dt.completed_at,
      op.operator_code_id AS admin_operator_code_id,
      op.operator_name AS admin_operator_name
    FROM developer_task dt
    LEFT JOIN operator op ON op.operator_code_id = dt.admin_created_by
    ${whereClause}
    ORDER BY
      CASE WHEN dt.priority = 'alta' AND dt.status <> 'concluido' THEN 0 ELSE 1 END,
      CASE WHEN dt.status = 'concluido' THEN 1 ELSE 0 END,
      dt.created_at DESC
  `;

  const [summaryResult, listResult] = await Promise.all([
    pool.query(summaryQuery, params),
    pool.query(listQuery, params),
  ]);

  const tasks = (listResult.rows ?? []).map(mapRowToTask);
  const summaryRow = summaryResult.rows[0] ?? {};

  return {
    tasks,
    summary: {
      total: summaryRow.total ?? 0,
      pendente: summaryRow.pendente ?? 0,
      em_andamento: summaryRow.em_andamento ?? 0,
      concluido: summaryRow.concluido ?? 0,
      cancelado: summaryRow.cancelado ?? 0,
      prioridade_alta: summaryRow.prioridade_alta ?? 0,
    },
  };
}

/**
 * Cria uma nova tarefa de desenvolvimento.
 */
export async function createTaskDevelopment(payload) {
  const {
    title,
    description,
    priority = "media",
    images = [],
    adminId = null,
  } = payload || {};

  if (!title || !String(title).trim()) {
    throw new Error("title é obrigatório");
  }
  if (!description || !String(description).trim()) {
    throw new Error("description é obrigatório");
  }

  const now = new Date().toISOString();
  const normalizedPriority = normalizePriority(priority);

  const query = `
    WITH inserted AS (
      INSERT INTO developer_task (
        title,
        description,
        images,
        priority,
        status,
        admin_created_by,
        developer_response,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'pendente', $5, NULL, $6, $7)
      RETURNING
        id,
        title,
        description,
        images,
        priority,
        status,
        admin_created_by,
        developer_response,
        created_at,
        updated_at,
        completed_at
    )
    SELECT
      i.*,
      op.operator_code_id AS admin_operator_code_id,
      op.operator_name AS admin_operator_name
    FROM inserted i
    LEFT JOIN operator op ON op.operator_code_id = i.admin_created_by
  `;

  const values = [
    String(title).trim(),
    String(description).trim(),
    images && images.length ? images : [],
    normalizedPriority,
    adminId ?? null,
    now,
    now,
  ];

  const { rows } = await pool.query(query, values);
  const row = rows[0];

  if (!row) {
    throw new Error("Falha ao criar tarefa de desenvolvimento");
  }

  const task = mapRowToTask(row);
  await notifyDeveloperTaskEvent("created", task);
  return task;
}

/**
 * Atualiza status e/ou resposta do desenvolvedor para uma task.
 */
export async function updateTaskDevelopmentStatus(
  taskId,
  status,
  developerResponse = null
) {
  const id = Number(taskId);
  if (!id) {
    throw new Error("ID da tarefa inválido");
  }
  if (!status) {
    throw new Error("status é obrigatório");
  }

  const now = new Date().toISOString();

  const query = `
    WITH updated AS (
      UPDATE developer_task
      SET
        status = $2,
        developer_response = COALESCE($3, developer_response),
        updated_at = $4,
        completed_at = CASE WHEN $2 = 'concluido' THEN $4 ELSE completed_at END
      WHERE id = $1
      RETURNING
        id,
        title,
        description,
        images,
        priority,
        status,
        admin_created_by,
        developer_response,
        created_at,
        updated_at,
        completed_at
    )
    SELECT
      u.*,
      op.operator_code_id AS admin_operator_code_id,
      op.operator_name AS admin_operator_name
    FROM updated u
    LEFT JOIN operator op ON op.operator_code_id = u.admin_created_by
  `;

  const values = [id, status, developerResponse ?? null, now];
  const { rows } = await pool.query(query, values);
  const row = rows[0];

  if (!row) {
    throw new Error("Tarefa de desenvolvimento não encontrada");
  }

  const task = mapRowToTask(row);
  await notifyDeveloperTaskEvent("updated", task);
  return task;
}

/**
 * Remove uma tarefa de desenvolvimento.
 */
export async function deleteTaskDevelopment(taskId) {
  const id = Number(taskId);
  if (!id) {
    throw new Error("ID da tarefa inválido");
  }

  const { rows } = await pool.query(
    `
    DELETE FROM developer_task
    WHERE id = $1
    RETURNING
      id,
      title,
      description,
      images,
      priority,
      status,
      admin_created_by,
      developer_response,
      created_at,
      updated_at,
      completed_at
  `,
    [id]
  );

  if (rows.length === 0) {
    throw new Error("Tarefa de desenvolvimento não encontrada");
  }

  const raw = rows[0];
  const task = mapRowToTask({
    ...raw,
    admin_operator_code_id: null,
    admin_operator_name: null,
  });
  await notifyDeveloperTaskEvent("deleted", task);
}

