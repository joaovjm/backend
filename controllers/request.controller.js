import {
  getRequest,
  getRequestById,
  getPackageForRequest,
  createRequest,
  updateRequest,
  updateRequestNameActive,
  deleteRequestPackage,
} from "../services/request.service.js";

/**
 * GET /request
 * Retorna requestNames + operators em uma única chamada (dados da página Request).
 */
export async function getRequestController(req, res) {
  try {
    const data = await getRequest();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao carregar requisições",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * GET /request/:id
 * Retorna itens da requisição (detalhe para edição).
 */
export async function getRequestByIdController(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "ID inválido" });
    }
    const data = await getRequestById(id);
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao carregar requisição",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * POST /request/package
 * Body: { type, startDate, endDate, filterPackage?, ignoreWorkList? }
 * Retorna lista de doações para montar o pacote (Etapa 1).
 */
export async function getPackageController(req, res) {
  try {
    const body = req.body ?? {};
    const data = await getPackageForRequest({
      type: body.type,
      startDate: body.startDate,
      endDate: body.endDate,
      filterPackage: body.filterPackage ?? "max",
      ignoreWorkList: Boolean(body.ignoreWorkList),
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao buscar pacote",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * POST /request
 * Body: { createPackage: Array }
 * Cria request_name e itens em request.
 */
export async function createRequestController(req, res) {
  try {
    const { createPackage } = req.body ?? {};
    const result = await createRequest(createPackage);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({
      error: error?.message ?? "Erro ao criar requisição",
    });
  }
}

/**
 * PATCH /request/:id
 * Body: { createPackage: Array, endDate: string }
 * Atualiza itens do request.
 */
export async function updateRequestController(req, res) {
  try {
    const id = Number(req.params.id);
    const { createPackage, endDate } = req.body ?? {};
    if (!id) {
      return res.status(400).json({ error: "ID inválido" });
    }
    const data = await updateRequest(id, createPackage, endDate);
    res.json(data);
  } catch (error) {
    res.status(400).json({
      error: error?.message ?? "Erro ao atualizar requisição",
    });
  }
}

/**
 * DELETE /request/:id
 * Deleta itens do request e o request_name.
 */
export async function deleteRequestController(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "ID inválido" });
    }
    const result = await deleteRequestPackage(id);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao deletar requisição",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}

/**
 * PATCH /request/:id/active
 * Body: { active: boolean }
 * Atualiza a coluna active do request_name.
 */
export async function updateRequestActiveController(req, res) {
  try {
    const id = Number(req.params.id);
    const active = req.body?.active;
    if (!id) {
      return res.status(400).json({ error: "ID inválido" });
    }
    if (typeof active !== "boolean") {
      return res.status(400).json({ error: "active deve ser true ou false" });
    }
    const result = await updateRequestNameActive(id, active);
    if (!result) {
      return res.status(404).json({ error: "Requisição não encontrada" });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao atualizar status",
      detail: process.env.NODE_ENV !== "production" ? error?.message : undefined,
    });
  }
}
