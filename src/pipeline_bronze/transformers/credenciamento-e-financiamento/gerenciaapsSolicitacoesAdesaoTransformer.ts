// src/transformers/credenciamento-e-financiamento/gerenciaapsSolicitacoesAdesaoTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../../database/raw_db/connection.js";
import { gerenciaapsSolicitacoesAdesao } from "../../../database/raw_db/schema.js";

const logger = pino();

interface ItemAdesaoJson {
  sgUf?: unknown;
  noMunicipioAcentuado?: unknown;
  coMunicipioIbge?: unknown;
  dsEsferaAdministrativa?: unknown;
  nuSolicitacao?: unknown;
  dsEstrategia?: unknown;
  sgEstrategia?: unknown;
  dsSituacao?: unknown;
  dtCadastro?: unknown;
  dtAtualizacao?: unknown;
}

interface JsonAdesaoPayload {
  data?: unknown;
  itens?: ItemAdesaoJson[];
}

interface RowData {
  UF?: unknown;
  MUNICÍPIO?: unknown;
  IBGE?: unknown;
  GESTÃO?: unknown;
  "NÚMERO DA SOLICITAÇÃO"?: unknown;
  PROGRAMA?: unknown;
  "SITUAÇÃO DA ADESÃO"?: unknown;
}

export async function transformGerenciaapsSolicitacoesAdesao(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "credenciamento-e-financiamento",
    "gerenciaaps-solicitacoes-adesao"
  );

  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch (error) {
    logger.error({ error, dirPath }, "Diretório não encontrado ou inacessível.");
    return;
  }

  await raw_db.delete(gerenciaapsSolicitacoesAdesao);

  const jsonFiles = files.filter((file) => file.endsWith(".json"));

  for (const file of jsonFiles) {
    const filePath = path.join(dirPath, file);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed: JsonAdesaoPayload = JSON.parse(content);
      const items = Array.isArray(parsed.itens) ? parsed.itens : [];

      if (items.length === 0) continue;

      const dataStr = parsed.data != null ? String(parsed.data).trim() : "";

      const records = items.map((item) => ({
        uf: item.sgUf != null ? String(item.sgUf).trim() : "",
        municipio: item.noMunicipioAcentuado != null ? String(item.noMunicipioAcentuado).trim() : "",
        ibge: item.coMunicipioIbge != null ? String(item.coMunicipioIbge).trim() : "",
        gestao: item.dsEsferaAdministrativa != null ? String(item.dsEsferaAdministrativa).trim() : "",
        numeroDaSolicitacao: item.nuSolicitacao != null ? String(item.nuSolicitacao).trim() : "",
        programa: item.dsEstrategia != null ? String(item.dsEstrategia).trim() : "",
        situacaoDaAdesao: item.dsSituacao != null ? String(item.dsSituacao).trim() : "",
        data: dataStr,
        sgEstrategia: item.sgEstrategia != null ? String(item.sgEstrategia).trim() : "",
        dtCadastro: item.dtCadastro != null ? String(item.dtCadastro).trim() : "",
        dtAtualizacao: item.dtAtualizacao != null ? String(item.dtAtualizacao).trim() : "",
      }));

      const batchSize = 1000;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await raw_db.insert(gerenciaapsSolicitacoesAdesao).values(batch);
      }

      logger.info({ file, count: records.length }, "Arquivo JSON processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo JSON.");
    }
  }

  const excelFiles = files.filter(
    (file) => file.endsWith(".xlsx") || file.endsWith(".xls")
  );

  for (const file of excelFiles) {
    const filePath = path.join(dirPath, file);
    try {
      const fileBuffer = await fs.readFile(filePath);
      const workbook = xlsx.read(fileBuffer, { type: "buffer" });

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;

        const rows = xlsx.utils.sheet_to_json<RowData>(worksheet, { defval: "" });
        if (rows.length === 0) continue;

        const records = rows
          .filter(
            (row) =>
              row.UF ||
              row.IBGE ||
              row.MUNICÍPIO ||
              row["NÚMERO DA SOLICITAÇÃO"] ||
              row.PROGRAMA
          )
          .map((row) => ({
            uf: String(row.UF ?? "").trim(),
            municipio: String(row.MUNICÍPIO ?? "").trim(),
            ibge: String(row.IBGE ?? "").trim(),
            gestao: String(row.GESTÃO ?? "").trim(),
            numeroDaSolicitacao: String(row["NÚMERO DA SOLICITAÇÃO"] ?? "").trim(),
            programa: String(row.PROGRAMA ?? "").trim(),
            situacaoDaAdesao: String(row["SITUAÇÃO DA ADESÃO"] ?? "").trim(),
            data: "",
            sgEstrategia: "",
            dtCadastro: "",
            dtAtualizacao: "",
          }));

        if (records.length === 0) continue;

        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db.insert(gerenciaapsSolicitacoesAdesao).values(batch);
        }
      }

      logger.info({ file }, "Arquivo processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo.");
    }
  }
}