// src/transformers/acoes-e-programas/acoesEProgramasIndicadorPrenatalTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import { raw_db } from "../../../database/raw_db/connection.js";
import { acoesEProgramasIndicadorPrenatal } from "../../../database/raw_db/schema.js";

const logger = pino();

interface IndicadorPrenatalRecord {
  competencia: string;
  totalGestantes: string;
}

export async function transformAcoesEProgramasIndicadorPrenatal(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "ações-e-programas",
    "indicador-prenatal"
  );

  logger.info({ dirPath }, "Iniciando processamento dos arquivos CSV de Indicador Pré-Natal.");

  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch (error) {
    logger.error({ error, dirPath }, "Diretório não encontrado ou inacessível.");
    return;
  }

  const csvFiles = files.filter((file) => file.toLowerCase().endsWith(".csv"));

  for (const file of csvFiles) {
    const filePath = path.join(dirPath, file);
    logger.info({ file }, "Processando arquivo CSV.");

    try {
      const buffer = await fs.readFile(filePath);
      const content = buffer.toString("latin1");
      const lines = content.split(/\r?\n/);

      let headerFound = false;
      const records: IndicadorPrenatalRecord[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const parts = trimmedLine.split(";").map((p) => p.trim());

        if (!headerFound) {
          const col0 = parts[0]?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const col1 = parts[1]?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

          if (col0 === "competencia" && col1 === "total gestantes") {
            headerFound = true;
          }
          continue;
        }

        if (
          trimmedLine.startsWith("Fonte:") ||
          trimmedLine.startsWith("Dado gerado em:") ||
          trimmedLine.startsWith("---")
        ) {
          break;
        }

        if (parts.length >= 2) {
          const competencia = parts[0] ?? "";
          const totalGestantes = parts[1] ?? "";

          if (competencia || totalGestantes) {
            records.push({
              competencia,
              totalGestantes,
            });
          }
        }
      }

      logger.info({ file, totalRecords: records.length }, "Extração de registros concluída.");

      if (records.length > 0) {
        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db.insert(acoesEProgramasIndicadorPrenatal).values(batch);
          logger.info({ file, inserted: i + batch.length, total: records.length }, "Lote inserido com sucesso.");
        }
      }

      logger.info({ file }, "Arquivo processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo CSV.");
    }
  }

  logger.info("Processamento de Indicador Pré-Natal concluído.");
}