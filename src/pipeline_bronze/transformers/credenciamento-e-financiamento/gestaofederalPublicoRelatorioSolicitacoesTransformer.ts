// src/transformers/credenciamento-e-financiamento/gestaofederalPublicoRelatorioSolicitacoesTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../../database/raw_db/connection.js";
import { gestaofederalPublicoRelatorioSolicitacoes } from "../../../database/raw_db/schema.js";

const logger = pino();

interface RowData {
  UF?: unknown;
  Município?: unknown;
  IBGE?: unknown;
  Estratégia?: unknown;
  "Qtde. Solicitada"?: unknown;
}

export async function transformGestaofederalPublicoRelatorioSolicitacoes(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "credenciamento-e-financiamento",
    "gestaofederal-publico-relatorio-solicitacoes"
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
          .filter((row) => row.UF || row.IBGE || row.Município || row.Estratégia)
          .map((row) => ({
            uf: String(row.UF ?? "").trim(),
            municipio: String(row.Município ?? "").trim(),
            ibge: String(row.IBGE ?? "").trim(),
            estrategia: String(row.Estratégia ?? "").trim(),
            qtdeSolicitada: String(row["Qtde. Solicitada"] ?? "").trim(),
          }));

        if (records.length === 0) continue;

        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db.insert(gestaofederalPublicoRelatorioSolicitacoes).values(batch);
        }
      }

      logger.info({ file }, "Arquivo processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo.");
    }
  }
}