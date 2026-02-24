import { Router } from "express";
import { operatorReportController } from "../controllers/operatorReport.controller.js";

const router = Router();

router.get("/", operatorReportController);

export default router;
