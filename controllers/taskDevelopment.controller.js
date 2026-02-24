import {
  getTaskDevelopment,
  createTaskDevelopment,
  updateTaskDevelopmentStatus,
  deleteTaskDevelopment,
} from "../services/taskDevelopment.service.js";
import pool from "../db/db.js";

/**
 * GET /taskdevelopment
 * Retorna todas as tarefas de desenvolvimento + resumo agregado.
 */
export async function getTaskDevelopmentController(req, res) {
  try {
    const adminId =
      req.query.adminId !== undefined && req.query.adminId !== null
        ? Number(req.query.adminId)
        : null;

    const data = await getTaskDevelopment({
      adminId: Number.isNaN(adminId) ? null : adminId,
    });
    res.json(data);
  } catch (error) {
    console.error("[taskdevelopment] get:", error?.message);
    res.status(500).json({
      error: "Erro ao carregar tarefas de desenvolvimento",
      detail:
        process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * GET /taskdevelopment/stream
 * Stream de eventos de developer_task via Server-Sent Events (SSE) usando LISTEN/NOTIFY do Postgres.
 */
export async function taskDevelopmentStreamController(req, res) {
  // Headers SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.flushHeaders?.();

  const client = await pool.connect();

  await client.query("LISTEN developer_task_events");

  const sendEvent = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const onNotification = (msg) => {
    if (!msg.payload) return;
    try {
      const payload = JSON.parse(msg.payload);
      sendEvent(payload);
    } catch (e) {
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
      .query("UNLISTEN developer_task_events")
      .catch(() => {})
      .finally(() => {
        client.release();
      });
    res.end();
  });
}

/**
 * POST /taskdevelopment
 * Body: { title, description, priority?, images?, adminId? }
 */
export async function createTaskDevelopmentController(req, res) {
  try {
    const { title, description, priority, images, adminId } = req.body ?? {};
    const task = await createTaskDevelopment({
      title,
      description,
      priority,
      images,
      adminId,
    });
    res.status(201).json(task);
  } catch (error) {
    if (
      error?.message === "title é obrigatório" ||
      error?.message === "description é obrigatório"
    ) {
      return res.status(400).json({ error: error.message });
    }

    console.error("[taskdevelopment] create:", error?.message);
    res.status(500).json({
      error: "Erro ao criar tarefa de desenvolvimento",
      detail:
        process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * PATCH /taskdevelopment/:id/status
 * Body: { status, developer_response? }
 */
export async function updateTaskDevelopmentStatusController(req, res) {
  try {
    const { id } = req.params;
    const { status, developer_response } = req.body ?? {};

    if (!status) {
      return res.status(400).json({ error: "status é obrigatório" });
    }

    const updated = await updateTaskDevelopmentStatus(
      id,
      status,
      developer_response ?? null
    );
    res.json(updated);
  } catch (error) {
    if (error?.message === "Tarefa de desenvolvimento não encontrada") {
      return res.status(404).json({ error: error.message });
    }

    console.error("[taskdevelopment] updateStatus:", error?.message);
    res.status(500).json({
      error: "Erro ao atualizar tarefa de desenvolvimento",
      detail:
        process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * DELETE /taskdevelopment/:id
 */
export async function deleteTaskDevelopmentController(req, res) {
  try {
    const { id } = req.params;
    await deleteTaskDevelopment(id);
    res.status(204).send();
  } catch (error) {
    if (error?.message === "Tarefa de desenvolvimento não encontrada") {
      return res.status(404).json({ error: error.message });
    }

    console.error("[taskdevelopment] delete:", error?.message);
    res.status(500).json({
      error: "Erro ao excluir tarefa de desenvolvimento",
      detail:
        process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

