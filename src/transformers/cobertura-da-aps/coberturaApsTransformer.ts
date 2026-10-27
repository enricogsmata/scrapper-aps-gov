// src/transformers/cobertura-da-aps/coberturaApsTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../database/raw_db/connection.js";
import { coberturaAps } from "../../database/raw_db/schema.js";

const logger = pino();

interface RowData {
  "Comp. CNES"?: unknown;
  População?: unknown;
  "Qt. eSF"?: unknown;
  "Qt. eAP 20hs"?: unknown;
  "Qt. eAP 30hs"?: unknown;
  "Qt. eCR"?: unknown;
  "Qt. Cadastro eCR"?: unknown;
  "Qt. eAPP 20hs"?: unknown;
  "Qt. Cadastro eAPP 20hs"?: unknown;
  "Qt. eAPP 30hs"?: unknown;
  "Qt. Cadastro eAPP 30hs"?: unknown;
  "Qt. eSFR"?: unknown;
  "Qt. Cadastro eSFR"?: unknown;
  "Qt. cadastros das eCR e eAPP"?: unknown;
  "Qt. capacidade da equipe"?: unknown;
  "Cobertura APS"?: unknown;
}

export async function transformCoberturaAps(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "cobertura-da-aps",
    "cobertura-aps"
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
          .filter((row) => row["Comp. CNES"] || row.População || row["Qt. eSF"])
          .map((row) => ({
            compCnes: String(row["Comp. CNES"] ?? "").trim(),
            populacao: String(row.População ?? "").trim(),
            qtEsf: String(row["Qt. eSF"] ?? "").trim(),
            qtEap20hs: String(row["Qt. eAP 20hs"] ?? "").trim(),
            qtEap30hs: String(row["Qt. eAP 30hs"] ?? "").trim(),
            qtEcr: String(row["Qt. eCR"] ?? "").trim(),
            qtCadastroEcr: String(row["Qt. Cadastro eCR"] ?? "").trim(),
            qtEapp20hs: String(row["Qt. eAPP 20hs"] ?? "").trim(),
            qtCadastroEapp20hs: String(row["Qt. Cadastro eAPP 20hs"] ?? "").trim(),
            qtEapp30hs: String(row["Qt. eAPP 30hs"] ?? "").trim(),
            qtCadastroEapp30hs: String(row["Qt. Cadastro eAPP 30hs"] ?? "").trim(),
            qtEsfr: String(row["Qt. eSFR"] ?? "").trim(),
            qtCadastroEsfr: String(row["Qt. Cadastro eSFR"] ?? "").trim(),
            qtCadastrosDasEcrEEapp: String(row["Qt. cadastros das eCR e eAPP"] ?? "").trim(),
            qtCapacidadeDaEquipe: String(row["Qt. capacidade da equipe"] ?? "").trim(),
            coberturaAps: String(row["Cobertura APS"] ?? "").trim(),
          }));

        if (records.length === 0) continue;

        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db.insert(coberturaAps).values(batch);
        }
      }

      logger.info({ file }, "Arquivo processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo.");
    }
  }
}