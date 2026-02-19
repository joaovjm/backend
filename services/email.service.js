import nodemailer from "nodemailer";

export async function sendEmail(data) {
  const { emailTo, subject, text, image, video, pdf } = data;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("EMAIL_USER ou EMAIL_PASS não definidos");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const attachments = [];
  let textContent = text || "";
  const imageId = "embedded-image";

  if (image?.content) {
    if (textContent.includes("[IMAGEM]")) {
      textContent = textContent.replace(
        "[IMAGEM]",
        `<img src="cid:${imageId}" style="max-width:600px;" />`
      );
    }

    attachments.push({
      filename: image.filename,
      content: image.content,
      encoding: "base64",
      contentType: image.contentType || "image/jpeg",
      cid: imageId,
    });
  }

  if (video?.content) {
    attachments.push({
      filename: video.filename,
      content: video.content,
      encoding: "base64",
      contentType: video.contentType || "video/mp4",
    });
  }

  if (pdf?.content) {
    attachments.push({
      filename: pdf.filename,
      content: pdf.content,
      encoding: "base64",
      contentType: pdf.contentType || "application/pdf",
    });
  }

  const mailOptions = {
    from: `"Centro Geriátrico Manancial" <${process.env.EMAIL_USER}>`,
    to: emailTo,
    subject,
    text,
    html: `<div style="white-space: pre-wrap;">${textContent}</div>`,
    attachments,
  };

  await transporter.sendMail(mailOptions);
}
