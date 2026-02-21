import { Router } from "express";

import {
  dashboardController,
  getEditDonationDataController,
} from "../controllers/dashboard.controller.js";

const router = Router();

router.get("/", dashboardController);
router.get("/edit-donation-data", getEditDonationDataController);

export default router;
