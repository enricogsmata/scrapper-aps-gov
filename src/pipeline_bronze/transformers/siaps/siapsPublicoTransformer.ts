// src/transformers/siaps/siapsPublicoTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import { raw_db } from "../../../database/raw_db/connection.js";
import { siapsPublico } from "../../../database/raw_db/schema.js";

const logger = pino();

interface SiapsPublicoRecord {
  quadrimestreAno: string;
  uf: string;
  codigoIbge: string;
  municipio: string;
  tipoDeEquipe: string;
  dimensaoPorTipoDeEquipe: string;
  totalDeEquipeRegular: string;
  totalDeEquipeSuficiente: string;
  totalDeEquipeBom: string;
  totalDeEquipeOtimo: string;
}

export async function transformSiapsPublico(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "siaps",
    "publico"
  );

  logger.info({ dirPath }, "Iniciando processamento dos arquivos CSV de SIAPS Público.");

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
      const records: SiapsPublicoRecord[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const parts = trimmedLine
          .split(";")
          .map((p) => p.replace(/^["']|["']$/g, "").replace(/\t/g, "").trim());

        if (!headerFound) {
          const col0 = parts[0]?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const col1 = parts[1]?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

          if (col0 === "quadrimestre/ano" && col1 === "uf") {
            headerFound = true;
          }
          continue;
        }

        if (
          trimmedLine.startsWith("Fonte:") ||
          trimmedLine.startsWith('"Legenda') ||
          trimmedLine.startsWith('"Regular"') ||
          trimmedLine.startsWith('"Suficiente"') ||
          trimmedLine.startsWith('"Bom"') ||
          trimmedLine.startsWith('"Ótimo"') ||
          trimmedLine.startsWith('"Mais informacoes') ||
          trimmedLine.startsWith("---")
        ) {
          break;
        }

        if (parts.length >= 10) {
          const quadrimestreAno = parts[0] ?? "";
          const uf = parts[1] ?? "";
          const codigoIbge = parts[2] ?? "";
          const municipio = parts[3] ?? "";
          const tipoDeEquipe = parts[4] ?? "";
          const dimensaoPorTipoDeEquipe = parts[5] ?? "";
          const totalDeEquipeRegular = parts[6] ?? "";
          const totalDeEquipeSuficiente = parts[7] ?? "";
          const totalDeEquipeBom = parts[8] ?? "";
          const totalDeEquipeOtimo = parts[9] ?? "";

          if (quadrimestreAno || uf || codigoIbge || municipio) {
            records.push({
              quadrimestreAno,
              uf,
              codigoIbge,
              municipio,
              tipoDeEquipe,
              dimensaoPorTipoDeEquipe,
              totalDeEquipeRegular,
              totalDeEquipeSuficiente,
              totalDeEquipeBom,
              totalDeEquipeOtimo,
            });
          }
        }
      }

      logger.info({ file, totalRecords: records.length }, "Extração de registros concluída.");

      if (records.length > 0) {
        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db.insert(siapsPublico).values(batch);
          logger.info({ file, inserted: i + batch.length, total: records.length }, "Lote inserido com sucesso.");
        }
      }

      logger.info({ file }, "Arquivo processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo CSV.");
    }
  }

  logger.info("Processamento de SIAPS Público concluído.");
}