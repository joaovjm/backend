import { Router } from "express";
import { getDonationsForPrintController } from "../controllers/checkPrint.controller.js";

const router = Router();

router.get("/donations", getDonationsForPrintController);

export default router;
