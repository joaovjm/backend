import pool from "../db/db.js";

/** Tipos de lead disponíveis para importação (fonte única de verdade). */
const LEAD_TYPES = ["Lead Principal", "Lead Casa"];

/**
 * Mapa de cabeçalhos comuns (Excel/UI) para colunas da tabela leads.
 * Aceita chaves em português ou já no formato leads_*.
 */
const HEADER_TO_COLUMN = {
  cpf: "leads_icpf",
  icpf: "leads_icpf",
  leads_icpf: "leads_icpf",
  nome: "leads_name",
  name: "leads_name",
  leads_name: "leads_name",
  endereco: "leads_address",
  endereço: "leads_address",
  address: "leads_address",
  leads_address: "leads_address",
  bairro: "leads_neighborhood",
  neighborhood: "leads_neighborhood",
  leads_neighborhood: "leads_neighborhood",
  cidade: "leads_city",
  city: "leads_city",
  leads_city: "leads_city",
  telefone: "leads_tel_1",
  telefone1: "leads_tel_1",
  tel1: "leads_tel_1",
  leads_tel_1: "leads_tel_1",
  telefone2: "leads_tel_2",
  tel2: "leads_tel_2",
  leads_tel_2: "leads_tel_2",
  telefone3: "leads_tel_3",
  tel3: "leads_tel_3",
  leads_tel_3: "leads_tel_3",
  email: "leads_email",
  leads_email: "leads_email",
  observacao: "leads_observation",
  observação: "leads_observation",
  leads_observation: "leads_observation",
};

function normalizeKey(key) {
  if (key == null) return null;
  const k = String(key).trim().toLowerCase().replace(/\s+/g, "");
  return HEADER_TO_COLUMN[k] || (key.startsWith("leads_") ? key : null);
}

function normalizeCpf(value) {
  if (value == null || value === "") return null;
  return String(value).replace(/[.\s-]/g, "").trim() || null;
}

/**
 * Normaliza um objeto (linha do Excel) para o formato da tabela leads.
 * Retorna null se não houver CPF (obrigatório para conflito).
 */
function normalizeRow(raw) {
  const row = {};
  for (const [header, value] of Object.entries(raw)) {
    const col = normalizeKey(header);
    if (!col) continue;
    let v = value == null ? "" : String(value).trim();
    if (col === "leads_icpf") {
      v = normalizeCpf(value);
      if (!v) return null;
    }
    row[col] = v || null;
  }
  if (!row.leads_icpf) return null;
  return row;
}

/**
 * GET /loadleads — Dados consolidados para a página LoadLeads (uma única chamada).
 * Retorna tipos de lead e qualquer config necessária.
 */
export async function getLoadLeadsConfig() {
  return {
    leadTypes: [...LEAD_TYPES],
  };
}

/**
 * POST /loadleads — Importação em lote: uma única transação, bulk insert com ON CONFLICT DO NOTHING.
 * Requer constraint UNIQUE(leads_icpf) na tabela leads.
 * Evita múltiplas idas ao banco e loops em JS para agregação.
 * @param {Array<Record<string, unknown>>} rows - Linhas do Excel (objetos com cabeçalhos normalizáveis)
 * @param {string} typeLead - "Lead Principal" | "Lead Casa"
 * @returns {{ insertedCount: number, totalCount: number }}
 */
export async function importLeads(rows, typeLead) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Nenhum registro para importar.");
  }

  const normalized = [];
  for (const raw of rows) {
    const row = normalizeRow(raw);
    if (row) normalized.push(row);
  }

  if (normalized.length === 0) {
    throw new Error("Nenhum lead válido (CPF obrigatório).");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const status = "Nunca Ligado";
    const observation = typeLead ? `${typeLead}` : null;
    let insertedCount = 0;

    for (const r of normalized) {
      const result = await client.query(
        `INSERT INTO leads (
          leads_icpf, leads_name, leads_address, leads_neighborhood, leads_city,
          leads_tel_1, leads_tel_2, leads_tel_3, leads_tel_4, leads_tel_5, leads_tel_6,
          leads_email, leads_observation, leads_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (leads_icpf) DO NOTHING
        RETURNING leads_id`,
        [
          r.leads_icpf ?? null,
          r.leads_name ?? null,
          r.leads_address ?? null,
          r.leads_neighborhood ?? null,
          r.leads_city ?? null,
          r.leads_tel_1 ?? null,
          r.leads_tel_2 ?? null,
          r.leads_tel_3 ?? null,
          r.leads_tel_4 ?? null,
          r.leads_tel_5 ?? null,
          r.leads_tel_6 ?? null,
          r.leads_email ?? null,
          r.leads_observation ?? observation,
          status,
        ]
      );
      if (result.rowCount > 0) insertedCount += 1;
    }

    await client.query("COMMIT");
    return {
      insertedCount,
      totalCount: normalized.length,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
