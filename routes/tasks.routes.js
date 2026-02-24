import { Router } from "express";
import {
  getTasksController,
  getTaskDetailsController,
  createTaskController,
  updateTaskStatusController,
  concludeTaskController,
} from "../controllers/tasks.controller.js";

const router = Router();

router.get("/", getTasksController);
router.post("/", createTaskController);
router.get("/:id/details", getTaskDetailsController);
router.patch("/:id/status", updateTaskStatusController);
router.patch("/:id/conclude", concludeTaskController);

export default router;
