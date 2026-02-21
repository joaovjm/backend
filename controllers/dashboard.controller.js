import { getDashboard } from "../services/dashboard.service.js";

export async function dashboardController(req, res) {
  try {
    const { startDate, endDate, operatorId, operatorType } = req.query;

    // startDate/endDate não enviados ou undefined → service usa 1º dia do mês até hoje
    const data = await getDashboard({
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      operatorId: operatorId ? Number(operatorId) : null,
      operatorType: operatorType || "Admin",
    });

    res.json(data);
  } catch (error) {
    console.error("[dashboard] Erro:", error?.message);
    console.error(error?.stack);
    res.status(500).json({
      error: "Erro ao carregar dashboard",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}
