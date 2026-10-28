// src/transformers/siaps/siapsPublicoPraticasAssistenciaisTab1Transformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import { raw_db } from "../../database/raw_db/connection.js";
import { siapsPublicoPraticasAssistenciaisTab1 } from "../../database/raw_db/schema.js";

const logger = pino();

interface Tab1Record {
  brasil: string;
  masculino: string;
  feminino: string;
  total: string;
}

export async function transformSiapsPublicoPraticasAssistenciaisTab1(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "siaps",
    "publico-praticas-assistenciais",
    "tab-1"
  );

  logger.info(
    { dirPath },
    "Iniciando processamento dos arquivos CSV de SIAPS Práticas Assistenciais - Tab-1."
  );

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
      const content = buffer.toString("utf-8");
      const lines = content.split(/\r?\n/);

      let headerFound = false;
      const records: Tab1Record[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const parts = trimmedLine
          .split(";")
          .map((p) => p.replace(/^["']|["']$/g, "").trim());

        if (!headerFound) {
          const col0 = parts[0]?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const col1 = parts[1]?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const col2 = parts[2]?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const col3 = parts[3]?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

          if (
            col0 === "brasil" &&
            col1 === "masculino" &&
            col2 === "feminino" &&
            col3 === "total"
          ) {
            headerFound = true;
          }
          continue;
        }

        if (
          trimmedLine.startsWith('"Fonte:') ||
          trimmedLine.startsWith("Fonte:") ||
          trimmedLine.startsWith("---")
        ) {
          break;
        }

        if (parts.length >= 4) {
          const brasil = parts[0] ?? "";
          const masculino = parts[1] ?? "";
          const feminino = parts[2] ?? "";
          const total = parts[3] ?? "";

          if (brasil || masculino || feminino || total) {
            records.push({
              brasil,
              masculino,
              feminino,
              total,
            });
          }
        }
      }

      logger.info({ file, totalRecords: records.length }, "Extração de registros concluída.");

      if (records.length > 0) {
        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db
            .insert(siapsPublicoPraticasAssistenciaisTab1)
            .values(batch);
          logger.info(
            { file, inserted: i + batch.length, total: records.length },
            "Lote inserido com sucesso."
          );
        }
      }

      logger.info({ file }, "Arquivo processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo CSV.");
    }
  }

  logger.info("Processamento de Tab-1 concluído.");
}