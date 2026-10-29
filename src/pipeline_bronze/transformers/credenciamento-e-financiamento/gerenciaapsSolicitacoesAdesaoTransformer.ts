// src/transformers/credenciamento-e-financiamento/gerenciaapsSolicitacoesAdesaoTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../../database/raw_db/connection.js";
import { gerenciaapsSolicitacoesAdesao } from "../../../database/raw_db/schema.js";

const logger = pino();

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