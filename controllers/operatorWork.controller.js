import {
  getOperatorWorkSummary,
  getCollectorWorkSummary,
  getOperatorWorkDonations,
} from "../services/operatorWork.service.js";

export async function operatorWorkSummaryController(req, res, next) {
  try {
    const { startDate, endDate, type } = req.query;
    const entityType = type === "collector" ? "collector" : "operator";

    const data =
      entityType === "collector"
        ? await getCollectorWorkSummary({ startDate, endDate })
        : await getOperatorWorkSummary({ startDate, endDate });

    res.json(data);
  } catch (error) {
    next(error);
  }
}

export async function operatorWorkDonationsController(req, res, next) {
  try {
    const { startDate, endDate, entityType, entityId, statusFilter } = req.query;

    const normalizedType =
      entityType === "collector" ? "collector" : "operator";

    const donations = await getOperatorWorkDonations({
      startDate: startDate || null,
      endDate: endDate || null,
      entityType: normalizedType,
      entityId: entityId ? Number(entityId) : null,
      statusFilter: statusFilter ?? null,
    });

    res.json({ donations });
  } catch (error) {
    next(error);
  }
}

