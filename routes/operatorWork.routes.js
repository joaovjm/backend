import { Router } from "express";
import {
  operatorWorkSummaryController,
  operatorWorkDonationsController,
} from "../controllers/operatorWork.controller.js";

const router = Router();

router.get("/summary", operatorWorkSummaryController);
router.get("/donations", operatorWorkDonationsController);

export default router;

