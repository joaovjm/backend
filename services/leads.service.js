import pool from "../db/db.js";
import { createDonor } from "./donor.service.js";

const ACTIVITY_TYPES = {
  LEAD_NOT_ANSWERED: "lead_not_answered",
  LEAD_CANNOT_HELP: "lead_cannot_help",
  LEAD_SCHEDULED: "lead_scheduled",
  LEAD_SUCCESS: "lead_success",
};

function nowIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000Z`;
}

/**
 * Dashboard Leads: total, lead da página e bairros em consultas otimizadas.
 * Filtro: (leads_status = 'Nunca Ligado') OR (leads_status = 'Aberto' AND operator_code_id = $1).
 * Ordenação: por padrão leads_id ASC; se neighborhood = 'AACRECHE' então date_received DESC.
 * Ao retornar um lead na posição solicitada, marca como "Aberto" e operator_code_id.
 */
export async function getLeadsDashboard(operatorId, page = 1, neighborhood = "") {
  const opId = Number(operatorId);
  if (!opId) {
    return { totalCount: 0, currentLead: null, availableNeighborhoods: [] };
  }

  const offset = Math.max(0, (page - 1) * 1);
  const hasNeighborhood = neighborhood && String(neighborhood).trim() !== "";
  const orderByAacreche = hasNeighborhood && String(neighborhood).trim() === "AACRECHE";
  const orderBy = orderByAacreche ? "date_received" : "leads_id";
  const orderDir = orderByAacreche ? "DESC" : "ASC";

  const countParams = hasNeighborhood ? [opId, String(neighborhood).trim()] : [opId];
  const countWhere = hasNeighborhood
    ? "(l.leads_status = 'Nunca Ligado' OR (l.leads_status = 'Aberto' AND l.operator_code_id = $1)) AND l.leads_neighborhood = $2"
    : "(l.leads_status = 'Nunca Ligado' OR (l.leads_status = 'Aberto' AND l.operator_code_id = $1))";
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM leads l WHERE ${countWhere}`,
    countParams
  );
  const totalCount = countResult.rows[0]?.total ?? 0;

  const listParams = hasNeighborhood ? [opId, offset, 1, String(neighborhood).trim()] : [opId, offset, 1];
  const listWhere = hasNeighborhood
    ? "(l.leads_status = 'Nunca Ligado' OR (l.leads_status = 'Aberto' AND l.operator_code_id = $1)) AND l.leads_neighborhood = $4"
    : "(l.leads_status = 'Nunca Ligado' OR (l.leads_status = 'Aberto' AND l.operator_code_id = $1))";
  const listResult = await pool.query(
    `SELECT l.* FROM leads l WHERE ${listWhere} ORDER BY l.${orderBy} ${orderDir} OFFSET $2 LIMIT $3`,
    listParams
  );
  let currentLead = listResult.rows[0] ?? null;

  const neighborhoodsResult = await pool.query(
    `SELECT DISTINCT leads_neighborhood AS neighborhood
     FROM leads
     WHERE leads_neighborhood IS NOT NULL AND TRIM(leads_neighborhood) <> ''
       AND (leads_status = 'Nunca Ligado' OR (leads_status = 'Aberto' AND operator_code_id = $1))
     ORDER BY 1`,
    [opId]
  );
  const availableNeighborhoods = (neighborhoodsResult.rows || [])
    .map((r) => r.neighborhood)
    .filter(Boolean);

  if (currentLead && currentLead.leads_id) {
    await pool.query(
      `UPDATE leads SET leads_date_accessed = $1, leads_status = 'Aberto', operator_code_id = $2 WHERE leads_id = $3`,
      [nowIso(), opId, currentLead.leads_id]
    );
    currentLead = {
      ...currentLead,
      leads_status: "Aberto",
      operator_code_id: opId,
      leads_date_accessed: nowIso(),
    };
  }

  return {
    totalCount,
    currentLead,
    availableNeighborhoods,
  };
}

/**
 * Lead por ID (para edição no modal).
 */
export async function getLeadById(leadId) {
  const id = Number(leadId);
  if (!id) return null;
  const { rows } = await pool.query(
    "SELECT * FROM leads WHERE leads_id = $1 LIMIT 1",
    [id]
  );
  return rows[0] ?? null;
}

/**
 * Atualiza status do lead e registra atividade.
 */
export async function updateLeadStatus(leadId, status, operatorId, operatorName, donorName) {
  const id = Number(leadId);
  const opId = Number(operatorId);
  if (!id) throw new Error("lead_id inválido");

  const now = nowIso();
  await pool.query(
    `UPDATE leads
     SET leads_date_accessed = $1, leads_status = $2, operator_code_id = $3
     WHERE leads_id = $4`,
    [now, status, opId, id]
  );

  const activityType =
    status === "Não Atendeu"
      ? ACTIVITY_TYPES.LEAD_NOT_ANSWERED
      : status === "Não pode ajudar"
        ? ACTIVITY_TYPES.LEAD_CANNOT_HELP
        : null;
  if (activityType) {
    await pool.query(
      `INSERT INTO operator_activity (
         operator_code_id, operator_name, activity_type, donor_name, metadata, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [opId, operatorName || null, activityType, donorName || null, JSON.stringify({ leadId: id, source: "leads" }), new Date().toISOString()]
    );
  }

  const { rows } = await pool.query("SELECT * FROM leads WHERE leads_id = $1", [id]);
  return rows[0] ?? null;
}

/**
 * Agendar lead: atualiza leads e opcionalmente insere em scheduled; registra atividade.
 */
export async function scheduleLead(leadId, payload, operatorId, operatorName, donorName) {
  const id = Number(leadId);
  const opId = Number(operatorId);
  if (!id) throw new Error("lead_id inválido");

  const now = nowIso();
  await pool.query(
    `UPDATE leads
     SET leads_date_accessed = $1, leads_scheduling_date = $2, leads_status = 'agendado',
         leads_observation = $3, leads_tel_success = $4
     WHERE leads_id = $5`,
    [
      now,
      payload.dateScheduling || null,
      payload.observationScheduling || null,
      payload.telScheduling || null,
      id,
    ]
  );

  await pool.query(
    `INSERT INTO operator_activity (
       operator_code_id, operator_name, activity_type, donor_name, metadata, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      opId,
      operatorName || null,
      ACTIVITY_TYPES.LEAD_SCHEDULED,
      donorName || null,
      JSON.stringify({ leadId: id, source: "leads", scheduledDate: payload.dateScheduling }),
      new Date().toISOString(),
    ]
  );

  const { rows } = await pool.query("SELECT * FROM leads WHERE leads_id = $1", [id]);
  return rows[0] ?? null;
}

/**
 * Atualizar dados do lead (edição no modal).
 */
export async function updateLead(leadId, payload) {
  const id = Number(leadId);
  if (!id) throw new Error("lead_id inválido");

  if (payload.icpf) {
    const { rows: existing } = await pool.query(
      "SELECT leads_id FROM leads WHERE leads_icpf = $1 AND leads_id <> $2 LIMIT 1",
      [String(payload.icpf).replace(/[.-]/g, ""), id]
    );
    if (existing.length > 0) {
      const err = new Error("Este CPF/CNPJ já está cadastrado em outro lead!");
      err.code = "DUPLICATE_CPF";
      throw err;
    }
  }

  await pool.query(
    `UPDATE leads SET
       leads_name = $1, leads_address = $2, leads_neighborhood = $3, leads_city = $4,
       leads_icpf = $5, leads_tel_1 = $6, leads_tel_2 = $7, leads_tel_3 = $8,
       leads_tel_4 = $9, leads_tel_5 = $10, leads_tel_6 = $11,
       leads_email = $12, leads_observation = $13
     WHERE leads_id = $14`,
    [
      payload.name ?? "",
      payload.address ?? "",
      payload.neighborhood ?? "",
      payload.city ?? "",
      payload.icpf === "" || payload.icpf == null ? null : payload.icpf,
      payload.tel1 ?? "",
      payload.tel2 || null,
      payload.tel3 || null,
      payload.tel4 || null,
      payload.tel5 || null,
      payload.tel6 || null,
      payload.email || null,
      payload.observation || null,
      id,
    ]
  );

  const { rows } = await pool.query("SELECT * FROM leads WHERE leads_id = $1", [id]);
  return rows[0] ?? null;
}

/**
 * Converter lead em doador + doação: criar doador, doação, atualizar lead, scheduled e donation confirmation.
 */
export async function convertLeadToDonation(leadId, formData, operatorId, operatorName, currentLead) {
  const id = Number(leadId);
  const opId = Number(operatorId);
  if (!id || !currentLead) throw new Error("lead_id ou currentLead inválido");

  const donorPayload = {
    nome: currentLead.leads_name,
    tipo: "Lista",
    endereco: formData.address || "",
    cidade: formData.city || "",
    bairro: formData.neighborhood || "",
    telefone1: formData.telSuccess || "",
    cpf: currentLead.leads_icpf || undefined,
    telefone2: formData.newTel2 || undefined,
    telefone3: formData.newTel3 || undefined,
    referencia: formData.reference || undefined,
    observacao: formData.observation || undefined,
  };

  const donor = await createDonor(donorPayload);
  if (!donor || !donor.donor_id) throw new Error("Falha ao criar doador");

  const now = nowIso();
  const donationPayload = {
    donor_id: donor.donor_id,
    operator_code_id: opId,
    donation_value: formData.valueDonation || null,
    donation_day_contact: now,
    donation_day_to_receive: formData.dateDonation || null,
    donation_campain: formData.campain || null,
    donation_description: formData.observation || null,
    donation_print: "Não",
    donation_received: "Não",
    donation_worklist: null,
    collector_code_id: null,
    donation_extra: null,
    donation_monthref: null,
  };

  await pool.query(
    `INSERT INTO donation (
       donor_id, operator_code_id, donation_value, donation_day_contact,
       donation_day_to_receive, donation_campain, donation_description,
       donation_print, donation_received
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      donationPayload.donor_id,
      donationPayload.operator_code_id,
      donationPayload.donation_value,
      donationPayload.donation_day_contact,
      donationPayload.donation_day_to_receive,
      donationPayload.donation_campain,
      donationPayload.donation_description,
      donationPayload.donation_print,
      donationPayload.donation_received,
    ]
  );

  await pool.query(
    `UPDATE donation SET confirmation_status = 'Concluído'
     WHERE donor_id = $1 AND confirmation_status = 'Agendado'`,
    [donor.donor_id]
  );

  await pool.query(
    `UPDATE leads SET leads_status = 'Sucesso' WHERE leads_id = $1`,
    [id]
  );

  if (currentLead.leads_status === "agendado") {
    await pool.query(
      `UPDATE scheduled SET status = 'concluído'
       WHERE entity_type = 'lead' AND entity_id = $1 AND status = 'pendente'`,
      [id]
    );
  }

  await pool.query(
    `INSERT INTO operator_activity (
       operator_code_id, operator_name, activity_type, donor_id, donor_name, metadata, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      opId,
      operatorName || null,
      ACTIVITY_TYPES.LEAD_SUCCESS,
      donor.donor_id,
      currentLead.leads_name,
      JSON.stringify({ leadId: id, source: "leads", donationValue: formData.valueDonation }),
      new Date().toISOString(),
    ]
  );

  return { donor, leadId: id };
}

/**
 * Histórico de leads do operador (para modal).
 */
export async function getLeadsHistory(operatorId) {
  const opId = Number(operatorId);
  if (!opId) return [];

  const { rows } = await pool.query(
    `SELECT * FROM leads
     WHERE operator_code_id = $1
     ORDER BY leads_date_accessed DESC NULLS LAST`,
    [opId]
  );
  return rows || [];
}
