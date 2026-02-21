import pool from "../db/db.js";
import supabase from "../helper/supaBaseClient.js";

export async function insert(donationData) {
  let request_name_searched = "";
  let scheduledId = null;

  try {
    let requestId = null;

    // Verificar se existe um request ativo para este donor_id
    if (
      donationData.donation_worklist === null ||
      donationData.donation_worklist === undefined ||
      donationData.donation_worklist === ""
    ) {
      const { data: requestData, error: requestError } = await supabase
        .from("request")
        .select("id, request_name")
        .eq("donor_id", donationData.donor_id)
        .eq("request_active", "True")
        .limit(1)
        .single();

      if (!requestError && requestData) {
        request_name_searched = requestData.request_name;
        requestId = requestData.id;
      }
    }

    // Verifica se existem algum agendamento para esta doação
    const { data: scheduledData, error: scheduledError } = await supabase
      .from("scheduled")
      .select("scheduled_id")
      .eq("entity_id", donationData.donor_id)
      .eq("entity_type", "doação")
      .limit(1)
      .single();

    if (!scheduledError && scheduledData) {
      scheduledId = scheduledData.scheduled_id;
    }

    // Inserir a doação
    const { data, error } = await supabase
      .from("donation")
      .insert([donationData])
      .select();

    if (error) throw error;

    // Atualizar quaisquer doações agendadas deste doador para "Concluído"
    const { error: updateScheduledDonationsError } = await supabase
      .from("donation")
      .update({ confirmation_status: "Concluído" })
      .eq("donor_id", donationData.donor_id)
      .eq("confirmation_status", "Agendado");

    if (updateScheduledDonationsError) {
      console.log(
        "Erro ao atualizar status de doações agendadas para concluído",
        updateScheduledDonationsError.message,
      );
    }

    // Exclui o agendamento se existir
    if (scheduledId) {
      const { error: deleteScheduledError } = await supabase
        .from("scheduled")
        .delete()
        .eq("scheduled_id", scheduledId);

      if (deleteScheduledError) {
        console.log(
          "Erro ao excluir agendamento",
          deleteScheduledError.message,
        );
      }
    }

    // Se encontrou um request ativo, atualizar o status para "Sucesso"
    if (requestId) {
      const { error: updateError } = await supabase
        .from("request")
        .update({ request_status: "Sucesso" })
        .eq("id", requestId);

      if (updateError) {
        console.log("Erro ao atualizar status do request", updateError.message);
      }
    }

    if (!error) {
      return data;
    }
  } catch (error) {
    console.log("Erro ao criar doação", error.message);
    throw error;
  }
}

export async function remove(donationId) {

  try {
    const { error } = await supabase
      .from("donation")
      .delete()
      .eq("receipt_donation_id", donationId);
    if (error) throw error;
  } catch (error) {
    console.log("Erro ao deletar doação", error.message);
    throw error;
  }
}

export async function getAllReceived({ startDate, endDate }) {
  let totalValue = 0;

  // Se startDate e endDate foram fornecidos, usar eles. Caso contrário, usar o mês atual
  let dataInicio, dataFim;

  if (startDate && endDate) {
    dataInicio = startDate;
    dataFim = endDate;
  } else if (startDate) {
    // Se apenas startDate foi fornecido, usar até o último dia do mês atual
    dataInicio = startDate;
    const dataAtual = new Date();
    const ano = dataAtual.getFullYear();
    const mes = String(dataAtual.getMonth() + 1).padStart(2, "0");
    const ultimoDia = new Date(ano, dataAtual.getMonth() + 1, 0).getDate();
    dataFim = `${ano}-${mes}-${String(ultimoDia).padStart(2, "0")}`;
  } else if (endDate) {
    // Se apenas endDate foi fornecido, usar desde o primeiro dia do mês atual
    const dataAtual = new Date();
    const ano = dataAtual.getFullYear();
    const mes = String(dataAtual.getMonth() + 1).padStart(2, "0");
    dataInicio = `${ano}-${mes}-01`;
    dataFim = endDate;
  } else {
    // Calcular primeiro e último dia do mês atual
    const dataAtual = new Date();
    const ano = dataAtual.getFullYear();
    const mes = String(dataAtual.getMonth() + 1).padStart(2, "0");
    dataInicio = `${ano}-${mes}-01`;
    const ultimoDia = new Date(ano, dataAtual.getMonth() + 1, 0).getDate();
    dataFim = `${ano}-${mes}-${String(ultimoDia).padStart(2, "0")}`;
  }

  try {
    const query = `
            SELECT
                d.donation_value,
                donor.donor_name,
                d.donation_day_received,
                d.operator_code_id,
                op.operator_name
            FROM donation d
            LEFT JOIN donor 
                ON donor.donor_id = d.donor_id
            LEFT JOIN operator op 
                ON op.operator_code_id = d.operator_code_id
            WHERE d.donation_received = $1
            AND d.donation_day_received >= $2
            AND d.donation_day_received <= $3
            AND d.operator_code_id IS NOT NULL
        `;

    const values = ["Sim", dataInicio, dataFim];

    const result = await pool.query(query, values);

    const donation = result.rows;

    totalValue = donation.reduce(
      (sum, item) => sum + Number(item.donation_value),
      0,
    );

    return {
      totalValue,
      donation,
    };
  } catch (error) {
    console.error("Database error:", error.message);
    throw error;
  }
}
