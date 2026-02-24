import { Router } from "express";
import {
  getTaskDevelopmentController,
  createTaskDevelopmentController,
  updateTaskDevelopmentStatusController,
  deleteTaskDevelopmentController,
  taskDevelopmentStreamController,
} from "../controllers/taskDevelopment.controller.js";

const router = Router();

router.get("/", getTaskDevelopmentController);
router.post("/", createTaskDevelopmentController);
router.patch("/:id/status", updateTaskDevelopmentStatusController);
router.delete("/:id", deleteTaskDevelopmentController);
router.get("/stream", taskDevelopmentStreamController);

export default router;

