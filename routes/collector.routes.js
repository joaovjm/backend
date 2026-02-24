import { Router } from "express";
import {
  listCollectorsController,
  changeDonationCollectorController,
} from "../controllers/collector.controller.js";

const router = Router();

router.get("/", listCollectorsController);
router.post("/change-donation-collector", changeDonationCollectorController);

export default router;

