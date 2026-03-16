import { Router } from "express";

import {
  dashboardController,
  dashboardActivitiesController,
  dashboardDonorMonthlyEvolutionController,
  dashboardOperatorScheduledController,
  getEditDonationDataController,
} from "../controllers/dashboard.controller.js";

const router = Router();

router.get("/", dashboardController);
router.get("/activities", dashboardActivitiesController);
router.get(
  "/donor-monthly-evolution",
  dashboardDonorMonthlyEvolutionController,
);
router.get(
  "/operators/:operatorId/scheduled",
  dashboardOperatorScheduledController,
);
router.get("/edit-donation-data", getEditDonationDataController);

export default router;
