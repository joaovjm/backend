import { insert, remove, getAllReceived } from "../services/donation.service.js";

export async function insertDonation(req, res, next) {

    try {
        const data = await insert(req.body);
        res.status(200).json(data);
    } catch (error) {
        next(error);
    }
}

export async function deleteDonation(req, res, next) {
    try {
        const { id } = req.params;
        await remove(Number(id));
        res.status(200).json({ message: "Doação deletada com sucesso" });
    } catch (error) {
        next(error);
    }
}

export async function getAllReceivedDonations(req, res, next) {

    try {
        const { startDate, endDate } = req.query;
        const data = await getAllReceived({ startDate, endDate });
        res.status(200).json(data);
    } catch (error) {
        next(error);
    }
}