import { getOperatorReport } from "../services/operatorReport.service.js";

/**
 * GET /operator-report?startDate=&endDate=&operatorId=&searchType=
 * Retorna relatório de doações: { totalValue, donations }.
 */
export async function operatorReportController(req, res) {
  try {
    const { startDate, endDate, operatorId, searchType } = req.query;

    const data = await getOperatorReport({
      startDate: startDate || null,
      endDate: endDate || null,
      operatorId: operatorId ? Number(operatorId) : null,
      searchType: searchType || "received",
    });

    res.json(data);
  } catch (error) {
    console.error("[operator-report] Erro:", error?.message);
    res.status(500).json({
      error: "Erro ao carregar relatório de doações",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}
