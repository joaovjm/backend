import { Router } from "express";
import {
  getCreateMensalDonationController,
  postCreateMensalDonationController,
} from "../controllers/createMensalDonation.controller.js";

const router = Router();

// GET /api/createmensaldonation
router.get("/", getCreateMensalDonationController);

// POST /api/createmensaldonation
router.post("/", postCreateMensalDonationController);

export default router;

