import { Router } from "express";

import messageRoutes from "./message.routes.js";
import emailRoutes from "./email.routes.js";
import depositPdfRoutes from "./depositPdf.routes.js";
import donationRoutes from "./donation.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import searchDonorRoutes from "./searchDonor.routes.js";
import donorRoutes from "./donor.routes.js";
import collectorRoutes from "./collector.routes.js";
import worklistRoutes from "./worklist.routes.js";
import leadsRoutes from "./leads.routes.js";
import operatorReportRoutes from "./operatorReport.routes.js";
import tasksRoutes from "./tasks.routes.js";
import donationsReceivedRoutes from "./donationsReceived.routes.js";
import operatorWorkRoutes from "./operatorWork.routes.js";
import monthHistoryRoutes from "./monthHistory.routes.js";
import receiverDonationsRoutes from "./receiverDonations.routes.js";
import checkPrintRoutes from "./checkPrint.routes.js";
import createMensalDonationRoutes from "./createMensalDonation.routes.js";
import taskDevelopmentRoutes from "./taskDevelopment.routes.js";

const router = Router();

router.use("/email", emailRoutes);
router.use("/message", messageRoutes);
router.use("/deposit-pdf", depositPdfRoutes);
router.use("/donation", donationRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/searchdonor", searchDonorRoutes);
router.use("/donor", donorRoutes);
router.use("/collector", collectorRoutes);
router.use("/worklist", worklistRoutes);
router.use("/leads", leadsRoutes);
router.use("/operator-report", operatorReportRoutes);
router.use("/tasks", tasksRoutes);
router.use("/donationsreceived", donationsReceivedRoutes);
router.use("/operator-work", operatorWorkRoutes);
router.use("/monthhistory", monthHistoryRoutes);
router.use("/receiverdonations", receiverDonationsRoutes);
router.use("/check-print", checkPrintRoutes);
router.use("/createmensaldonation", createMensalDonationRoutes);
router.use("/taskdevelopment", taskDevelopmentRoutes);

export default router;