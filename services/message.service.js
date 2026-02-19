import supabase from "../helper/supaBaseClient.js";

export async function markAsRead(conversationId) {
  const { data, error } = await supabase
    .from("messages")
    .update({ is_read: true })
    .eq("conversation_id", conversationId)
    .eq("status", "received")
    .select();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
