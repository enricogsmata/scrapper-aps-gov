// src/transformers/cobertura-da-aps/coberturaSaudeBucalV2Transformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../database/raw_db/connection.js";
import { coberturaSaudeBucalV2 } from "../../database/raw_db/schema.js";

const logger = pino();

interface RowData {
  "Comp. CNES"?: unknown;
  População?: unknown;
  "Ano de Referência"?: unknown;
  "Qt. eSB 40h"?: unknown;
  "Qt. eSB 30h"?: unknown;
  "Qt. eSB 20h"?: unknown;
  "Qt. Parâmetro Cadastro Equipe SB"?: unknown;
  "Cobertura SB SF"?: unknown;
  "Qt. eSFR"?: unknown;
  "Qt. eCR"?: unknown;
  "Qt. eAPP"?: unknown;
  "Qt. SISAB Cadastro Equipe eSFR, eCR, eAPP"?: unknown;
  "Qt. Parametro Cadastro Equipe SB APS"?: unknown;
  "Cobertura SB APS"?: unknown;
}

export async function transformCoberturaSaudeBucalV2(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "cobertura-da-aps",
    "cobertura-saude-bucal-v2"
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
          .filter((row) => row["Comp. CNES"] || row.População || row["Qt. eSB 40h"])
          .map((row) => ({
            compCnes: String(row["Comp. CNES"] ?? "").trim(),
            populacao: String(row.População ?? "").trim(),
            anoDeReferencia: String(row["Ano de Referência"] ?? "").trim(),
            qtEsb40h: String(row["Qt. eSB 40h"] ?? "").trim(),
            qtEsb30h: String(row["Qt. eSB 30h"] ?? "").trim(),
            qtEsb20h: String(row["Qt. eSB 20h"] ?? "").trim(),
            qtParametroCadastroEquipeSb: String(
              row["Qt. Parâmetro Cadastro Equipe SB"] ?? ""
            ).trim(),
            coberturaSbSf: String(row["Cobertura SB SF"] ?? "").trim(),
            qtEsfr: String(row["Qt. eSFR"] ?? "").trim(),
            qtEcr: String(row["Qt. eCR"] ?? "").trim(),
            qtEapp: String(row["Qt. eAPP"] ?? "").trim(),
            qtSisabCadastroEquipeEsfrEcrEapp: String(
              row["Qt. SISAB Cadastro Equipe eSFR, eCR, eAPP"] ?? ""
            ).trim(),
            qtParametroCadastroEquipeSbAps: String(
              row["Qt. Parametro Cadastro Equipe SB APS"] ?? ""
            ).trim(),
            coberturaSbAps: String(row["Cobertura SB APS"] ?? "").trim(),
          }));

        if (records.length === 0) continue;

        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db.insert(coberturaSaudeBucalV2).values(batch);
        }
      }

      logger.info({ file }, "Arquivo processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo.");
    }
  }
}