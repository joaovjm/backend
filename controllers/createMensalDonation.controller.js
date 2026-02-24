import {
  getCreateMensalDonationData,
  generateMensalDonations,
} from "../services/createMensalDonation.service.js";

export async function getCreateMensalDonationController(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const data = await getCreateMensalDonationData({ startDate, endDate });
    res.json(data);
  } catch (error) {
    next(error);
  }
}

export async function postCreateMensalDonationController(req, res, next) {
  try {
    const { mesRef, campain, operatorId, collectorId } = req.body || {};

    const result = await generateMensalDonations({
      mesRef,
      campain,
      operatorId,
      collectorId,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

