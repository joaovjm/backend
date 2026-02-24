import { getDonationsForPrint } from "../services/checkPrint.service.js";

export async function getDonationsForPrintController(req, res, next) {
  try {
    const { startDate, endDate, donationType } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "startDate e endDate são obrigatórios (YYYY-MM-DD).",
      });
    }

    const data = await getDonationsForPrint({
      startDate: String(startDate).trim(),
      endDate: String(endDate).trim(),
      donationType: donationType === "Avulso" || donationType === "Mensal"
        ? donationType
        : "Todos",
    });

    return res.json(data);
  } catch (error) {
    return next(error);
  }
}
