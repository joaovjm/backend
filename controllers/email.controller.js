import { parseRequest } from "../utils/parseRequest.js";
import { sendEmail } from "../services/email.service.js";

export async function send(req, res, next) {
  try {
    const data = await parseRequest(req);

    if (!data.emailTo || !data.subject) {
      return res.status(400).json({
        error: "emailTo e subject são obrigatórios",
      });
    }

    await sendEmail(data);

    return res.status(200).json({
      success: true,
      message: "Email enviado com sucesso!",
    });
  } catch (err) {
    next(err);
  }
}
