// src/transformers/acoes-e-programas/acoesEProgramasAdesaoPseTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../database/raw_db/connection.js";
import { acoesEProgramasAdesaoPse } from "../../database/raw_db/schema.js";

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

export async function transformAcoesEProgramasAdesaoPse(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "ações-e-programas",
    "adesao-pse"
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

        const rawRows = xlsx.utils.sheet_to_json<unknown[]>(worksheet, {
          header: 1,
          defval: "",
        });

        let headerIdx = -1;
        for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
          const rowLine = (rawRows[i] ?? []).map((c) => String(c).trim());
          const normalized = rowLine.map(normalizeHeader);
          if (
            normalized.includes("uf") &&
            normalized.includes("ibge") &&
            normalized.includes("inep")
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
              getValue(row, "uf") ||
              getValue(row, "ibge") ||
              getValue(row, "inep")
          )
          .map((row) => ({
            uf: getValue(row, "uf"),
            municipio: getValue(row, "municipio"),
            ibge: getValue(row, "ibge"),
            ciclo: getValue(row, "ciclo"),
            tipoDeLocalizacao:
              getValue(row, "tipodelocalizacacao") ||
              getValue(row, "tipodelocalizacao"),
            localizacaoDiferenciada: getValue(row, "localizacaodiferenciada"),
            esferaAdministrativa: getValue(row, "esferaadministrativa"),
            inep: getValue(row, "inep"),
            nomeDaEscola: getValue(row, "nomedaescola"),
            quantidadeEducandos: getValue(row, "quantidadeeducandos"),
            quantidadeCreche: getValue(row, "quantidadecreche"),
            quantidadePreEscola: getValue(row, "quantidadepreescola"),
            quantidadeFundamental: getValue(row, "quantidadefundamental"),
            quantidadeMedio: getValue(row, "quantidademedio"),
            quantidadeProfissional: getValue(row, "quantidadeprofissional"),
            quantidadeEja: getValue(row, "quantidadeeja"),
            situacaoAdesao: getValue(row, "situacaoadesao"),
            parteDoGrupoPrioritario: getValue(row, "partedogrupoprioritario"),
            possuiMaisDe50DosEducandosNoBfa: getValue(
              row,
              "possuimaisde50doseducandosnobfa"
            ),
            participaDoSistemaNacionalDeAcompanhamentoDeMedidasSocioeducativas:
              getValue(
                row,
                "participadosistemanacionaldeacompanhamentodemedidassocioeducativas"
              ),
            participouDoNutrisus: getValue(row, "participoudonutrisus"),
            aderiuAoProgramaDeObesidade: getValue(
              row,
              "aderiuaoprogramadeobesidade"
            ),
          }));

        if (records.length === 0) continue;

        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db.insert(acoesEProgramasAdesaoPse).values(batch);
        }
      }

      logger.info({ file }, "Arquivo Adesão PSE processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo Adesão PSE.");
    }
  }
}