import {
  getLeadsDashboard,
  getLeadById,
  updateLeadStatus,
  scheduleLead,
  updateLead,
  convertLeadToDonation,
  getLeadsHistory,
} from "../services/leads.service.js";

/**
 * GET /leads/dashboard?operatorId=&page=&neighborhood=
 * Uma única chamada retorna: totalCount, currentLead, availableNeighborhoods.
 */
export async function getLeadsDashboardController(req, res) {
  try {
    const { operatorId, page, neighborhood } = req.query;
    const data = await getLeadsDashboard(
      operatorId ? Number(operatorId) : null,
      page ? Number(page) : 1,
      neighborhood ?? ""
    );
    res.json(data);
  } catch (error) {
    console.error("[leads] getLeadsDashboard:", error?.message);
    res.status(500).json({
      error: "Erro ao carregar dashboard de leads",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * GET /leads/:leadId - Lead por ID (modal edição).
 */
export async function getLeadByIdController(req, res) {
  try {
    const { leadId } = req.params;
    const data = await getLeadById(leadId ? Number(leadId) : null);
    if (!data) return res.status(404).json({ error: "Lead não encontrado" });
    res.json(data);
  } catch (error) {
    console.error("[leads] getLeadById:", error?.message);
    res.status(500).json({
      error: "Erro ao buscar lead",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * PATCH /leads/:leadId/status - Atualiza status (Não Atendeu, Não pode ajudar, etc).
 * Body: { status, operatorId, operatorName, donorName } (donorName = nome do lead).
 */
export async function updateLeadStatusController(req, res) {
  try {
    const { leadId } = req.params;
    const { status, operatorId, operatorName, donorName } = req.body;
    const data = await updateLeadStatus(
      Number(leadId),
      status,
      Number(operatorId),
      operatorName,
      donorName
    );
    res.json(data);
  } catch (error) {
    console.error("[leads] updateLeadStatus:", error?.message);
    res.status(500).json({
      error: "Erro ao atualizar status do lead",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * PATCH /leads/:leadId/schedule - Agendar lead.
 * Body: { dateScheduling, telScheduling, observationScheduling, operatorId, operatorName, donorName }.
 */
export async function scheduleLeadController(req, res) {
  try {
    const { leadId } = req.params;
    const payload = req.body;
    const data = await scheduleLead(
      Number(leadId),
      payload,
      Number(payload.operatorId),
      payload.operatorName,
      payload.donorName
    );
    res.json(data);
  } catch (error) {
    console.error("[leads] scheduleLead:", error?.message);
    res.status(500).json({
      error: "Erro ao agendar lead",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * PATCH /leads/:leadId - Atualizar dados do lead (edição).
 * Body: { name, address, neighborhood, city, icpf, tel1, tel2, ... }.
 */
export async function updateLeadController(req, res) {
  try {
    const { leadId } = req.params;
    const data = await updateLead(Number(leadId), req.body);
    res.json(data);
  } catch (error) {
    if (error?.code === "DUPLICATE_CPF") {
      return res.status(409).json({ error: error.message });
    }
    console.error("[leads] updateLead:", error?.message);
    res.status(500).json({
      error: "Erro ao atualizar lead",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * POST /leads/:leadId/convert-to-donation - Converter lead em doador + doação.
 * Body: { formData, operatorId, operatorName, currentLead }.
 */
export async function convertLeadToDonationController(req, res) {
  try {
    const { leadId } = req.params;
    const { formData, operatorId, operatorName, currentLead } = req.body;
    const data = await convertLeadToDonation(
      Number(leadId),
      formData,
      Number(operatorId),
      operatorName,
      currentLead
    );
    res.json(data);
  } catch (error) {
    console.error("[leads] convertLeadToDonation:", error?.message);
    res.status(500).json({
      error: "Erro ao converter lead em doação",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * GET /leads/history?operatorId= - Histórico de leads do operador (modal).
 */
export async function getLeadsHistoryController(req, res) {
  try {
    const { operatorId } = req.query;
    const data = await getLeadsHistory(operatorId ? Number(operatorId) : null);
    res.json(data);
  } catch (error) {
    console.error("[leads] getLeadsHistory:", error?.message);
    res.status(500).json({
      error: "Erro ao carregar histórico de leads",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}
