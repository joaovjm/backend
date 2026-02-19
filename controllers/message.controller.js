import * as messageService from "../services/message.service.js";

export async function markMessagesAsRead(req, res, next) {
  try {
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({
        error: "conversationId é obrigatório",
      });
    }

    const data = await messageService.markAsRead(conversationId);

    return res.status(200).json({
      success: true,
      updatedCount: data?.length || 0,
      messages: data,
    });

  } catch (error) {
    next(error);
  }
}
