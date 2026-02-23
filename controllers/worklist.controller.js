import {
  getWorklist,
  getWorklistRequestById,
  getWorklistModalDetail,
  updateRequestAccess,
  updateRequestStatus,
  updateRequestSchedule,
  registerOperatorActivity,
} from "../services/worklist.service.js";

/**
 * GET /worklist?operatorId=&requestName=
 * Retorna worklistNames e, se requestName informado, worklistRequests.
 */
export async function getWorklistController(req, res) {
  try {
    const { operatorId, requestName } = req.query;
    const data = await getWorklist(
      operatorId ? Number(operatorId) : null,
      requestName || null
    );
    res.json(data);
  } catch (error) {
    console.error("[worklist] getWorklist:", error?.message);
    res.status(500).json({
      error: "Erro ao carregar lista de trabalho",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * GET /worklist/request/:requestId?operatorId=&requestName=
 * Retorna um único item (para atualizar cache após edição no modal).
 */
export async function getWorklistRequestByIdController(req, res) {
  try {
    const { requestId } = req.params;
    const { operatorId, requestName } = req.query;
    const item = await getWorklistRequestById(
      operatorId ? Number(operatorId) : null,
      requestName || null,
      Number(requestId)
    );
    if (!item) {
      return res.status(404).json({ error: "Item não encontrado" });
    }
    res.json(item);
  } catch (error) {
    console.error("[worklist] getWorklistRequestById:", error?.message);
    res.status(500).json({
      error: "Erro ao carregar item",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * PATCH /worklist/access/:requestId
 * Body: { operatorId, operatorName, donorId, donorName, requestName }
 * Atualiza request_date_accessed e registra atividade worklist_click.
 */
export async function updateRequestAccessController(req, res) {
  try {
    const { requestId } = req.params;
    const body = req.body || {};
    const data = await updateRequestAccess(Number(requestId), {
      operatorId: body.operatorId,
      operatorName: body.operatorName,
      donorId: body.donorId,
      donorName: body.donorName,
      requestName: body.requestName,
    });
    res.json(data);
  } catch (error) {
    console.error("[worklist] updateRequestAccess:", error?.message);
    res.status(500).json({
      error: "Erro ao registrar acesso",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * PATCH /worklist/request/:requestId/status
 * Body: { request_status: string[] }
 */
export async function updateRequestStatusController(req, res) {
  console.log("Chegou no controller do status da requisição")
  try {
    const { requestId } = req.params;
    const { request_status: requestStatus } = req.body || {};
    const data = await updateRequestStatus(Number(requestId), requestStatus);
    if (!data) {
      return res.status(404).json({ error: "Request não encontrado" });
    }
    res.json(data);
  } catch (error) {
    console.error("[worklist] updateRequestStatus:", error?.message);
    res.status(500).json({
      error: "Erro ao atualizar status",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * GET /worklist/modal-detail?donorId=&requestName=
 * Dados consolidados para o ModalWorklist: maxGeneral, maxPeriod, penultimate, countNotReceived, lastThreeDonations.
 */
export async function getWorklistModalDetailController(req, res) {
  try {
    const { donorId, requestName } = req.query;
    const data = await getWorklistModalDetail(
      donorId ? Number(donorId) : null,
      requestName || null
    );
    res.json(data);
  } catch (error) {
    console.error("[worklist] getWorklistModalDetail:", error?.message);
    res.status(500).json({
      error: "Erro ao carregar detalhe do modal",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * PATCH /worklist/request/:requestId/schedule
 * Body: { request_scheduled_date, request_observation, request_tel_success }
 */
export async function updateRequestScheduleController(req, res) {
  try {
    const { requestId } = req.params;
    const data = await updateRequestSchedule(Number(requestId), req.body || {});
    if (!data) {
      return res.status(404).json({ error: "Request não encontrado" });
    }
    res.json(data);
  } catch (error) {
    console.error("[worklist] updateRequestSchedule:", error?.message);
    res.status(500).json({
      error: "Erro ao agendar",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * POST /worklist/activity
 * Body: { operatorId, operatorName, activityType, donorId?, donorName?, requestName?, metadata? }
 */
export async function registerOperatorActivityController(req, res) {
  try {
    const data = await registerOperatorActivity(req.body || {});
    res.status(201).json(data ?? { ok: true });
  } catch (error) {
    console.error("[worklist] registerOperatorActivity:", error?.message);
    res.status(500).json({
      error: "Erro ao registrar atividade",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}
