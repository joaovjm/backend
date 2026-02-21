import { getDashboard } from "../services/dashboard.service.js";
import { getEditDonationData } from "../services/donation.service.js";

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

/**
 * GET /dashboard/edit-donation-data?donorId=&receiptDonationId=
 * Concentra todos os dados necessários para o ModalEditDonation em uma única chamada.
 */
export async function getEditDonationDataController(req, res) {
  try {
    const { donorId, receiptDonationId } = req.query;
    const data = await getEditDonationData(
      donorId ? Number(donorId) : null,
      receiptDonationId ? Number(receiptDonationId) : null
    );
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao carregar dados do modal de edição",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}
