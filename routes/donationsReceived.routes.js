import { Router } from "express";
import { donationsReceivedController } from "../controllers/donationsReceived.controller.js";

const router = Router();

router.get("/", donationsReceivedController);

export default router;

