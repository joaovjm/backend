import { Router } from "express";
import {
  getWorklistController,
  getWorklistRequestByIdController,
  getWorklistModalDetailController,
  updateRequestAccessController,
  updateRequestStatusController,
  updateRequestScheduleController,
  registerOperatorActivityController,
} from "../controllers/worklist.controller.js";

const router = Router();

router.get("/", getWorklistController);
router.get("/modal-detail", getWorklistModalDetailController);
router.get("/request/:requestId", getWorklistRequestByIdController);
router.patch("/access/:requestId", updateRequestAccessController);
router.patch("/request/:requestId/status", updateRequestStatusController);
router.patch("/request/:requestId/schedule", updateRequestScheduleController);
router.post("/activity", registerOperatorActivityController);

export default router;
