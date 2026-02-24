import { Router } from "express";

import messageRoutes from "./message.routes.js";
import emailRoutes from "./email.routes.js";
import depositPdfRoutes from "./depositPdf.routes.js";
import donationRoutes from "./donation.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import searchDonorRoutes from "./searchDonor.routes.js";
import donorRoutes from "./donor.routes.js";
import worklistRoutes from "./worklist.routes.js";
import leadsRoutes from "./leads.routes.js";
import operatorReportRoutes from "./operatorReport.routes.js";
import tasksRoutes from "./tasks.routes.js";

const router = Router();

router.use("/email", emailRoutes);
router.use("/message", messageRoutes);
router.use("/deposit-pdf", depositPdfRoutes);
router.use("/donation", donationRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/searchdonor", searchDonorRoutes);
router.use("/donor", donorRoutes);
router.use("/worklist", worklistRoutes);
router.use("/leads", leadsRoutes);
router.use("/operator-report", operatorReportRoutes);
router.use("/tasks", tasksRoutes);

export default router;