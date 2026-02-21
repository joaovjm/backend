import {
  getDonorById,
  listDonors,
  getDonationsByDonorId,
  getRequestByDonorId,
  createDonor,
  updateDonor,
  mergeDonors,
  getDonorsByIds,
  logDonorActivity,
  getDonorActivityLog,
} from "../services/donor.service.js";

export async function getDonorByIdController(req, res) {
  try {
    const { id } = req.params;
    const donor = await getDonorById(id);
    if (!donor) {
      return res.status(404).json({ error: "Doador não encontrado" });
    }
    res.json(donor);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao buscar doador",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

export async function listDonorsController(req, res) {
  try {
    const { q, donorType } = req.query;
    const data = await listDonors(
      (q ?? "").trim(),
      (donorType ?? "Todos").trim() || "Todos"
    );
    res.json(Array.isArray(data) ? data : []);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao listar doadores",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

export async function getDonationsController(req, res) {
  try {
    const { id } = req.params;
    const donations = await getDonationsByDonorId(id);
    res.json(donations);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao buscar doações do doador",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

export async function getRequestController(req, res) {
  try {
    const { id } = req.params;
    const requestList = await getRequestByDonorId(id);
    res.json(requestList);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao buscar requisição do doador",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

export async function createDonorController(req, res) {
  try {
    const donor = await createDonor(req.body);
    res.status(201).json(donor);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao criar doador",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

export async function updateDonorController(req, res) {
  try {
    const { id } = req.params;
    const operatorId = req.body.operator_code_id ?? req.query.operator_code_id ?? null;
    const payload = {
      nome: req.body.nome,
      tipo: req.body.tipo,
      cpf: req.body.cpf,
      email: req.body.email,
      endereco: req.body.endereco,
      cidade: req.body.cidade,
      bairro: req.body.bairro,
      telefone1: req.body.telefone1,
      telefone2: req.body.telefone2,
      telefone3: req.body.telefone3,
      dia: req.body.dia,
      mensalidade: req.body.mensalidade,
      observacao: req.body.observacao,
      referencia: req.body.referencia,
    };
    const donor = await updateDonor(id, payload, operatorId);
    res.json(donor);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao atualizar doador",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

export async function mergeDonorsController(req, res) {
  try {
    const { olderDonorId, newerDonorId, updatedFields } = req.body;
    const result = await mergeDonors(olderDonorId, newerDonorId, updatedFields || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao mesclar doadores",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

export async function getDonorsByIdsController(req, res) {
  try {
    const { ids } = req.query;
    const idList = typeof ids === "string" ? ids.split(",").map((s) => s.trim()) : [];
    const donors = await getDonorsByIds(idList);
    res.json(donors);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao buscar doadores",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

export async function logDonorActivityController(req, res) {
  try {
    const record = await logDonorActivity(req.body);
    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao registrar atividade",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

export async function getDonorActivityController(req, res) {
  try {
    const { id } = req.params;
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const activities = await getDonorActivityLog(id, limit);
    res.json(activities);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao buscar histórico do doador",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}
