// src/transformers/cobertura-da-aps/relHistoricoPagamentoEsfTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { Readable } from "node:stream";
import AdmZip from "adm-zip";
import pino from "pino";
import { raw_db } from "../../database/raw_db/connection.js";
import { relHistoricoPagamentoEsf } from "../../database/raw_db/schema.js";

const logger = pino();

function parseLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function processCsvBuffer(csvBuffer: Buffer, fileName: string): Promise<void> {
  let content = csvBuffer.toString("utf-8");
  if (content.includes("\uFFFD")) {
    content = csvBuffer.toString("latin1");
  }

  const stream = Readable.from(content);
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let headers: string[] = [];
  let delimiter = ";";
  let records: (typeof relHistoricoPagamentoEsf.$inferInsert)[] = [];
  const batchSize = 1000;
  let totalInserted = 0;

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;

    if (headers.length === 0) {
      if (line.includes(";") && !line.includes(",")) {
        delimiter = ";";
      } else if (line.includes(",") && !line.includes(";")) {
        delimiter = ",";
      } else {
        delimiter = line.split(";").length >= line.split(",").length ? ";" : ",";
      }
      headers = parseLine(line, delimiter).map((h) => h.replace(/^\uFEFF/, "").trim());
      continue;
    }

    const values = parseLine(line, delimiter);
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = values[i]?.trim() ?? "";
    }

    records.push({
      ano: row.ANO ?? "",
      mes: row.MES ?? "",
      uf: row.UF ?? "",
      codigo: row["Código"] ?? row.Codigo ?? "",
      municipio: row["Município"] ?? row.Municipio ?? "",
      populacao: row.POPULACAO ?? row.Populacao ?? "",
      competencia: row["Competência"] ?? row.Competencia ?? "",
      tetoDeAcs: row["Teto de ACS"] ?? "",
      acsQualificados: row["ACS Qualificados"] ?? "",
      acsNoSiab: row["ACS no SIAB"] ?? "",
      acsImplantado: row["ACS Implantado"] ?? "",
      popAcs: row.Pop_ACS ?? "",
      pctAcs: row["%_ACS"] ?? "",
      incentivoAoPacs: row["Incentivo ao PACS"] ?? "",
      tetoDeEsf: row["Teto de ESF"] ?? "",
      esfQualificadas: row["ESF Qualificadas"] ?? "",
      esfNoSiab: row["ESF no SIAB"] ?? "",
      esfImplantada: row["ESF Implantada"] ?? "",
      pctCobertura: row["% Cobertura"] ?? "",
      popAcomp: row.Pop_Acomp ?? "",
      incentivoAoPsf: row["Incentivo ao PSF"] ?? "",
      iaPsf: row["IA PSF"] ?? "",
      esbMod1Qualificadas: row["ESB Mod 1 Qualificadas"] ?? "",
      esbMod1Siab: row["ESB Mod 1 SIAB"] ?? "",
      esbMod1Implantada: row["ESB Mod 1 Implantada"] ?? "",
      incentivoMod1: row["Incentivo Mod 1"] ?? "",
      esbMod2Qualificadas: row["ESB Mod 2 Qualificadas"] ?? "",
      esbMod2Siab: row["ESB Mod 2 SIAB"] ?? "",
      esbMod2Implantada: row["ESB Mod 2 Implantada"] ?? "",
      incentivoMod2: row["Incentivo Mod 2"] ?? "",
      popEsb: row.Pop_ESB ?? "",
      pctEsb: row["%_ESB"] ?? "",
      incentivoAdicional: row["Incentivo Adicional"] ?? "",
      nasf1Cred: row["NASF 1 Cred"] ?? "",
      nasf1Sistema: row["NASF 1 Sistema"] ?? "",
      nasf1Pago: row["NASF 1 Pago"] ?? "",
      nasf1Valor: row["NASF 1 Valor"] ?? "",
      nasf2Cred: row["NASF 2 Cred"] ?? "",
      nasf2Sistema: row["NASF 2 Sistema"] ?? "",
      nasf2Pago: row["NASF 2 Pago"] ?? "",
      nasf2Valor: row["NASF 2 Valor"] ?? "",
      nasf3Cred: row["NASF 3 Cred"] ?? "",
      nasf3Sistema: row["NASF 3 Sistema"] ?? "",
      nasf3Pago: row["NASF 3 Pago"] ?? "",
      nasf3Valor: row["NASF 3 Valor"] ?? "",
      nasfIncAdicional: row["NASF Inc Adicional"] ?? "",
      ufComp: row.UFComp ?? "",
      mun6: row.Mun6 ?? "",
    });

    if (records.length >= batchSize) {
      await raw_db.insert(relHistoricoPagamentoEsf).values(records);
      totalInserted += records.length;
      records = [];
    }
  }

  if (records.length > 0) {
    await raw_db.insert(relHistoricoPagamentoEsf).values(records);
    totalInserted += records.length;
  }

  logger.info({ fileName, totalInserted }, "CSV processado com sucesso.");
}

export async function transformRelHistoricoPagamentoEsf(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "cobertura-da-aps",
    "paginas-acessopublico-relatorios-relhistoricopagamentoindex.xhtml",
    "historico-esf"
  );

  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch (error) {
    logger.error({ error, dirPath }, "Diretório não encontrado ou inacessível.");
    return;
  }

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    try {
      if (file.endsWith(".zip")) {
        const fileBuffer = await fs.readFile(filePath);
        const zip = new AdmZip(fileBuffer);
        const zipEntries = zip.getEntries();

        for (const entry of zipEntries) {
          if (entry.isDirectory || !entry.entryName.toLowerCase().endsWith(".csv")) {
            continue;
          }
          const entryBuffer = entry.getData();
          await processCsvBuffer(entryBuffer, entry.entryName);
        }
      } else if (file.toLowerCase().endsWith(".csv")) {
        const fileBuffer = await fs.readFile(filePath);
        await processCsvBuffer(fileBuffer, file);
      }
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo histórico ESF.");
    }
  }
}