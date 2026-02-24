import { getMonthHistory } from "../services/monthHistory.service.js";

export async function getMonthHistoryController(req, res, next) {
  try {
    const { month } = req.query;

    if (!month) {
      return res
        .status(400)
        .json({ error: "Parâmetro 'month' é obrigatório no formato YYYY-MM." });
    }

    const data = await getMonthHistory(String(month));
    return res.json({ donors: data, month });
  } catch (error) {
    return next(error);
  }
}

