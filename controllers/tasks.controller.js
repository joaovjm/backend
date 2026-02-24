import pool from "../db/db.js";
import {
  getTasksPage,
  createTask,
  updateTaskStatus,
  concludeTask,
  getTaskDetailsForModal,
} from "../services/tasks.service.js";

/**
 * GET /tasks?page=1&limit=20
 * Retorna lista paginada e totais para a dashboard (uma única chamada).
 */
export async function getTasksController(req, res) {
  try {
    const page = req.query.page ?? 1;
    const limit = req.query.limit ?? 20;
    const operatorRequired =
      req.query.operator_required ?? req.query.operator_code_id ?? null;
    const filters = {
      status: req.query.status ?? "all",
      search: req.query.search ?? "",
      operator_required: operatorRequired,
    };
    const data = await getTasksPage(page, limit, filters);
    res.json(data);
  } catch (error) {
    console.error("[tasks] getTasks:", error?.message);
    res.status(500).json({
      error: "Erro ao carregar tarefas",
      detail:
        process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * GET /tasks/:id/details
 * Dados completos para o modal (task + donor + operators + collectors).
 */
export async function getTaskDetailsController(req, res) {
  try {
    const { id } = req.params;
    const data = await getTaskDetailsForModal(id);
    if (!data) {
      return res.status(404).json({ error: "Tarefa não encontrada" });
    }
    res.json(data);
  } catch (error) {
    console.error("[tasks] getTaskDetails:", error?.message);
    res.status(500).json({
      error: "Erro ao carregar detalhes da tarefa",
      detail:
        process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * POST /tasks
 * Body: { reason, priority?, operator_required?, donor_id? }
 */
export async function createTaskController(req, res) {
  try {
    const { reason, priority, operator_required, donor_id } = req.body;
    const task = await createTask({
      reason,
      priority,
      operator_required: operator_required ?? null,
      donor_id: donor_id ?? null,
    });
    res.status(201).json(task);
  } catch (error) {
    if (error?.message === "reason é obrigatório") {
      return res.status(400).json({ error: error.message });
    }
    console.error("[tasks] createTask:", error?.message);
    res.status(500).json({
      error: "Erro ao criar tarefa",
      detail:
        process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * PATCH /tasks/:id/status
 * Body: { status, operator_code_id? }
 */
export async function updateTaskStatusController(req, res) {
  try {
    const { id } = req.params;
    const { status, operator_code_id } = req.body;
    if (!status) {
      return res.status(400).json({ error: "status é obrigatório" });
    }
    const updated = await updateTaskStatus(id, status, operator_code_id ?? null);
    res.json(updated);
  } catch (error) {
    if (error?.message === "Tarefa não encontrada") {
      return res.status(404).json({ error: error.message });
    }
    console.error("[tasks] updateTaskStatus:", error?.message);
    res.status(500).json({
      error: "Erro ao atualizar status",
      detail:
        process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * PATCH /tasks/:id/conclude
 * Body: { admin_reason, operator_code_id? }
 */
export async function concludeTaskController(req, res) {
  try {
    const { id } = req.params;
    const { admin_reason, operator_code_id } = req.body;
    if (!admin_reason || String(admin_reason).trim() === "") {
      return res.status(400).json({
        error: "admin_reason (resultado da tarefa) é obrigatório",
      });
    }
    const updated = await concludeTask(
      id,
      String(admin_reason).trim(),
      operator_code_id ?? null
    );
    res.json(updated);
  } catch (error) {
    if (error?.message === "Tarefa não encontrada") {
      return res.status(404).json({ error: error.message });
    }
    console.error("[tasks] concludeTask:", error?.message);
    res.status(500).json({
      error: "Erro ao concluir tarefa",
      detail:
        process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * GET /tasks/stream
 * Stream de eventos de task_manager via Server-Sent Events (SSE) usando LISTEN/NOTIFY do Postgres.
 */
export async function tasksStreamController(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.flushHeaders?.();

  const client = await pool.connect();
  await client.query("LISTEN task_manager_events");

  const sendEvent = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const onNotification = (msg) => {
    if (!msg.payload) return;
    try {
      const payload = JSON.parse(msg.payload);
      sendEvent(payload);
    } catch {
      // Ignora payload inválido
    }
  };

  client.on("notification", onNotification);

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
    client.removeListener("notification", onNotification);
    client
      .query("UNLISTEN task_manager_events")
      .catch(() => {})
      .finally(() => {
        client.release();
      });
    res.end();
  });
}
