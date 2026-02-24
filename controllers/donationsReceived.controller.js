import { getDonationsReceivedSummary } from "../services/donationsReceived.service.js";

export async function donationsReceivedController(req, res, next) {
  try {
    const { startDate, endDate } = req.query;

    const data = await getDonationsReceivedSummary({
      startDate: startDate ?? null,
      endDate: endDate ?? null,
    });

    res.json(data);
  } catch (error) {
    next(error);
  }
}

