import pool from "../db/db.js";

const DONOR_TYPES_ACTIVE = ["Avulso", "Mensal", "Lista"];
const VALID_DONOR_TYPES = ["Avulso", "Mensal", "Lista", "Excluso"];

function isLeadSearch(donorType) {
  const t = (donorType || "").trim();
  return t === "Lead" || t === "Leads";
}

/** paramIndex: índice do placeholder ($1, $2, ...) para os valores do filtro. */
function buildDonorTypeFilter(donorType, prefix = "d", paramIndex = 2) {
  const t = (donorType || "").trim();
  if (t === "Todos" || !t) return { sql: `${prefix}.donor_type = ANY($${paramIndex})`, values: [DONOR_TYPES_ACTIVE] };
  if (VALID_DONOR_TYPES.includes(t)) return { sql: `${prefix}.donor_type = $${paramIndex}`, values: [t] };
  return null;
}

/**
 * Busca por número de recibo (ex: R123).
 * Retorna o doador da doação com receipt_donation_id = número.
 */
async function searchByReceipt(receiptNumber, donorType) {
  if (isLeadSearch(donorType)) return [];

  const typeFilter = buildDonorTypeFilter(donorType, "donor", 2);

  const typeCondition = typeFilter ? `AND ${typeFilter.sql}` : "";

  const values = [receiptNumber, ...(typeFilter ? typeFilter.values : [])];
  const query = `
    SELECT
      donor.donor_id,
      donor.donor_name,
      donor.donor_address,
      donor.donor_tel_1,
      donor.donor_neighborhood,
      donor.donor_type
    FROM donation d
    INNER JOIN donor ON donor.donor_id = d.donor_id
    WHERE d.receipt_donation_id = $1
    ${typeCondition}
  `;

  const result = await pool.query(query, values);

  const row = result.rows[0];
  return row ? [row] : [];
}

/**
 * Busca por CPF/CNPJ (termo começa com xx + números).
 */
async function searchByCpf(cpfSearch, donorType) {
  const pattern = `%${cpfSearch}%`;

  if (isLeadSearch(donorType)) {
    
    const query = `
      SELECT
        l.leads_id AS donor_id,
        l.leads_name AS donor_name,
        l.leads_address AS donor_address,
        l.leads_tel_1 AS donor_tel_1,
        l.leads_neighborhood AS donor_neighborhood,
        'Lead' AS donor_type,
        l.leads_icpf AS donor_cpf,
        l.leads_value AS leads_value,
        l.operator_code_id AS operator_code_id,
        op.operator_name AS operator_name
      FROM leads l
      LEFT JOIN operator op ON op.operator_code_id = l.operator_code_id
      WHERE l.leads_icpf ILIKE $1
    `;
    const result = await pool.query(query, [pattern]);
    return (result.rows || []).map((r) => ({ ...r, isLead: true }));
  }

  const typeFilter = buildDonorTypeFilter(donorType, "d", 2);
  const typeCondition = typeFilter ? `AND ${typeFilter.sql}` : "";
  const values = [pattern, ...(typeFilter ? typeFilter.values : [])];

  const query = `
    SELECT
      d.donor_id,
      d.donor_name,
      d.donor_address,
      d.donor_tel_1,
      d.donor_neighborhood,
      d.donor_type
    FROM donor d
    INNER JOIN donor_cpf dc ON dc.donor_id = d.donor_id
    WHERE dc.donor_cpf ILIKE $1
    ${typeCondition}
  `;

  const result = await pool.query(query, values);
  return result.rows || [];
}

/**
 * Busca por telefone (apenas números, 8–11 dígitos ou parciais).
 * Para donor: tel_1 ou tel_2/tel_3 (tabelas auxiliares).
 */
async function searchByPhone(phoneSearch, donorType) {
  const pattern = `%${phoneSearch}%`;

  if (isLeadSearch(donorType)) {
    const query = `
      SELECT
        l.leads_id AS donor_id,
        l.leads_name AS donor_name,
        l.leads_address AS donor_address,
        l.leads_tel_1 AS donor_tel_1,
        l.leads_neighborhood AS donor_neighborhood,
        'Lead' AS donor_type,
        l.leads_icpf AS donor_cpf,
        l.leads_value AS leads_value,
        l.operator_code_id AS operator_code_id,
        op.operator_name AS operator_name
      FROM leads l
      LEFT JOIN operator op ON op.operator_code_id = l.operator_code_id
      WHERE l.leads_tel_1 ILIKE $1 OR l.leads_tel_2 ILIKE $1
    `;
    const result = await pool.query(query, [pattern]);
    return (result.rows || []).map((r) => ({ ...r, isLead: true }));
  }

  const typeFilter = buildDonorTypeFilter(donorType, "d", 2);
  const typeCondition = typeFilter ? `AND ${typeFilter.sql}` : "";
  const values = [pattern, ...(typeFilter ? typeFilter.values : [])];

  const query = `
    SELECT DISTINCT
      d.donor_id,
      d.donor_name,
      d.donor_address,
      d.donor_tel_1,
      d.donor_neighborhood,
      d.donor_type
    FROM donor d
    LEFT JOIN donor_tel_2 dt2 ON dt2.donor_id = d.donor_id
    LEFT JOIN donor_tel_3 dt3 ON dt3.donor_id = d.donor_id
    WHERE (
      d.donor_tel_1 ILIKE $1
      OR dt2.donor_tel_2 ILIKE $1
      OR dt3.donor_tel_3 ILIKE $1
    )
    ${typeCondition}
  `;

  const result = await pool.query(query, values);
  return result.rows || [];
}

/**
 * Busca por nome.
 */
async function searchByName(nameSearch, donorType) {
  const pattern = `%${nameSearch}%`;

  if (isLeadSearch(donorType)) {
    const query = `
      SELECT
        l.leads_id AS donor_id,
        l.leads_name AS donor_name,
        l.leads_address AS donor_address,
        l.leads_tel_1 AS donor_tel_1,
        l.leads_neighborhood AS donor_neighborhood,
        'Lead' AS donor_type,
        l.leads_icpf AS donor_cpf,
        l.leads_value AS leads_value,
        l.operator_code_id AS operator_code_id,
        op.operator_name AS operator_name
      FROM leads l
      LEFT JOIN operator op ON op.operator_code_id = l.operator_code_id
      WHERE l.leads_name ILIKE $1
    `;
    const result = await pool.query(query, [pattern]);
    return (result.rows || []).map((r) => ({ ...r, isLead: true }));
  }

  const typeFilter = buildDonorTypeFilter(donorType, "d", 2);
  const typeCondition = typeFilter ? `AND ${typeFilter.sql}` : "";
  const values = [pattern, ...(typeFilter ? typeFilter.values : [])];

  const query = `
    SELECT
      d.donor_id,
      d.donor_name,
      d.donor_address,
      d.donor_tel_1,
      d.donor_neighborhood,
      d.donor_type
    FROM donor d
    WHERE d.donor_name ILIKE $1
    ${typeCondition}
  `;

  const result = await pool.query(query, values);
  return result.rows || [];
}

/**
 * Determina o tipo de busca e delega para a função correta.
 * searchTerm: string digitada pelo usuário.
 * donorType: "Todos" | "Avulso" | "Mensal" | "Lista" | "Leads" | "Excluso".
 */
export async function searchDonor(searchTerm, donorType) {
  const trimmed = (searchTerm || "").trim();
  const cleanParam = trimmed.replace(/\D/g, "");


  if (!trimmed) return [];

  if (/^r\d+$/i.test(trimmed)) {

    const receiptNumber = Number(cleanParam);
    return searchByReceipt(receiptNumber, donorType);
  }

  if (/^xx/i.test(trimmed)) {
    const cpfSearch = trimmed.substring(2).replace(/\D/g, "");
    return searchByCpf(cpfSearch, donorType);
  }

  const isOnlyDigits = /^\d+$/.test(cleanParam);
  const noSpecialChars = !trimmed.includes(".") && !trimmed.includes("-") && !trimmed.includes("/");
  const isPhone = isOnlyDigits && noSpecialChars && (cleanParam.length >= 8 && cleanParam.length <= 11);
  const isPhonePartial = isOnlyDigits && noSpecialChars && cleanParam.length < 8;

  if (isPhone || isPhonePartial) {
    return searchByPhone(cleanParam, donorType);
  }

  return searchByName(trimmed, donorType);
}
