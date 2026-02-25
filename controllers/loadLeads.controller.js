import { getLoadLeadsConfig, importLeads } from "../services/loadLeads.service.js";

/**
 * GET /loadleads — Dados consolidados para a página LoadLeads (uma única chamada).
 */
export async function getLoadLeadsController(req, res) {
  try {
    const data = await getLoadLeadsConfig();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao carregar dados de LoadLeads",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * POST /loadleads — Importação em lote de leads (Excel).
 * Body: { rows: Array<Record>, typeLead: string }.
 */
export async function postImportLeadsController(req, res) {
  try {
    const { rows, typeLead } = req.body;
    const result = await importLeads(rows || [], typeLead);
    res.json(result);
  } catch (error) {
    const message = error?.message || "Erro ao importar leads";
    const status = message.includes("Nenhum") ? 400 : 500;
    res.status(status).json({
      error: message,
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}
