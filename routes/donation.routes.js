import { Router } from "express";
import { insertDonation, deleteDonation } from "../controllers/donation.controller.js";

const router = Router();

router.post("/insert-donation", insertDonation);
router.delete("/delete-donation/:id", deleteDonation);

export default router;