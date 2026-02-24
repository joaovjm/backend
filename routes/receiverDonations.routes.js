import { Router } from "express";
import {
  getReceiverDonationsController,
  receiveDonationController,
  markDepositAsSentController,
} from "../controllers/receiverDonations.controller.js";

const router = Router();

router.get("/", getReceiverDonationsController);
router.post("/receive", receiveDonationController);
router.post(
  "/deposits/:receiptDonationId/mark-sent",
  markDepositAsSentController,
);

export default router;

