import { generateDepositPDF } from "../services/depositPdf.service.js";

export async function generate(req, res, next) {
  try {
    console.log("➡️  [1] Request recebida");

    const { data, config, cpf_visible } = req.body;

    console.log("➡️  [2] Iniciando geração do PDF...");

    const pdfBuffer = await generateDepositPDF({
      data,
      config,
      cpf_visible: cpf_visible || false,
    });

    console.log("✅ [3] PDF gerado. Tamanho:", pdfBuffer.length);

    const donorName = (data.donor_name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

    const filename = `${data.receipt_donation_id} - ${donorName}.pdf`;

    console.log("➡️  [4] Enviando headers...");

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // 👇 REMOVA temporariamente o Content-Length para teste
      // "Content-Length": pdfBuffer.length,
    });

    console.log("➡️  [5] Enviando resposta...");

    res.status(200).send(pdfBuffer);

    console.log("✅ [6] Resposta finalizada");

  } catch (err) {
    console.error("❌ ERRO NO CONTROLLER:", err);
    next(err);
  }
}
