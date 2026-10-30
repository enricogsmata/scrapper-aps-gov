// src/transformers/credenciamento-e-financiamento/gestaofederalPublicoRelatorioSolicitacoesTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../../database/raw_db/connection.js";
import { gestaofederalPublicoRelatorioSolicitacoes } from "../../../database/raw_db/schema.js";

const logger = pino();


interface JsonItem {
  sgUf?: unknown;
  coMunicipioIbge?: unknown;
  noMunicipioAcentuado?: unknown;
  coAcaoEstrategica?: unknown;
  dsAcaoEstrategica?: unknown;
  qtTeto?: unknown;
  qtCredenciado?: unknown;
  qtSolicitado?: unknown;
  qtSaldo?: unknown;
  aplicavelTeto?: unknown;
  aplicavelSaldo?: unknown;
  qtMedicinaSolicitada?: unknown;
  qtEnfermagemSolicitada?: unknown;
  qtOdontologiaSolicitada?: unknown;
  qtMultiprofissionalSolicitada?: unknown;
}

interface JsonPayload {
  dtGeracao?: unknown;
  itens?: JsonItem[];
}

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

  await raw_db.delete(gestaofederalPublicoRelatorioSolicitacoes);

  const jsonFiles = files.filter((file) => file.endsWith(".json"));

  for (const file of jsonFiles) {
    const filePath = path.join(dirPath, file);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed: JsonPayload = JSON.parse(content);
      const items = Array.isArray(parsed.itens) ? parsed.itens : [];

      if (items.length === 0) continue;

      const records = items.map((item) => ({
        uf: item.sgUf != null ? String(item.sgUf).trim() : "",
        municipio: item.noMunicipioAcentuado != null ? String(item.noMunicipioAcentuado).trim() : "",
        ibge: item.coMunicipioIbge != null ? String(item.coMunicipioIbge).trim() : "",
        estrategia: item.dsAcaoEstrategica != null ? String(item.dsAcaoEstrategica).trim() : "",
        qtdeSolicitada: item.qtSolicitado != null ? String(item.qtSolicitado).trim() : "",
        codigoAcaoEstrategica: item.coAcaoEstrategica != null ? String(item.coAcaoEstrategica).trim() : "",
        qtTeto: item.qtTeto != null ? String(item.qtTeto).trim() : "",
        qtCredenciado: item.qtCredenciado != null ? String(item.qtCredenciado).trim() : "",
        qtSaldo: item.qtSaldo != null ? String(item.qtSaldo).trim() : "",
        aplicavelTeto: item.aplicavelTeto != null ? String(item.aplicavelTeto).trim() : "",
        aplicavelSaldo: item.aplicavelSaldo != null ? String(item.aplicavelSaldo).trim() : "",
        qtMedicinaSolicitada: item.qtMedicinaSolicitada != null ? String(item.qtMedicinaSolicitada).trim() : "",
        qtEnfermagemSolicitada: item.qtEnfermagemSolicitada != null ? String(item.qtEnfermagemSolicitada).trim() : "",
        qtOdontologiaSolicitada: item.qtOdontologiaSolicitada != null ? String(item.qtOdontologiaSolicitada).trim() : "",
        qtMultiprofissionalSolicitada: item.qtMultiprofissionalSolicitada != null ? String(item.qtMultiprofissionalSolicitada).trim() : "",
      }));

      const batchSize = 1000;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await raw_db.insert(gestaofederalPublicoRelatorioSolicitacoes).values(batch);
      }

      logger.info({ file, count: records.length }, "Arquivo JSON processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo JSON.");
    }
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
            codigoAcaoEstrategica: "",
            qtTeto: "",
            qtCredenciado: "",
            qtSaldo: "",
            aplicavelTeto: "",
            aplicavelSaldo: "",
            qtMedicinaSolicitada: "",
            qtEnfermagemSolicitada: "",
            qtOdontologiaSolicitada: "",
            qtMultiprofissionalSolicitada: "",
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