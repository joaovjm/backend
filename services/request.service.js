import pool from "../db/db.js";

const VALID_DONOR_TYPES = ["Avulso", "Mensal", "Lista", "Todos"];

/**
 * Busca doações para montar o pacote da requisição (Etapa 1).
 * Equivalente ao getPackage do frontend: doações recebidas no período, por tipo de doador,
 * com deduplicação (max/min por doador), opção de excluir quem tem doação após o período (não Mensal)
 * e opção de ignorar doadores já em lista de trabalho ativa.
 */
export async function getPackageForRequest(params) {
  const {
    type,
    startDate,
    endDate,
    filterPackage = "max",
    ignoreWorkList = false,
  } = params ?? {};

  if (!type || !startDate || !endDate) return [];

  const typeParam = type === "Todos" ? VALID_DONOR_TYPES : [type];

  const query = `
    SELECT
      d.donor_id,
      d.donation_value,
      d.donation_day_received,
      d.receipt_donation_id,
      d.operator_code_id,
      don.donor_name,
      don.donor_type,
      don.donor_tel_1,
      op.operator_name
    FROM donation d
    INNER JOIN donor don ON don.donor_id = d.donor_id
    INNER JOIN operator op ON op.operator_code_id = d.operator_code_id
    WHERE don.donor_type = ANY($1::text[])
      AND d.donation_received = 'Sim'
      AND d.donation_day_received >= $2::date
      AND d.donation_day_received <= $3::date
    ORDER BY d.donation_value DESC
  `;
  const { rows } = await pool.query(query, [typeParam, startDate, endDate]);

  const newPackage = rows.map((row) => ({
    donor_id: row.donor_id,
    donor_name: row.donor_name,
    operator_name: row.operator_name,
    donor_tel_1: row.donor_tel_1,
    donation_value: row.donation_value,
    donation_day_received: row.donation_day_received,
    receipt_donation_id: row.receipt_donation_id,
    operator_code_id: row.operator_code_id,
    donor_type: row.donor_type,
  }));

  if (newPackage.length === 0) return [];

  const countByDonor = {};
  newPackage.forEach((item) => {
    countByDonor[item.donor_id] = (countByDonor[item.donor_id] || 0) + 1;
  });
  const duplicateDonorIds = Object.keys(countByDonor).filter(
    (id) => countByDonor[id] > 1
  );

  const pickOnePerDonor = (group) => {
    return group.reduce((chosen, curr) => {
      if (!chosen) return curr;
      if (filterPackage === "max") {
        return curr.donation_value > chosen.donation_value ? curr : chosen;
      }
      return curr.donation_value < chosen.donation_value ? curr : chosen;
    }, null);
  };

  const fromDuplicates = duplicateDonorIds
    .map((donorId) => {
      const group = newPackage.filter(
        (item) => item.donor_id === Number(donorId)
      );
      return pickOnePerDonor(group);
    })
    .filter(Boolean);

  const singleDonors = newPackage.filter(
    (item) => !duplicateDonorIds.includes(String(item.donor_id))
  );
  let filteredPackage = [...singleDonors, ...fromDuplicates];

  if (type !== "Mensal") {
    const { rows: afterEnd } = await pool.query(
      `SELECT DISTINCT donor_id FROM donation WHERE donation_day_received > $1::date`,
      [endDate]
    );
    const donorIdsWithFuture = new Set(afterEnd.map((r) => r.donor_id));
    filteredPackage = filteredPackage.filter(
      (item) => !donorIdsWithFuture.has(item.donor_id)
    );
  }

  if (ignoreWorkList && filteredPackage.length > 0) {
    const donorIds = [...new Set(filteredPackage.map((p) => p.donor_id))];
    const { rows: activeRequests } = await pool.query(
      `SELECT DISTINCT donor_id FROM request WHERE donor_id = ANY($1::int[]) AND request_active = 'True'`,
      [donorIds]
    );
    const activeDonorIds = new Set(activeRequests.map((r) => r.donor_id));
    filteredPackage = filteredPackage.filter(
      (item) => !activeDonorIds.has(item.donor_id)
    );
  }

  return filteredPackage;
}

/**
 * Retorna todos os dados necessários para a página Request em uma única round-trip:
 * - requestNames: lista de requisições (request_name) ordenadas por data
 * - operators: operadores ativos (não Admin) para distribuição
 */
export async function getRequest() {
  const query = `
    WITH rn AS (
      SELECT
        id,
        name,
        date_created,
        date_validate,
        COALESCE(active, (date_validate IS NULL OR date_validate >= CURRENT_DATE)) AS active
      FROM request_name
      ORDER BY date_created DESC
    ),
    ops AS (
      SELECT operator_code_id, operator_name, operator_type
      FROM operator
      WHERE operator_active = true
        AND (operator_type IS NULL OR operator_type != 'Admin')
      ORDER BY operator_name
    )
    SELECT
      (SELECT json_agg(r ORDER BY r.date_created DESC) FROM rn r) AS request_names,
      (SELECT json_agg(ops) FROM ops) AS operators
  `;
  const { rows } = await pool.query(query);
  const row = rows[0];
  const requestNames = row?.request_names != null ? row.request_names : [];
  const operators = row?.operators != null ? row.operators : [];
  return { requestNames, operators };
}

/**
 * Retorna os itens de uma requisição por request_name_id (detalhe para edição)
 * e o campo active do request_name.
 */
export async function getRequestById(requestNameId) {
  const id = Number(requestNameId);
  if (!id) return { items: [], active: true };

  const [nameRow, itemsRows] = await Promise.all([
    pool.query(
      "SELECT COALESCE(active, true) AS active FROM request_name WHERE id = $1",
      [id]
    ),
    pool.query(
      `
    SELECT
      r.id,
      r.donor_id,
      r.operator_code_id,
      r.receipt_donation_id,
      r.request_end_date,
      r.request_name,
      r.request_name_id,
      r.request_start_date,
      d.donor_tel_1,
      op.operator_name,
      don.donation_value,
      don.donation_day_received
    FROM request r
    INNER JOIN donor d ON d.donor_id = r.donor_id
    LEFT JOIN operator op ON op.operator_code_id = r.operator_code_id
    LEFT JOIN donation don ON don.receipt_donation_id = r.receipt_donation_id
    WHERE r.request_name_id = $1
    ORDER BY r.id
  `,
      [id]
    ),
  ]);

  const active = nameRow.rows[0] ? Boolean(nameRow.rows[0].active) : true;
  const rows = itemsRows.rows;

  const items = rows.map((row) => ({
    id: row.id,
    donor_id: row.donor_id,
    operator_code_id: row.operator_code_id,
    receipt_donation_id: row.receipt_donation_id,
    request_end_date: row.request_end_date,
    request_name: row.request_name,
    request_name_id: row.request_name_id,
    request_start_date: row.request_start_date,
    donor: { donor_tel_1: row.donor_tel_1 },
    operator: row.operator_name != null ? { operator_name: row.operator_name } : null,
    donation: row.donation_value != null || row.donation_day_received != null
      ? {
          donation_value: row.donation_value,
          donation_day_received: row.donation_day_received,
        }
      : null,
  }));

  return { items, active };
}

/**
 * Cria um novo pacote: insert em request_name + insert em request (múltiplos itens).
 */
export async function createRequest(createPackage) {
  if (!createPackage?.length) throw new Error("createPackage vazio");

  const first = createPackage[0];
  const requestName = first?.request_name;
  const requestEndDate = first?.request_end_date ?? null;
  if (!requestName) throw new Error("request_name obrigatório");

  const now = new Date();
  const dateCreated = now.toISOString().slice(0, 10);
  const dateValidate = requestEndDate;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const insertName = await client.query(
      `INSERT INTO request_name (name, date_created, date_validate)
       VALUES ($1, $2::date, $3::date)
       RETURNING id`,
      [requestName, dateCreated, dateValidate]
    );
    const requestNameId = insertName.rows[0]?.id;
    if (!requestNameId) throw new Error("Falha ao criar request_name");

    const validColumns = [
      "donor_id",
      "operator_code_id",
      "receipt_donation_id",
      "request_end_date",
      "request_name",
    ];
    const startDateStr = now.toISOString().slice(0, 10);

    for (const pkg of createPackage) {
      const row = Object.fromEntries(
        Object.entries(pkg).filter(([k]) => validColumns.includes(k))
      );
      await client.query(
        `INSERT INTO request (
          donor_id, operator_code_id, receipt_donation_id,
          request_end_date, request_name, request_name_id, request_start_date,
          request_active
        ) VALUES ($1, $2, $3, $4::date, $5, $6, $7::date, 'True')`,
        [
          row.donor_id ?? null,
          row.operator_code_id ?? null,
          row.receipt_donation_id ?? null,
          row.request_end_date ?? requestEndDate,
          requestName,
          requestNameId,
          startDateStr,
        ]
      );
    }

    await client.query("COMMIT");
    const result = await getRequestById(requestNameId);
    return { requestNameId, items: result.items };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Atualiza itens do request (operator_code_id e request_end_date) por request_name_id.
 */
export async function updateRequest(requestNameId, createPackage, endDate) {
  const id = Number(requestNameId);
  if (!id) throw new Error("request_name_id inválido");
  if (!createPackage?.length) throw new Error("createPackage vazio");

  const validColumns = ["id", "operator_code_id", "request_end_date"];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const pkg of createPackage) {
      const row = Object.fromEntries(
        Object.entries(pkg).filter(([k]) => validColumns.includes(k))
      );
      if (row.id == null) continue;
      await client.query(
        `UPDATE request
         SET operator_code_id = COALESCE($2::int, operator_code_id),
             request_end_date = $3::date
         WHERE id = $1 AND request_name_id = $4`,
        [row.id, row.operator_code_id ?? null, endDate ?? null, id]
      );
    }

    await client.query("COMMIT");
    const result = await getRequestById(id);
    return result.items;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Atualiza a coluna active do request_name (True/False).
 */
export async function updateRequestNameActive(requestNameId, active) {
  const id = Number(requestNameId);
  if (!id) throw new Error("request_name_id inválido");

  const { rows } = await pool.query(
    `UPDATE request_name SET active = $2 WHERE id = $1 RETURNING id, active`,
    [id, Boolean(active)]
  );
  return rows[0] ?? null;
}

/**
 * Deleta todos os request do request_name_id e depois o request_name.
 */
export async function deleteRequestPackage(requestNameId) {
  const id = Number(requestNameId);
  if (!id) throw new Error("request_name_id inválido");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM request WHERE request_name_id = $1", [id]);
    const del = await client.query(
      "DELETE FROM request_name WHERE id = $1 RETURNING id",
      [id]
    );
    await client.query("COMMIT");
    return {
      success: true,
      message: "Requisição deletada com sucesso",
      data: del.rows,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
