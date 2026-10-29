// src/transformers/cobertura-da-aps/coberturaSaudeBucalV2HistoricoTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../../database/raw_db/connection.js";
import { coberturaSaudeBucalV2Historico } from "../../../database/raw_db/schema.js";

const logger = pino();

interface RowData {
  "Comp. CNES"?: unknown;
  População?: unknown;
  "Nº eSFSB Cob."?: unknown;
  "Estim. Pop. Cob. ESFSB"?: unknown;
  "Cobertura ESFSB"?: unknown;
  "Estim. Pop. Cob. SB AB"?: unknown;
  "Cobertura SB AB"?: unknown;
}

export async function transformCoberturaSaudeBucalV2Historico(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "cobertura-da-aps",
    "cobertura-saude-bucal-v2",
    "historico"
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
              row["Comp. CNES"] ||
              row.População ||
              row["Nº eSFSB Cob."] ||
              row["Cobertura ESFSB"]
          )
          .map((row) => ({
            compCnes: String(row["Comp. CNES"] ?? "").trim(),
            populacao: String(row.População ?? "").trim(),
            numEsfsbCob: String(row["Nº eSFSB Cob."] ?? "").trim(),
            estimPopCobEsfsb: String(row["Estim. Pop. Cob. ESFSB"] ?? "").trim(),
            coberturaEsfsb: String(row["Cobertura ESFSB"] ?? "").trim(),
            estimPopCobSbAb: String(row["Estim. Pop. Cob. SB AB"] ?? "").trim(),
            coberturaSbAb: String(row["Cobertura SB AB"] ?? "").trim(),
          }));

        if (records.length === 0) continue;

        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db.insert(coberturaSaudeBucalV2Historico).values(batch);
        }
      }

      logger.info({ file }, "Arquivo histórico processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo histórico.");
    }
  }
}