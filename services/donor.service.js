import pool from "../db/db.js";
import { searchDonor } from "./searchDonor.service.js";

/**
 * Retorna um doador por ID com todos os dados relacionados (cpf, email, tels, mensal, observação, referência).
 */
export async function getDonorById(id) {
  const donorId = Number(id);
  if (!donorId) return null;

  const query = `
    SELECT
      d.donor_id,
      d.donor_name,
      d.donor_type,
      d.donor_address,
      d.donor_city,
      d.donor_neighborhood,
      d.donor_tel_1,
      dc.donor_cpf,
      de.donor_email,
      dt2.donor_tel_2,
      dt3.donor_tel_3,
      dm.donor_mensal_day,
      dm.donor_mensal_monthly_fee,
      do_obs.donor_observation,
      do_ref.donor_reference
    FROM donor d
    LEFT JOIN donor_cpf dc ON dc.donor_id = d.donor_id
    LEFT JOIN donor_email de ON de.donor_id = d.donor_id
    LEFT JOIN donor_tel_2 dt2 ON dt2.donor_id = d.donor_id
    LEFT JOIN donor_tel_3 dt3 ON dt3.donor_id = d.donor_id
    LEFT JOIN donor_mensal dm ON dm.donor_id = d.donor_id AND (dm.active IS NULL OR dm.active = true)
    LEFT JOIN donor_observation do_obs ON do_obs.donor_id = d.donor_id
    LEFT JOIN donor_reference do_ref ON do_ref.donor_id = d.donor_id
    WHERE d.donor_id = $1
    LIMIT 1
  `;
  const result = await pool.query(query, [donorId]);
  const row = result.rows[0];
  if (!row) return null;

  return {
    donor_id: row.donor_id,
    donor_name: row.donor_name,
    donor_type: row.donor_type,
    donor_address: row.donor_address,
    donor_city: row.donor_city,
    donor_neighborhood: row.donor_neighborhood,
    donor_tel_1: row.donor_tel_1,
    donor_cpf: row.donor_cpf ? { donor_cpf: row.donor_cpf } : null,
    donor_email: row.donor_email ? { donor_email: row.donor_email } : null,
    donor_tel_2: row.donor_tel_2 ? { donor_tel_2: row.donor_tel_2 } : null,
    donor_tel_3: row.donor_tel_3 ? { donor_tel_3: row.donor_tel_3 } : null,
    donor_mensal:
      row.donor_mensal_day != null || row.donor_mensal_monthly_fee != null
        ? {
            donor_mensal_day: row.donor_mensal_day,
            donor_mensal_monthly_fee: row.donor_mensal_monthly_fee,
          }
        : null,
    donor_observation: row.donor_observation
      ? { donor_observation: row.donor_observation }
      : null,
    donor_reference: row.donor_reference
      ? { donor_reference: row.donor_reference }
      : null,
  };
}

/**
 * Lista/busca doadores. GET /donor com query params q e donorType.
 */
export async function listDonors(q = "", donorType = "Todos") {
  return searchDonor((q || "").trim(), (donorType || "Todos").trim() || "Todos");
}

/**
 * Doações de um doador para TableDonor (com operator e collector).
 */
export async function getDonationsByDonorId(donorId) {
  const id = Number(donorId);
  if (!id) return [];

  const query = `
    SELECT
      d.receipt_donation_id,
      d.donor_id,
      d.donation_value,
      d.donation_extra,
      d.donation_day_contact,
      d.donation_day_to_receive,
      d.donation_day_received,
      d.donation_print,
      d.donation_received,
      d.donation_monthref,
      d.donation_description,
      d.donation_campain,
      d.operator_code_id,
      d.collector_code_id,
      op.operator_name AS operator_name,
      c.collector_name AS collector_name
    FROM donation d
    LEFT JOIN operator op ON op.operator_code_id = d.operator_code_id
    LEFT JOIN collector c ON c.collector_code_id = d.collector_code_id
    WHERE d.donor_id = $1
    ORDER BY d.donation_day_to_receive DESC NULLS LAST, d.receipt_donation_id DESC
  `;
  const result = await pool.query(query, [id]);

  const rows = result.rows || [];
  return rows.map((r) => ({
    ...r,
    operator: r.operator_code_id
      ? { operator_code_id: r.operator_code_id, operator_name: r.operator_name }
      : null,
    collector: r.collector_code_id
      ? { collector_code_id: r.collector_code_id, collector_name: r.collector_name }
      : null,
  }));
}

/**
 * Request ativo do doador (último request_active = true).
 */
export async function getRequestByDonorId(donorId) {
  const id = Number(donorId);
  if (!id) return [];

  const query = `
    SELECT r.*, op.operator_name AS operator_name
    FROM request r
    LEFT JOIN operator op ON op.operator_code_id = r.operator_code_id
    WHERE r.donor_id = $1 AND r.request_active = 'True'
    ORDER BY r.request_start_date DESC
    LIMIT 1
  `;
  const result = await pool.query(query, [id]);
  const rows = result.rows || [];
  return rows.map((r) => ({
    ...r,
    operator: r.operator_code_id
      ? { operator_name: r.operator_name }
      : null,
  }));
}

/**
 * Cria doador e registros nas tabelas auxiliares em uma transação.
 */
export async function createDonor(payload) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const insertDonor = `
      INSERT INTO donor (donor_name, donor_type, donor_address, donor_city, donor_neighborhood, donor_tel_1)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING donor_id, donor_name, donor_type, donor_address, donor_city, donor_neighborhood, donor_tel_1
    `;
    const donorRes = await client.query(insertDonor, [
      payload.nome,
      payload.tipo,
      payload.endereco,
      payload.cidade,
      payload.bairro,
      payload.telefone1,
    ]);
    const donor = donorRes.rows[0];
    const donorId = donor.donor_id;

    if (payload.cpf) {
      const cpfClean = String(payload.cpf).replace(/[.-]/g, "");
      await client.query(
        "INSERT INTO donor_cpf (donor_id, donor_cpf) VALUES ($1, $2)",
        [donorId, cpfClean]
      );
    }
    if (payload.email) {
      await client.query(
        "INSERT INTO donor_email (donor_id, donor_email) VALUES ($1, $2)",
        [donorId, payload.email]
      );
    }
    if (payload.telefone2) {
      await client.query(
        "INSERT INTO donor_tel_2 (donor_id, donor_tel_2) VALUES ($1, $2)",
        [donorId, payload.telefone2]
      );
    }
    if (payload.telefone3) {
      await client.query(
        "INSERT INTO donor_tel_3 (donor_id, donor_tel_3) VALUES ($1, $2)",
        [donorId, payload.telefone3]
      );
    }
    if (payload.observacao) {
      await client.query(
        "INSERT INTO donor_observation (donor_id, donor_observation) VALUES ($1, $2)",
        [donorId, payload.observacao]
      );
    }
    if (payload.referencia) {
      await client.query(
        "INSERT INTO donor_reference (donor_id, donor_reference) VALUES ($1, $2)",
        [donorId, payload.referencia]
      );
    }
    if (payload.tipo === "Mensal" && (payload.dia != null || payload.mensalidade != null)) {
      await client.query(
        "INSERT INTO donor_mensal (donor_id, donor_mensal_day, donor_mensal_monthly_fee) VALUES ($1, $2, $3)",
        [donorId, payload.dia || null, payload.mensalidade || null]
      );
    }

    await client.query("COMMIT");
    return donor;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Atualiza doador e tabelas auxiliares. Atualiza activity_operator e activity_date na donor.
 */
export async function updateDonor(id, payload, operatorId = null) {
  const donorId = Number(id);
  if (!donorId) throw new Error("donor_id inválido");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const updateDonor = `
      UPDATE donor
      SET donor_name = $1, donor_type = $2, donor_address = $3, donor_city = $4,
          donor_neighborhood = $5, donor_tel_1 = $6,
          activity_operator = $7, activity_date = $8
      WHERE donor_id = $9
      RETURNING donor_id
    `;
    const now = new Date();
    await client.query(updateDonor, [
      payload.nome,
      payload.tipo,
      payload.endereco,
      payload.cidade,
      payload.bairro,
      payload.telefone1,
      operatorId ?? null,
      now,
      donorId,
    ]);

    if (payload.cpf !== undefined && payload.cpf !== null) {
      const cpfClean = String(payload.cpf).replace(/[.-]/g, "");
      await client.query(
        `INSERT INTO donor_cpf (donor_id, donor_cpf) VALUES ($1, $2)
         ON CONFLICT (donor_id) DO UPDATE SET donor_cpf = EXCLUDED.donor_cpf`,
        [donorId, cpfClean]
      );
    }
    if (payload.email !== undefined && payload.email !== null) {
      await client.query(
        `INSERT INTO donor_email (donor_id, donor_email) VALUES ($1, $2)
         ON CONFLICT (donor_id) DO UPDATE SET donor_email = EXCLUDED.donor_email`,
        [donorId, payload.email]
      );
    }
    if (payload.telefone2 !== undefined && payload.telefone2 !== null) {
      await client.query(
        `INSERT INTO donor_tel_2 (donor_id, donor_tel_2) VALUES ($1, $2)
         ON CONFLICT (donor_id) DO UPDATE SET donor_tel_2 = EXCLUDED.donor_tel_2`,
        [donorId, payload.telefone2]
      );
    }
    if (payload.telefone3 !== undefined && payload.telefone3 !== null) {
      await client.query(
        `INSERT INTO donor_tel_3 (donor_id, donor_tel_3) VALUES ($1, $2)
         ON CONFLICT (donor_id) DO UPDATE SET donor_tel_3 = EXCLUDED.donor_tel_3`,
        [donorId, payload.telefone3]
      );
    }
    if (payload.observacao !== undefined && payload.observacao !== null) {
      await client.query(
        `INSERT INTO donor_observation (donor_id, donor_observation) VALUES ($1, $2)
         ON CONFLICT (donor_id) DO UPDATE SET donor_observation = EXCLUDED.donor_observation`,
        [donorId, payload.observacao]
      );
    }
    if (payload.referencia !== undefined && payload.referencia !== null) {
      await client.query(
        `INSERT INTO donor_reference (donor_id, donor_reference) VALUES ($1, $2)
         ON CONFLICT (donor_id) DO UPDATE SET donor_reference = EXCLUDED.donor_reference`,
        [donorId, payload.referencia]
      );
    }
    if (payload.mensalidade !== undefined || payload.dia !== undefined) {
      await client.query(
        `INSERT INTO donor_mensal (donor_id, donor_mensal_day, donor_mensal_monthly_fee) VALUES ($1, $2, $3)
         ON CONFLICT (donor_id) DO UPDATE SET donor_mensal_day = EXCLUDED.donor_mensal_day, donor_mensal_monthly_fee = EXCLUDED.donor_mensal_monthly_fee`,
        [donorId, payload.dia ?? null, payload.mensalidade ?? null]
      );
    }

    if (payload.tipo === "Avulso") {
      await client.query(
        "UPDATE donor_mensal SET active = false WHERE donor_id = $1",
        [donorId]
      );
    }

    await client.query("COMMIT");
    return getDonorById(donorId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Mescla dois doadores: transfere doações do antigo para o novo, marca antigo como Excluso.
 */
export async function mergeDonors(olderDonorId, newerDonorId, updatedFields = {}) {
  const olderId = Number(olderDonorId);
  const newerId = Number(newerDonorId);
  if (!olderId || !newerId || olderId === newerId) {
    throw new Error("IDs de doadores inválidos para mesclagem");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      "UPDATE donation SET donor_id = $1 WHERE donor_id = $2",
      [newerId, olderId]
    );
    await client.query(
      "UPDATE scheduled_donations SET donor_id = $1 WHERE donor_id = $2",
      [newerId, olderId]
    ).catch(() => {});
    await client.query(
      "UPDATE donor SET donor_type = 'Excluso' WHERE donor_id = $1",
      [olderId]
    );

    const fields = Object.keys(updatedFields).filter((k) => updatedFields[k] !== undefined);
    if (fields.length > 0) {
      const setList = [];
      const values = [];
      let idx = 1;
      if (updatedFields.donor_name !== undefined) {
        setList.push(`donor_name = $${idx++}`);
        values.push(updatedFields.donor_name);
      }
      if (updatedFields.donor_tel_1 !== undefined) {
        setList.push(`donor_tel_1 = $${idx++}`);
        values.push(updatedFields.donor_tel_1);
      }
      if (setList.length > 0) {
        values.push(newerId);
        await client.query(
          `UPDATE donor SET ${setList.join(", ")} WHERE donor_id = $${idx}`,
          values
        );
      }
      const cpf = updatedFields.donor_cpf;
      if (cpf !== undefined) {
        const cpfClean = String(cpf).replace(/[.-]/g, "");
        await client.query(
          `INSERT INTO donor_cpf (donor_id, donor_cpf) VALUES ($1, $2) ON CONFLICT (donor_id) DO UPDATE SET donor_cpf = EXCLUDED.donor_cpf`,
          [newerId, cpfClean]
        );
      }
    const auxTables = [
      { table: "donor_email", col: "donor_email" },
      { table: "donor_tel_2", col: "donor_tel_2" },
      { table: "donor_tel_3", col: "donor_tel_3" },
      { table: "donor_observation", col: "donor_observation" },
      { table: "donor_reference", col: "donor_reference" },
    ];
    for (const { table, col } of auxTables) {
      const val = updatedFields[col];
      if (val === undefined) continue;
      await client.query(
        `INSERT INTO ${table} (donor_id, ${col}) VALUES ($1, $2)
         ON CONFLICT (donor_id) DO UPDATE SET ${col} = EXCLUDED.${col}`,
        [newerId, val]
      );
    }
    }

    await client.query("COMMIT");
    return { olderDonorId: olderId, newerDonorId: newerId };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Busca dados completos de vários doadores (para modal de mesclagem).
 */
export async function getDonorsByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const safeIds = ids.map((id) => Number(id)).filter(Boolean);
  if (safeIds.length === 0) return [];

  const placeholders = safeIds.map((_, i) => `$${i + 1}`).join(", ");
  const query = `
    SELECT
      d.donor_id,
      d.donor_name,
      d.donor_type,
      d.donor_address,
      d.donor_city,
      d.donor_neighborhood,
      d.donor_tel_1,
      dc.donor_cpf,
      de.donor_email,
      dt2.donor_tel_2,
      dt3.donor_tel_3,
      do_obs.donor_observation,
      do_ref.donor_reference
    FROM donor d
    LEFT JOIN donor_cpf dc ON dc.donor_id = d.donor_id
    LEFT JOIN donor_email de ON de.donor_id = d.donor_id
    LEFT JOIN donor_tel_2 dt2 ON dt2.donor_id = d.donor_id
    LEFT JOIN donor_tel_3 dt3 ON dt3.donor_id = d.donor_id
    LEFT JOIN donor_observation do_obs ON do_obs.donor_id = d.donor_id
    LEFT JOIN donor_reference do_ref ON do_ref.donor_id = d.donor_id
    WHERE d.donor_id = ANY($1::int[])
  `;
  const result = await pool.query(query, [safeIds]);
  const rows = result.rows || [];
  return rows.map((r) => ({
    donor_id: r.donor_id,
    donor_name: r.donor_name,
    donor_type: r.donor_type,
    donor_address: r.donor_address,
    donor_city: r.donor_city,
    donor_neighborhood: r.donor_neighborhood,
    donor_tel_1: r.donor_tel_1,
    donor_cpf: r.donor_cpf ? { donor_cpf: r.donor_cpf } : null,
    donor_email: r.donor_email ? { donor_email: r.donor_email } : null,
    donor_tel_2: r.donor_tel_2 ? { donor_tel_2: r.donor_tel_2 } : null,
    donor_tel_3: r.donor_tel_3 ? { donor_tel_3: r.donor_tel_3 } : null,
    donor_observation: r.donor_observation ? { donor_observation: r.donor_observation } : null,
    donor_reference: r.donor_reference ? { donor_reference: r.donor_reference } : null,
  }));
}

/**
 * Registra atividade do doador (donor_activity_log).
 */
export async function logDonorActivity(payload) {
  const {
    donor_id,
    operator_code_id,
    action_type,
    action_description,
    old_values = null,
    new_values = null,
    related_donation_id = null,
  } = payload;

  const query = `
    INSERT INTO donor_activity_log (donor_id, operator_code_id, action_type, action_description, old_values, new_values, related_donation_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;
  const result = await pool.query(query, [
    donor_id,
    operator_code_id,
    action_type,
    action_description,
    old_values ? JSON.stringify(old_values) : null,
    new_values ? JSON.stringify(new_values) : null,
    related_donation_id,
  ]);
  return result.rows[0];
}

/**
 * Histórico de atividades do doador (para DonorActivityHistory).
 */
export async function getDonorActivityLog(donorId, limit = 100) {
  const id = Number(donorId);
  if (!id) return [];

  const query = `
    SELECT a.*, op.operator_name
    FROM donor_activity_log a
    LEFT JOIN operator op ON op.operator_code_id = a.operator_code_id
    WHERE a.donor_id = $1
    ORDER BY a.created_at DESC
    LIMIT $2
  `;
  const result = await pool.query(query, [id, limit]);
  const rows = result.rows || [];
  return rows.map((r) => ({
    ...r,
    operator: r.operator_code_id
      ? { operator_code_id: r.operator_code_id, operator_name: r.operator_name }
      : null,
  }));
}
