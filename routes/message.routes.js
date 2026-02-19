import { Router } from "express";
import { markMessagesAsRead } from "../controllers/message.controller.js";

const router = Router();

router.post("/mark-as-read", markMessagesAsRead);

export default router;
