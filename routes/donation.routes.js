import { Router } from "express";
import {
  getCampaigns,
  getReceiptConfig,
  insertDonation,
  deleteDonation,
  getAllReceivedDonations,
  updateDonation,
} from "../controllers/donation.controller.js";

const router = Router();

router.get("/campaigns", getCampaigns);
router.get("/receipt-config", getReceiptConfig);
router.post("/insert-donation", insertDonation);
router.delete("/delete-donation/:id", deleteDonation);
router.get("/get-all-received-donations", getAllReceivedDonations);
router.patch("/update-donation/:id", updateDonation);

export default router;