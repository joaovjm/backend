import { Router } from "express";
import { insertDonation, deleteDonation, getAllReceivedDonations } from "../controllers/donation.controller.js";

const router = Router();

router.post("/insert-donation", insertDonation);
router.delete("/delete-donation/:id", deleteDonation);
router.get("/get-all-received-donations", getAllReceivedDonations);


export default router;