import pool from "../db/db.js";
import { update as updateDonation } from "./donation.service.js";

function normalizeBooleanFlag(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "sim" || normalized === "true";
}

export async function getReceiverDonationsData({ collectorCodeId } = {}) {
  const hardcodedCollectorId = 22;
  const collectorId = Number(collectorCodeId) || hardcodedCollectorId;

  const collectorsQuery = `
    SELECT
      collector_code_id,
      collector_name
    FROM collector
    WHERE collector_name IS DISTINCT FROM '???'
    ORDER BY collector_name
  `;

  const depositsQuery = `
    SELECT
      d.receipt_donation_id,
      d.donation_value,
      d.donation_campain,
      d.donation_day_received,
      d.donor_id,
      json_build_object(
        'donor_name', dn.donor_name,
        'donor_tel_1', dn.donor_tel_1,
        'donor_email',
          CASE
            WHEN de.donor_email IS NOT NULL AND de.donor_email <> ''
              THEN json_build_object('donor_email', de.donor_email)
            ELSE NULL
          END
      ) AS donor
    FROM donation d
    JOIN donor dn ON dn.donor_id = d.donor_id
    LEFT JOIN donor_email de ON de.donor_id = d.donor_id
    WHERE d.donation_deposit_receipt_send = 'Não'
      AND d.collector_code_id = $1
      AND d.donation_received = 'Sim'
    ORDER BY
      (de.donor_email IS NOT NULL AND de.donor_email <> '') DESC,
      d.donation_day_received DESC NULLS LAST
  `;

  const receiptConfigQuery = `
    SELECT *
    FROM receipt_config
    ORDER BY id ASC
    LIMIT 1
  `;

  const [collectorsResult, depositsResult, receiptConfigResult] =
    await Promise.all([
      pool.query(collectorsQuery),
      pool.query(depositsQuery, [collectorId]),
      pool.query(receiptConfigQuery),
    ]);

  const collectors = collectorsResult.rows || [];
  const deposits = depositsResult.rows || [];
  const receiptConfig = receiptConfigResult.rows?.[0] ?? null;

  return {
    collectors,
    deposits,
    receiptConfig,
  };
}

async function findDonationByReceipt(receiptDonationId) {
  const id = Number(receiptDonationId);
  if (!id) return null;

  const query = `
    SELECT
      d.receipt_donation_id,
      d.donation_value,
      d.donation_received,
      d.collector_code_id,
      d.donation_worklist,
      d.donor_id,
      d.operator_code_id,
      dn.donor_name
    FROM donation d
    LEFT JOIN donor dn ON dn.donor_id = d.donor_id
    WHERE d.receipt_donation_id = $1
    LIMIT 1
  `;

  const { rows } = await pool.query(query, [id]);
  return rows[0] || null;
}

export async function receiveDonation({
  receiptDonationId,
  collectorCodeId,
  date,
  confirmDifferentCollector = false,
}) {
  const donation = await findDonationByReceipt(receiptDonationId);

  if (!donation) {
    return {
      status: "not_found",
      message: "Recibo não localizado",
    };
  }

  const isAlreadyReceived = normalizeBooleanFlag(donation.donation_received);

  if (isAlreadyReceived) {
    return {
      status: "already_received",
      message: "Doação já recebida",
    };
  }

  const currentCollectorId = donation.collector_code_id
    ? Number(donation.collector_code_id)
    : null;
  const requestedCollectorId = Number(collectorCodeId) || null;

  if (
    currentCollectorId &&
    requestedCollectorId &&
    currentCollectorId !== requestedCollectorId &&
    !confirmDifferentCollector
  ) {
    return {
      status: "collector_mismatch",
      message: "Ficha de outro coletador. Confirma a alteração do coletador?",
      currentCollectorCodeId: currentCollectorId,
      requestedCollectorCodeId: requestedCollectorId,
      donation: {
        receipt_donation_id: donation.receipt_donation_id,
        donor_name: donation.donor_name,
        donation_value: Number(donation.donation_value) || 0,
      },
    };
  }

  const normalizedDate = date ? String(date).slice(0, 10) : null;

  const updated = await updateDonation(receiptDonationId, {
    donation_received: "Sim",
    donation_day_received: normalizedDate,
    collector_code_id: requestedCollectorId,
    donation_deposit_receipt_send: "Não",
  });

  const value =
    Number(donation.donation_value ?? updated.donation_value ?? 0) || 0;

  return {
    status: "success",
    item: {
      search: String(updated.receipt_donation_id),
      name: donation.donor_name,
      value,
    },
  };
}

export async function markDepositAsSent(receiptDonationId) {
  const id = Number(receiptDonationId);
  if (!id) {
    throw new Error("receipt_donation_id inválido");
  }

  const query = `
    UPDATE donation
    SET donation_deposit_receipt_send = 'Sim'
    WHERE receipt_donation_id = $1
    RETURNING receipt_donation_id
  `;

  const { rows } = await pool.query(query, [id]);
  if (!rows[0]) {
    throw new Error("Doação não encontrada para marcar como enviada");
  }

  return {
    receipt_donation_id: rows[0].receipt_donation_id,
  };
}

