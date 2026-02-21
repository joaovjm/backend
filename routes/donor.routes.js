import { Router } from "express";
import {
  getDonorByIdController,
  listDonorsController,
  getDonationsController,
  getRequestController,
  createDonorController,
  updateDonorController,
  mergeDonorsController,
  getDonorsByIdsController,
  logDonorActivityController,
  getDonorActivityController,
} from "../controllers/donor.controller.js";

const router = Router();

router.get("/", listDonorsController);
router.post("/", createDonorController);
router.post("/merge", mergeDonorsController);
router.post("/activity", logDonorActivityController);
router.get("/by-ids", getDonorsByIdsController);

router.get("/:id", getDonorByIdController);
router.get("/:id/donations", getDonationsController);
router.get("/:id/request", getRequestController);
router.get("/:id/activity", getDonorActivityController);
router.put("/:id", updateDonorController);

export default router;
