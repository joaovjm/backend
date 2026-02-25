import { Router } from "express";
import { getLoadLeadsController, postImportLeadsController } from "../controllers/loadLeads.controller.js";

const router = Router();

router.get("/", getLoadLeadsController);
router.post("/", postImportLeadsController);

export default router;
