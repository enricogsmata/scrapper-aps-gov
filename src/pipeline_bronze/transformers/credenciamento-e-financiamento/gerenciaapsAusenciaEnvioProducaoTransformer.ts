// src/transformers/credenciamento-e-financiamento/gerenciaapsAusenciaEnvioProducaoTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../../database/raw_db/connection.js";
import { gerenciaapsAusenciaEnvioProducao } from "../../../database/raw_db/schema.js";

const logger = pino();

interface EquipeJson {
  coMunicipioIbge?: unknown;
  nuCompCnes?: unknown;
  dsSubTipoSuspensao?: unknown;
  qtCompetenciasConsecutivas?: unknown;
  sgUf?: unknown;
  noMunicipio?: unknown;
  coEquipe?: unknown;
  coTipoEquipe?: unknown;
}

interface JsonAusenciaPayload {
  dataGeracao?: unknown;
  equipes?: EquipeJson[];
}

interface RowData {
  "Comp. CNES"?: unknown;
  UF?: unknown;
  Município?: unknown;
  IBGE?: unknown;
  CNES?: unknown;
  "Tipo de Estabelecimento"?: unknown;
  Gestão?: unknown;
  "Situação do envio de produção"?: unknown;
}

export async function transformGerenciaapsAusenciaEnvioProducao(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "credenciamento-e-financiamento",
    "gerenciaaps-ausencia-envio-producao"
  );

  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch (error) {
    logger.error({ error, dirPath }, "Diretório não encontrado ou inacessível.");
    return;
  }

  await raw_db.delete(gerenciaapsAusenciaEnvioProducao);

  const jsonFiles = files.filter((file) => file.endsWith(".json"));
  const excelFiles = files.filter(
    (file) => file.endsWith(".xlsx") || file.endsWith(".xls")
  );

  for (const file of jsonFiles) {
    const filePath = path.join(dirPath, file);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed: JsonAusenciaPayload = JSON.parse(content);

      if (!Array.isArray(parsed.equipes) || parsed.equipes.length === 0) continue;

      const records = parsed.equipes.map((equipe) => ({
        compCnes: equipe.nuCompCnes != null ? String(equipe.nuCompCnes).trim() : "",
        uf: equipe.sgUf != null ? String(equipe.sgUf).trim() : "",
        municipio: equipe.noMunicipio != null ? String(equipe.noMunicipio).trim() : "",
        ibge: equipe.coMunicipioIbge != null ? String(equipe.coMunicipioIbge).trim() : "",
        cnes: "",
        tipoDeEstabelecimento: "",
        gestao: "",
        situacaoDoEnvioDeProducao: "",
      }));

      const batchSize = 1000;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await raw_db.insert(gerenciaapsAusenciaEnvioProducao).values(batch);
      }

      logger.info({ file, count: records.length }, "Arquivo JSON processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo JSON.");
    }
  }

  for (const file of excelFiles) {
    const filePath = path.join(dirPath, file);
    try {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) continue;

      const worksheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json<RowData>(worksheet, { defval: "" });

      if (rows.length === 0) continue;

      const records = rows.map((row) => ({
        compCnes: String(row["Comp. CNES"] ?? "").trim(),
        uf: String(row["UF"] ?? "").trim(),
        municipio: String(row["Município"] ?? "").trim(),
        ibge: String(row["IBGE"] ?? "").trim(),
        cnes: String(row["CNES"] ?? "").trim(),
        tipoDeEstabelecimento: String(row["Tipo de Estabelecimento"] ?? "").trim(),
        gestao: String(row["Gestão"] ?? "").trim(),
        situacaoDoEnvioDeProducao: String(row["Situação do envio de produção"] ?? "").trim(),
      }));

      const batchSize = 1000;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await raw_db.insert(gerenciaapsAusenciaEnvioProducao).values(batch);
      }

      logger.info({ file, count: records.length }, "Arquivo processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo.");
    }
  }
}