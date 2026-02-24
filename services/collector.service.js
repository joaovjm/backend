import pool from "../db/db.js";

export async function listCollectors() {
  const query = `
    SELECT collector_code_id, collector_name
    FROM collector
    WHERE collector_name IS DISTINCT FROM '???'
    ORDER BY collector_name
  `;

  const { rows } = await pool.query(query);
  return rows || [];
}

export async function changeDonationCollector({
  collectorCodeId,
  receiptDonationId,
  date,
  reason,
}) {
  const collectorId = Number(collectorCodeId);
  const receiptId = Number(receiptDonationId);

  if (!collectorId || !receiptId) {
    throw new Error("Parâmetros inválidos para alteração de coletador.");
  }

  const donationQuery = `
    SELECT receipt_donation_id, donation_received
    FROM donation
    WHERE receipt_donation_id = $1
    LIMIT 1
  `;
  const { rows: donationRows } = await pool.query(donationQuery, [receiptId]);
  const donation = donationRows[0];

  if (!donation) {
    return { status: "NOT_FOUND" };
  }

  const receivedValue = String(donation.donation_received ?? "")
    .trim()
    .toLowerCase();

  if (receivedValue === "sim" || receivedValue === "true") {
    return { status: "ALREADY_RECEIVED" };
  }

  if (
    collectorId === 10 &&
    typeof reason === "string" &&
    reason.trim() !== ""
  ) {
    const upsertReasonQuery = `
      INSERT INTO donor_confirmation_reason (receipt_donation_id, donor_confirmation_reason)
      VALUES ($1, $2)
      ON CONFLICT (receipt_donation_id)
      DO UPDATE SET donor_confirmation_reason = EXCLUDED.donor_confirmation_reason
    `;

    await pool.query(upsertReasonQuery, [receiptId, reason.trim()]);
  }

  const updateQuery = `
    UPDATE donation
    SET
      collector_code_id = $1,
      donation_day_to_receive = $2
    WHERE receipt_donation_id = $3
    RETURNING receipt_donation_id, donor_id, collector_code_id, donation_day_to_receive
  `;

  const { rows: updatedRows } = await pool.query(updateQuery, [
    collectorId,
    date || null,
    receiptId,
  ]);

  const updatedDonation = updatedRows[0] || null;

  return {
    status: "OK",
    donation: updatedDonation,
  };
}

