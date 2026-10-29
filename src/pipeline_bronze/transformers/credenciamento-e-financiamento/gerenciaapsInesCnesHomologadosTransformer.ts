// src/transformers/credenciamento-e-financiamento/gerenciaapsInesCnesHomologadosTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../../database/raw_db/connection.js";
import { gerenciaapsInesCnesHomologados } from "../../../database/raw_db/schema.js";

const logger = pino();

interface RowData {
  UF?: unknown;
  MUNICÍPIO?: unknown;
  IBGE?: unknown;
  INE?: unknown;
  "CÓDIGO DO TIPO DE EQUIPE"?: unknown;
  "TIPO DE EQUIPE"?: unknown;
  "SUBTIPO DE EQUIPE"?: unknown;
  PORTARIA?: unknown;
  "ESFERA ADMINISTRATIVA"?: unknown;
}

export async function transformGerenciaapsInesCnesHomologados(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "credenciamento-e-financiamento",
    "gerenciaaps-ines-cnes-homologados"
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
      const workbook = xlsx.readFile(filePath);

      for (const sheetName of workbook.SheetNames) {
        if (sheetName === "Dicionário de Dados" || sheetName === "Estabelecimentos") {
          continue;
        }

        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;

        const rows = xlsx.utils.sheet_to_json<RowData>(worksheet, { defval: "" });
        if (rows.length === 0) continue;

        const records = rows
          .filter((row) => row.INE || row.UF || row.IBGE)
          .map((row) => ({
            uf: String(row.UF ?? "").trim(),
            municipio: String(row.MUNICÍPIO ?? "").trim(),
            ibge: String(row.IBGE ?? "").trim(),
            ine: String(row.INE ?? "").trim(),
            codigoDoTipoDeEquipe: String(row["CÓDIGO DO TIPO DE EQUIPE"] ?? "").trim(),
            tipoDeEquipe: String(row["TIPO DE EQUIPE"] ?? "").trim(),
            subtipoDeEquipe: String(row["SUBTIPO DE EQUIPE"] ?? "").trim(),
            portaria: String(row.PORTARIA ?? "").trim(),
            esferaAdministrativa: String(row["ESFERA ADMINISTRATIVA"] ?? "").trim(),
          }));

        if (records.length === 0) continue;

        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db.insert(gerenciaapsInesCnesHomologados).values(batch);
        }
      }

      logger.info({ file }, "Arquivo processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo.");
    }
  }
}