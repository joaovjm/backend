import {
  listCollectors,
  changeDonationCollector,
} from "../services/collector.service.js";

export async function listCollectorsController(req, res, next) {
  try {
    const data = await listCollectors();
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

export async function changeDonationCollectorController(req, res, next) {
  try {
    const { collectorCodeId, receiptDonationId, date, reason } = req.body || {};

    if (!collectorCodeId || !receiptDonationId || !date) {
      return res.status(400).json({
        error: "collectorCodeId, receiptDonationId e date são obrigatórios.",
      });
    }

    const result = await changeDonationCollector({
      collectorCodeId,
      receiptDonationId,
      date,
      reason: reason ?? null,
    });

    if (result.status === "NOT_FOUND") {
      return res.status(404).json({ status: "NOT_FOUND" });
    }

    if (result.status === "ALREADY_RECEIVED") {
      return res.status(409).json({ status: "ALREADY_RECEIVED" });
    }

    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

