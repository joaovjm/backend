import { Router } from "express";
import {
  getLeadsDashboardController,
  getLeadByIdController,
  updateLeadStatusController,
  scheduleLeadController,
  updateLeadController,
  convertLeadToDonationController,
  getLeadsHistoryController,
} from "../controllers/leads.controller.js";

const router = Router();

router.get("/dashboard", getLeadsDashboardController);
router.get("/history", getLeadsHistoryController);
router.get("/:leadId", getLeadByIdController);
router.patch("/:leadId/status", updateLeadStatusController);
router.patch("/:leadId/schedule", scheduleLeadController);
router.patch("/:leadId", updateLeadController);
router.post("/:leadId/convert-to-donation", convertLeadToDonationController);

export default router;
