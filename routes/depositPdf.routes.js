import { Router } from "express";
import { generate } from "../controllers/depositPdf.controller.js";

const router = Router();

router.post("/generate", generate);

export default router;