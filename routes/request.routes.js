import { Router } from "express";
import {
  getRequestController,
  getRequestByIdController,
  getPackageController,
  createRequestController,
  updateRequestController,
  updateRequestActiveController,
  deleteRequestController,
} from "../controllers/request.controller.js";

const router = Router();

router.get("/", getRequestController);
router.post("/package", getPackageController);
router.get("/:id", getRequestByIdController);
router.post("/", createRequestController);
router.patch("/:id/active", updateRequestActiveController);
router.patch("/:id", updateRequestController);
router.delete("/:id", deleteRequestController);

export default router;
