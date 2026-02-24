import {
  getReceiverDonationsData,
  receiveDonation,
  markDepositAsSent,
} from "../services/receiverDonations.service.js";

export async function getReceiverDonationsController(req, res, next) {
  try {
    const { collectorCodeId } = req.query;

    const data = await getReceiverDonationsData({
      collectorCodeId: collectorCodeId ?? null,
    });

    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

export async function receiveDonationController(req, res, next) {
  try {
    const {
      receiptDonationId,
      collectorCodeId,
      date,
      confirmDifferentCollector = false,
    } = req.body ?? {};

    if (!receiptDonationId || !collectorCodeId || !date) {
      return res.status(400).json({
        error:
          "Campos obrigatórios: receiptDonationId, collectorCodeId e date.",
      });
    }

    const result = await receiveDonation({
      receiptDonationId,
      collectorCodeId,
      date,
      confirmDifferentCollector: Boolean(confirmDifferentCollector),
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function markDepositAsSentController(req, res, next) {
  try {
    const { receiptDonationId } = req.params;

    if (!receiptDonationId) {
      return res
        .status(400)
        .json({ error: "Parâmetro receiptDonationId é obrigatório." });
    }

    const result = await markDepositAsSent(receiptDonationId);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

