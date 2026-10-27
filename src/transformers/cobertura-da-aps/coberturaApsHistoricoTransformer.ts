// src/transformers/cobertura-da-aps/coberturaApsHistoricoTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../database/raw_db/connection.js";
import { coberturaApsHistorico } from "../../database/raw_db/schema.js";

const logger = pino();

interface RowData {
  "Competência CNES"?: unknown;
  População?: unknown;
  "Qt. eAP financiada"?: unknown;
  "Qt. eSF financiada"?: unknown;
  "Qt. Cadastros eAP financiadas"?: unknown;
  "Qt. Cadastros eSF financiadas"?: unknown;
  "Qt. Total de Cadastros (lim.pop.IBGE)"?: unknown;
  "Cobertura APS"?: unknown;
}

export async function transformCoberturaApsHistorico(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "cobertura-da-aps",
    "cobertura-aps",
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
              row["Competência CNES"] ||
              row.População ||
              row["Qt. eAP financiada"] ||
              row["Qt. eSF financiada"]
          )
          .map((row) => ({
            competenciaCnes: String(row["Competência CNES"] ?? "").trim(),
            populacao: String(row.População ?? "").trim(),
            qtEapFinanciada: String(row["Qt. eAP financiada"] ?? "").trim(),
            qtEsfFinanciada: String(row["Qt. eSF financiada"] ?? "").trim(),
            qtCadastrosEapFinanciadas: String(
              row["Qt. Cadastros eAP financiadas"] ?? ""
            ).trim(),
            qtCadastrosEsfFinanciadas: String(
              row["Qt. Cadastros eSF financiadas"] ?? ""
            ).trim(),
            qtTotalDeCadastrosLimPopIbge: String(
              row["Qt. Total de Cadastros (lim.pop.IBGE)"] ?? ""
            ).trim(),
            coberturaAps: String(row["Cobertura APS"] ?? "").trim(),
          }));

        if (records.length === 0) continue;

        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db.insert(coberturaApsHistorico).values(batch);
        }
      }

      logger.info({ file }, "Arquivo histórico processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo histórico.");
    }
  }
}