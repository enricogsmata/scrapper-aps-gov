// src/transformers/acoes-e-programas/acoesEProgramasIndicadorCadastroTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import { raw_db } from "../../../database/raw_db/connection.js";
import { acoesEProgramasIndicadorCadastro } from "../../../database/raw_db/schema.js";

const logger = pino();

interface IndicadorCadastroRecord {
  competencia: string;
  total: string;
}

export async function transformAcoesEProgramasIndicadorCadastro(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "ações-e-programas",
    "indicador-cadastro"
  );

  logger.info({ dirPath }, "Iniciando processamento dos arquivos CSV de Indicador Cadastro.");

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
      let competenciaHeader = "";
      const records: IndicadorCadastroRecord[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const parts = trimmedLine.split(";").map((p) => p.trim());

        if (!headerFound) {
          const col0 = parts[0] ?? "";
          if (col0.includes("(DESCONTINUADO)")) {
            headerFound = true;
            competenciaHeader = col0;
          }
          continue;
        }

        if (
          trimmedLine.startsWith("Fonte:") ||
          trimmedLine.startsWith("Dado gerado em:") ||
          trimmedLine.startsWith("MS/SAPS") ||
          trimmedLine.startsWith("---")
        ) {
          break;
        }

        const total = parts[0] ?? "";
        if (total) {
          records.push({
            competencia: competenciaHeader,
            total,
          });
        }
      }

      logger.info({ file, totalRecords: records.length }, "Extração de registros concluída.");

      if (records.length > 0) {
        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db.insert(acoesEProgramasIndicadorCadastro).values(batch);
          logger.info({ file, inserted: i + batch.length, total: records.length }, "Lote inserido com sucesso.");
        }
      }

      logger.info({ file }, "Arquivo processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo CSV.");
    }
  }

  logger.info("Processamento de Indicador Cadastro concluído.");
}