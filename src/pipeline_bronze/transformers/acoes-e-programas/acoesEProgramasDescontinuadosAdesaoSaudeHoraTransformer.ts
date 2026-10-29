// src/transformers/acoes-e-programas/acoesEProgramasDescontinuadosAdesaoSaudeHoraTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../../database/raw_db/connection.js";
import { acoesEProgramasDescontinuadosAdesaoSaudeHora } from "../../../database/raw_db/schema.js";

const logger = pino();

interface AdesaoSaudeHoraRow {
  UF?: unknown;
  MUNICÍPIO?: unknown;
  MUNICIPIO?: unknown;
  IBGE?: unknown;
  CNES?: unknown;
  "TIPO DA ADESÃO"?: unknown;
  "TIPO DA ADESAO"?: unknown;
  "SITUAÇÃO DA ADESÃO"?: unknown;
  "SITUACAO DA ADESAO"?: unknown;
  "PORTARIA DE ADESÃO"?: unknown;
  "PORTARIA DE ADESAO"?: unknown;
  "PORTARIA DE CANCELAMENTO"?: unknown;
}

export async function transformAcoesEProgramasDescontinuadosAdesaoSaudeHora(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "ações-e-programas",
    "acoes-programas-descontinuados-adesao-saude-hora"
  );

  logger.info({ dirPath }, "Iniciando processamento dos arquivos XLSX de Adesão Saúde na Hora.");

  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch (error) {
    logger.error({ error, dirPath }, "Diretório não encontrado ou inacessível.");
    return;
  }

  const excelFiles = files.filter(
    (file) => file.toLowerCase().endsWith(".xlsx") || file.toLowerCase().endsWith(".xls")
  );

  for (const file of excelFiles) {
    const filePath = path.join(dirPath, file);
    logger.info({ file }, "Processando arquivo XLSX.");

    try {
      const fileBuffer = await fs.readFile(filePath);
      const workbook = xlsx.read(fileBuffer, { type: "buffer" });

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;

        const rows = xlsx.utils.sheet_to_json<AdesaoSaudeHoraRow>(worksheet, { defval: "" });
        if (rows.length === 0) continue;

        const records = rows
          .filter((row) => row.UF || row.MUNICÍPIO || row.MUNICIPIO || row.IBGE || row.CNES)
          .map((row) => ({
            uf: String(row.UF ?? "").trim(),
            municipio: String(row.MUNICÍPIO ?? row.MUNICIPIO ?? "").trim(),
            ibge: String(row.IBGE ?? "").trim(),
            cnes: String(row.CNES ?? "").trim(),
            tipoDaAdesao: String(row["TIPO DA ADESÃO"] ?? row["TIPO DA ADESAO"] ?? "").trim(),
            situacaoDaAdesao: String(row["SITUAÇÃO DA ADESÃO"] ?? row["SITUACAO DA ADESAO"] ?? "").trim(),
            portariaDeAdesao: String(row["PORTARIA DE ADESÃO"] ?? row["PORTARIA DE ADESAO"] ?? "").trim(),
            portariaDeCancelamento: String(row["PORTARIA DE CANCELAMENTO"] ?? "").trim(),
          }));

        if (records.length === 0) continue;

        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db.insert(acoesEProgramasDescontinuadosAdesaoSaudeHora).values(batch);
          logger.info({ file, sheetName, inserted: i + batch.length, total: records.length }, "Lote inserido com sucesso.");
        }
      }

      logger.info({ file }, "Arquivo processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo XLSX.");
    }
  }

  logger.info("Processamento de Adesão Saúde na Hora concluído.");
}