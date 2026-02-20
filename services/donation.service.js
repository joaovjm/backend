import supabase from "../helper/supaBaseClient.js";

export async function insert(donationData) {
    let request_name_searched = "";
    let scheduledId = null;

    try {
        let requestId = null;

        // Verificar se existe um request ativo para este donor_id
        if (donationData.donation_worklist === null || donationData.donation_worklist === undefined || donationData.donation_worklist === "") {
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
        const { data, error } = await supabase.from("donation").insert([donationData]).select();

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
                updateScheduledDonationsError.message
            );
        }

        // Exclui o agendamento se existir
        if (scheduledId) {
            const { error: deleteScheduledError } = await supabase
                .from("scheduled")
                .delete()
                .eq("scheduled_id", scheduledId);

            if (deleteScheduledError) {
                console.log("Erro ao excluir agendamento", deleteScheduledError.message);
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

};

export async function remove(donationId) {
    console.log(typeof donationId);
    try {
        const { error } = await supabase.from("donation").delete().eq("receipt_donation_id", donationId)
        if (error) throw error;
    }catch(error){
        console.log("Erro ao deletar doação", error.message);
        throw error;
    }
}
