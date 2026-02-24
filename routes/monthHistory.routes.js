import { Router } from "express";
import { getMonthHistoryController } from "../controllers/monthHistory.controller.js";

const router = Router();

router.get("/", getMonthHistoryController);

export default router;

