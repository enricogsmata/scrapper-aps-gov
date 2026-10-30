// src/transformers/acoes-e-programas/indicadoresAcompanhamentoPbfTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../../database/raw_db/connection.js";
import { indicadoresAcompanhamentoPbf } from "../../../database/raw_db/schema.js";

const logger = pino();

function normalizeHeader(key: string): string {
  return key
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function getValue(
  row: Record<string, unknown>,
  normalizedTarget: string
): string {
  for (const [key, value] of Object.entries(row)) {
    if (normalizeHeader(key) === normalizedTarget) {
      return value != null ? String(value).trim() : "";
    }
  }
  return "";
}

export async function transformindicadoresAcompanhamentoPbf(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "ações-e-programas",
    "relatorio-consolidado"
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

  await raw_db.delete(indicadoresAcompanhamentoPbf);

  for (const file of excelFiles) {
    const filePath = path.join(dirPath, file);
    try {
      const fileBuffer = await fs.readFile(filePath);
      const workbook = xlsx.read(fileBuffer, { type: "buffer" });

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;

        const rawRows = xlsx.utils.sheet_to_json<unknown[]>(worksheet, {
          header: 1,
          defval: "",
        });

        let headerIdx = -1;
        for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
          const rowLine = (rawRows[i] ?? []).map((c) => String(c).trim());
          const normalized = rowLine.map(normalizeHeader);
          if (
            normalized.includes("vigencia") &&
            normalized.includes("estado") &&
            normalized.includes("ibge")
          ) {
            headerIdx = i;
            break;
          }
        }

        if (headerIdx === -1) continue;

        const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
          range: headerIdx,
          defval: "",
        });

        if (rows.length === 0) continue;

        const records = rows
          .filter(
            (row) =>
              getValue(row, "vigencia") ||
              getValue(row, "estado") ||
              getValue(row, "ibge")
          )
          .map((row) => ({
            vigencia: getValue(row, "vigencia"),
            estado: getValue(row, "estado"),
            ibge: getValue(row, "ibge"),
            qtdBeneficiariosASeremAcompanhados: getValue(
              row,
              "qtdbeneficiariosaseremacompanhados"
            ),
            qtdBeneficiariosAcompanhados: getValue(
              row,
              "qtdbeneficiariosacompanhados"
            ),
            percCoberturaDeBeneficiariosAcompanhados: getValue(
              row,
              "perccoberturadebeneficiariosacompanhados"
            ),
            qtdCriancaASerAcompanhada: getValue(
              row,
              "qtdcriancaaseracompanhada"
            ),
            qtdCriancaAcompanhada: getValue(row, "qtdcriancaacompanhada"),
            percCoberturaDoAcompDeCriancas: getValue(
              row,
              "perccoberturadoacompdecriancas"
            ),
            qtdCriancaComVacEmDia: getValue(row, "qtdcriancacomvacemdia"),
            percCriancasComVacEmDia: getValue(
              row,
              "perccriancascomvacemdia"
            ),
            qtdCriancaComDadosNutricionais: getValue(
              row,
              "qtdcriancacomdadosnutricionais"
            ),
            percCriancasComDadosNutricionais: getValue(
              row,
              "perccriancascomdadosnutricionais"
            ),
            qtdGestantesEstimadas: getValue(row, "qtdgestantesestimadas"),
            qtdGestantesLocalizadas: getValue(row, "qtdgestanteslocalizadas"),
            percDeGestantesLocalizadasNoPbf: getValue(
              row,
              "percdegestanteslocalizadasnoepbf"
            ) || getValue(row, "percdegestanteslocalizadasnopbf"),
            qtdGestantesPreNatalEmDia: getValue(
              row,
              "qtdgestantesprenatalemdia"
            ),
            coberturaGestantesComPreNatalEmDia: getValue(
              row,
              "coberturagestantescomprenatalemdia"
            ),
            qtdGestantesComDadosNutric: getValue(
              row,
              "qtdgestantescomdadosnutric"
            ),
            percGestantesComDadosNutric: getValue(
              row,
              "percgestantescomdadosnutric"
            ),
          }));

        if (records.length === 0) continue;

        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db.insert(indicadoresAcompanhamentoPbf).values(batch);
        }
      }

      logger.info({ file }, "Arquivo Relatório Consolidado processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo Relatório Consolidado.");
    }
  }
}