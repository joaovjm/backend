import { Router } from "express";

import messageRoutes from "./message.routes.js";
import emailRoutes from "./email.routes.js";
import depositPdfRoutes from "./depositPdf.routes.js";
import donationRoutes from "./donation.routes.js";
import dashboardRoutes from "./dashboard.routes.js";

const router = Router();

router.use("/email", emailRoutes);
router.use("/message", messageRoutes);
router.use("/deposit-pdf", depositPdfRoutes);
router.use("/donation", donationRoutes);
router.use("/dashboard", dashboardRoutes);

export default router;