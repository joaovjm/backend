import pool from "../db/db.js";

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
      const requestResult = await pool.query(
        `SELECT id, request_name FROM request
         WHERE donor_id = $1 AND request_active = 'True'
         LIMIT 1`,
        [donationData.donor_id]
      );
      const requestRow = requestResult.rows[0];
      if (requestRow) {
        request_name_searched = requestRow.request_name;
        requestId = requestRow.id;
      }
    }

    // Verifica se existem algum agendamento para esta doação
    const scheduledResult = await pool.query(
      `SELECT scheduled_id FROM scheduled
       WHERE entity_id = $1 AND entity_type = 'doação'
       LIMIT 1`,
      [donationData.donor_id]
    );
    const scheduledRow = scheduledResult.rows[0];
    if (scheduledRow) {
      scheduledId = scheduledRow.scheduled_id;
    }

    // Inserir a doação
    const insertQuery = `
      INSERT INTO donation (
        donor_id,
        donation_value,
        donation_extra,
        donation_day_to_receive,
        donation_monthref,
        operator_code_id,
        donation_campain,
        donation_description,
        donation_print,
        donation_received,
        collector_code_id,
        donation_worklist
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    const insertValues = [
      donationData.donor_id,
      donationData.donation_value ?? null,
      donationData.donation_extra ?? null,
      donationData.donation_day_to_receive ?? null,
      donationData.donation_monthref ?? null,
      donationData.operator_code_id ?? null,
      donationData.donation_campain ?? null,
      donationData.donation_description ?? null,
      donationData.donation_print ?? "Não",
      donationData.donation_received ?? "Não",
      donationData.collector_code_id ?? null,
      donationData.donation_worklist ?? null,
    ];

    const insertResult = await pool.query(insertQuery, insertValues);
    const data = insertResult.rows;

    if (data.length > 0) {
      // Atualizar quaisquer doações agendadas deste doador para "Concluído"
      try {
        await pool.query(
          `UPDATE donation SET confirmation_status = 'Concluído'
           WHERE donor_id = $1 AND confirmation_status = 'Agendado'`,
          [donationData.donor_id]
        );
      } catch (updateScheduledDonationsError) {
        console.log(
          "Erro ao atualizar status de doações agendadas para concluído",
          updateScheduledDonationsError.message
        );
      }

      // Exclui o agendamento se existir
      if (scheduledId) {
        try {
          await pool.query(
            "DELETE FROM scheduled WHERE scheduled_id = $1",
            [scheduledId]
          );
        } catch (deleteScheduledError) {
          console.log(
            "Erro ao excluir agendamento",
            deleteScheduledError.message
          );
        }
      }

      // Se encontrou um request ativo, atualizar o status para "Sucesso"
      if (requestId) {
        try {
          await pool.query(
            "UPDATE request SET request_status = 'Sucesso' WHERE id = $1",
            [requestId]
          );
        } catch (updateError) {
          console.log(
            "Erro ao atualizar status do request",
            updateError.message
          );
        }
      }

      return data;
    }

    return data;
  } catch (error) {
    console.log("Erro ao criar doação", error.message);
    throw error;
  }
}

export async function remove(donationId) {
  try {
    await pool.query(
      "DELETE FROM donation WHERE receipt_donation_id = $1",
      [donationId]
    );
  } catch (error) {
    console.log("Erro ao deletar doação", error.message);
    throw error;
  }
}

/**
 * Retorna todos os dados necessários para o ModalEditDonation em uma única camada.
 * Uma única chamada HTTP no frontend.
 */
export async function getEditDonationData(donorId, receiptDonationId) {
  const donorIdNum = Number(donorId);
  const receiptIdNum = Number(receiptDonationId);
  if (!donorIdNum || !receiptIdNum) {
    return {
      campaigns: [],
      operators: [],
      collectors: [],
      receiptConfig: null,
      request: [],
      donorConfirmationReason: "",
    };
  }

  try {
    const [
      campaignsResult,
      operatorsResult,
      collectorsResult,
      receiptConfigResult,
      requestResult,
      reasonResult,
    ] = await Promise.all([
      pool.query(
        `SELECT id, campain_name FROM campain WHERE active = true ORDER BY campain_name`
      ),
      pool.query(
        `SELECT operator_code_id, operator_name FROM operator WHERE operator_active = true ORDER BY operator_name`
      ),
      pool.query(
        `SELECT collector_code_id, collector_name FROM collector WHERE collector_name IS DISTINCT FROM '???' ORDER BY collector_name`
      ),
      pool.query(`SELECT * FROM receipt_config LIMIT 1`),
      pool.query(
        `SELECT r.*, op.operator_name AS operator_name
         FROM request r
         LEFT JOIN operator op ON op.operator_code_id = r.operator_code_id
         WHERE r.donor_id = $1 AND r.request_active = 'True'
         ORDER BY r.request_start_date DESC
         LIMIT 1`,
        [donorIdNum]
      ),
      pool.query(
        `SELECT donor_confirmation_reason FROM donor_confirmation_reason WHERE receipt_donation_id = $1 LIMIT 1`,
        [receiptIdNum]
      ),
    ]);

    const requestRows = requestResult.rows || [];
    const request = requestRows.map((r) => ({
      ...r,
      operator: r.operator_code_id
        ? { operator_name: r.operator_name }
        : null,
    }));

    return {
      campaigns: campaignsResult.rows || [],
      operators: operatorsResult.rows || [],
      collectors: collectorsResult.rows || [],
      receiptConfig: receiptConfigResult.rows?.[0] ?? null,
      request,
      donorConfirmationReason:
        reasonResult.rows?.[0]?.donor_confirmation_reason ?? "",
    };
  } catch (error) {
    throw error;
  }
}

function toNullIfEmpty(v) {
  if (v === "" || v === undefined || v === null) return null;
  return v;
}

/**
 * Atualiza uma doação por receipt_donation_id.
 * Strings vazias em campos date são convertidas para null (Postgres não aceita "" em tipo date).
 */
export async function update(receiptDonationId, payload) {
  const id = Number(receiptDonationId);
  if (!id) throw new Error("receipt_donation_id inválido");

  const {
    donation_value,
    donation_extra,
    donation_day_to_receive,
    donation_day_received,
    donation_description,
    operator_code_id,
    donation_print,
    donation_received,
    donation_monthref,
    collector_code_id,
    donation_campain,
  } = payload;

  const query = `
    UPDATE donation SET
      donation_value = COALESCE($2, donation_value),
      donation_extra = COALESCE($3, donation_extra),
      donation_day_to_receive = COALESCE($4, donation_day_to_receive),
      donation_day_received = COALESCE($5, donation_day_received),
      donation_description = COALESCE($6, donation_description),
      operator_code_id = COALESCE($7, operator_code_id),
      donation_print = COALESCE($8, donation_print),
      donation_received = COALESCE($9, donation_received),
      donation_monthref = COALESCE($10, donation_monthref),
      collector_code_id = COALESCE($11, collector_code_id),
      donation_campain = COALESCE($12, donation_campain)
    WHERE receipt_donation_id = $1
    RETURNING *
  `;
  const values = [
    id,
    donation_value ?? null,
    donation_extra ?? null,
    toNullIfEmpty(donation_day_to_receive),
    toNullIfEmpty(donation_day_received),
    toNullIfEmpty(donation_description),
    operator_code_id ?? null,
    donation_print ?? "Não",
    donation_received ?? "Não",
    toNullIfEmpty(donation_monthref),
    collector_code_id ?? null,
    toNullIfEmpty(donation_campain),
  ];
  const result = await pool.query(query, values);
  if (result.rows.length === 0) {
    throw new Error("Doação não encontrada");
  }
  return result.rows[0];
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
