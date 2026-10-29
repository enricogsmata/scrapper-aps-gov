// src/transformers/cobertura-da-aps/coberturaAcsTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../../database/raw_db/connection.js";
import { coberturaAcs } from "../../../database/raw_db/schema.js";

const logger = pino();

interface RowData {
  "Comp. CNES"?: unknown;
  Populacao?: unknown;
  População?: unknown;
  "Qt. ACS Ativa"?: unknown;
  "Qt. ACS Cobertura"?: unknown;
  "Qt. População Coberta"?: unknown;
  "Cobertura ACS"?: unknown;
}

export async function transformCoberturaAcs(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "cobertura-da-aps",
    "cobertura-acs"
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
          .filter((row) => row["Comp. CNES"] || row.Populacao || row.População || row["Qt. ACS Ativa"])
          .map((row) => ({
            compCnes: String(row["Comp. CNES"] ?? "").trim(),
            populacao: String(row.Populacao ?? row.População ?? "").trim(),
            qtAcsAtiva: String(row["Qt. ACS Ativa"] ?? "").trim(),
            qtAcsCobertura: String(row["Qt. ACS Cobertura"] ?? "").trim(),
            qtPopulacaoCoberta: String(row["Qt. População Coberta"] ?? "").trim(),
            coberturaAcs: String(row["Cobertura ACS"] ?? "").trim(),
          }));

        if (records.length === 0) continue;

        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db.insert(coberturaAcs).values(batch);
        }
      }

      logger.info({ file }, "Arquivo processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo.");
    }
  }
}