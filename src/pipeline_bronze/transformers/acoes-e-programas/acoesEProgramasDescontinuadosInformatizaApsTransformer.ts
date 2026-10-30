// src/transformers/acoes-e-programas/acoesEProgramasDescontinuadosInformatizaApsTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../../database/raw_db/connection.js";
import { acoesEProgramasDescontinuadosInformatizaAps } from "../../../database/raw_db/schema.js";

const logger = pino();

interface InformatizaApsJsonRow {
  sgUf?: unknown;
  noMunicipio?: unknown;
  coMunicipioIbge?: unknown;
  coEquipe?: unknown;
  coTipoEquipe?: unknown;
  subtipoEquipe?: unknown;
  situacao?: unknown;
  portariaHomologacao?: unknown;
  portariaCancelamento?: unknown;
}

interface InformatizaApsRow {
  UF?: unknown;
  MUNICÍPIO?: unknown;
  MUNICIPIO?: unknown;
  IBGE?: unknown;
  INE?: unknown;
  "TIPO DA EQUIPE"?: unknown;
  "SUBTIPO DA EQUIPE"?: unknown;
  SITUAÇÃO?: unknown;
  SITUACAO?: unknown;
  "PORTARIA DE HOMOLOGAÇÃO"?: unknown;
  "PORTARIA DE HOMOLOGACAO"?: unknown;
  "PORTARIA DE CANCELAMENTO"?: unknown;
}

export async function transformAcoesEProgramasDescontinuadosInformatizaAps(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "ações-e-programas",
    "acoes-programas-descontinuados-informatiza-aps"
  );

  logger.info({ dirPath }, "Iniciando processamento dos arquivos XLSX de Informatiza APS.");

  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch (error) {
    logger.error({ error, dirPath }, "Diretório não encontrado ou inacessível.");
    return;
  }

  await raw_db.delete(acoesEProgramasDescontinuadosInformatizaAps);

  const jsonFiles = files.filter((file) => file.toLowerCase().endsWith(".json"));
  const excelFiles = files.filter(
    (file) => file.toLowerCase().endsWith(".xlsx") || file.toLowerCase().endsWith(".xls")
  );

  for (const file of jsonFiles) {
    const filePath = path.join(dirPath, file);
    logger.info({ file }, "Processando arquivo JSON.");

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed: unknown = JSON.parse(content);
      const rows: InformatizaApsJsonRow[] = Array.isArray(parsed) ? parsed : [];

      if (rows.length === 0) continue;

      const records = rows.map((row) => ({
        uf: row.sgUf != null ? String(row.sgUf).trim() : "",
        municipio: row.noMunicipio != null ? String(row.noMunicipio).trim() : "",
        ibge: row.coMunicipioIbge != null ? String(row.coMunicipioIbge).trim() : "",
        ine: row.coEquipe != null ? String(row.coEquipe).trim() : "",
        tipoDaEquipe: row.coTipoEquipe != null ? String(row.coTipoEquipe).trim() : "",
        subtipoDaEquipe: row.subtipoEquipe != null ? String(row.subtipoEquipe).trim() : "",
        situacao: row.situacao != null ? String(row.situacao).trim() : "",
        portariaDeHomologacao: row.portariaHomologacao != null ? String(row.portariaHomologacao).trim() : "",
        portariaDeCancelamento: row.portariaCancelamento != null ? String(row.portariaCancelamento).trim() : "",
      }));

      const batchSize = 1000;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await raw_db.insert(acoesEProgramasDescontinuadosInformatizaAps).values(batch);
        logger.info({ file, inserted: i + batch.length, total: records.length }, "Lote inserido com sucesso.");
      }

      logger.info({ file, count: records.length }, "Arquivo JSON processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo JSON.");
    }
  }

  for (const file of excelFiles) {
    const filePath = path.join(dirPath, file);
    logger.info({ file }, "Processando arquivo XLSX.");

    try {
      const fileBuffer = await fs.readFile(filePath);
      const workbook = xlsx.read(fileBuffer, { type: "buffer" });

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;

        const rows = xlsx.utils.sheet_to_json<InformatizaApsRow>(worksheet, { defval: "" });
        if (rows.length === 0) continue;

        const records = rows
          .filter((row) => row.UF || row.MUNICÍPIO || row.MUNICIPIO || row.IBGE || row.INE)
          .map((row) => ({
            uf: String(row.UF ?? "").trim(),
            municipio: String(row.MUNICÍPIO ?? row.MUNICIPIO ?? "").trim(),
            ibge: String(row.IBGE ?? "").trim(),
            ine: String(row.INE ?? "").trim(),
            tipoDaEquipe: String(row["TIPO DA EQUIPE"] ?? "").trim(),
            subtipoDaEquipe: String(row["SUBTIPO DA EQUIPE"] ?? "").trim(),
            situacao: String(row.SITUAÇÃO ?? row.SITUACAO ?? "").trim(),
            portariaDeHomologacao: String(
              row["PORTARIA DE HOMOLOGAÇÃO"] ?? row["PORTARIA DE HOMOLOGACAO"] ?? ""
            ).trim(),
            portariaDeCancelamento: String(row["PORTARIA DE CANCELAMENTO"] ?? "").trim(),
          }));

        if (records.length === 0) continue;

        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db.insert(acoesEProgramasDescontinuadosInformatizaAps).values(batch);
          logger.info({ file, sheetName, inserted: i + batch.length, total: records.length }, "Lote inserido com sucesso.");
        }
      }

      logger.info({ file }, "Arquivo processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo XLSX.");
    }
  }

  logger.info("Processamento de Informatiza APS concluído.");
}