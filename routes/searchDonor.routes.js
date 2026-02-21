import { Router } from "express";
import { searchDonorController } from "../controllers/searchDonor.controller.js";

const router = Router();

router.get("/", searchDonorController);

export default router;
