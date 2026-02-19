import { Router } from "express";

import messageRoutes from "./message.routes.js";
import emailRoutes from "./email.routes.js";
import depositPdfRoutes from "./depositPdf.routes.js";

const router = Router();

router.use("/email", emailRoutes);
router.use("/message", messageRoutes);
router.use("/deposit-pdf", depositPdfRoutes);

export default router;