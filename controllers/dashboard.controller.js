import {
  getDashboard,
  getDashboardByOperator,
  getOperatorActivities,
  getDonorMonthlyEvolution,
  getOperatorScheduled,
} from "../services/dashboard.service.js";
import { getEditDonationData } from "../services/donation.service.js";

export async function dashboardController(req, res) {
  try {
    const { operatorId } = req.query;

    const data = operatorId
      ? await getDashboardByOperator(Number(operatorId))
      : await getDashboard();

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

export async function dashboardActivitiesController(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const data = await getOperatorActivities({
      startDate: startDate || null,
      endDate: endDate || null,
    });
    res.json(data);
  } catch (error) {
    console.error("[dashboard] Erro ao carregar atividades:", error?.message);
    res.status(500).json({
      error: "Erro ao carregar atividades de operadoras",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

export async function dashboardDonorMonthlyEvolutionController(req, res) {
  try {
    const data = await getDonorMonthlyEvolution();
    res.json(data);
  } catch (error) {
    console.error(
      "[dashboard] Erro ao carregar evolução mensal diária:",
      error?.message,
    );
    res.status(500).json({
      error: "Erro ao carregar evolução mensal diária",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

export async function dashboardOperatorScheduledController(req, res) {
  try {
    const operatorId =
      req.params.operatorId || req.query.operatorId || req.query.operator_id;
    if (!operatorId) {
      return res.status(400).json({ error: "operatorId é obrigatório" });
    }
    const data = await getOperatorScheduled(Number(operatorId));
    res.json(data);
  } catch (error) {
    console.error(
      "[dashboard] Erro ao carregar agendados do operador:",
      error?.message,
    );
    res.status(500).json({
      error: "Erro ao carregar agendados do operador",
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
