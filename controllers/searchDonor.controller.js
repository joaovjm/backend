import { searchDonor } from "../services/searchDonor.service.js";

export async function searchDonorController(req, res) {
  try {
    const { q, donorType } = req.query;
    const term = (q ?? "").trim();
    const type = (donorType ?? "Todos").trim() || "Todos";

    const data = await searchDonor(term, type);
    res.json(Array.isArray(data) ? data : []);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao buscar doador",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}
