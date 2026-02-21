import { generateDepositPDF } from "../services/depositPdf.service.js";

export async function generate(req, res, next) {
  try {

    const { data, config, cpf_visible } = req.body;

    const pdfBuffer = await generateDepositPDF({
      data,
      config,
      cpf_visible: cpf_visible || false,
    });

    const donorName = (data.donor_name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

    const filename = `${data.receipt_donation_id} - ${donorName}.pdf`;

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,

    });

    res.status(200).send(pdfBuffer);

  } catch (err) {
    console.error("❌ ERRO NO CONTROLLER:", err);
    next(err);
  }
}
