// src/transformers/cobertura-da-aps/relHistoricoPagamentoOutrosTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { Readable } from "node:stream";
import AdmZip from "adm-zip";
import pino from "pino";
import { raw_db } from "../../database/raw_db/connection.js";
import { relHistoricoPagamentoOutros } from "../../database/raw_db/schema.js";

const logger = pino();

function normalizeHeader(key: string): string {
  return key
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

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

function getValue(
  row: Record<string, string>,
  normalizedTarget: string
): string {
  for (const [key, value] of Object.entries(row)) {
    if (normalizeHeader(key) === normalizedTarget) {
      return value.trim();
    }
  }
  return "";
}

async function processCsvBuffer(
  csvBuffer: Buffer,
  fileName: string
): Promise<void> {
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
  let records: (typeof relHistoricoPagamentoOutros.$inferInsert)[] = [];
  const batchSize = 1000;
  let totalInserted = 0;

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;

    if (headers.length === 0) {
      const semicolonCount = (line.match(/;/g) || []).length;
      const commaCount = (line.match(/,/g) || []).length;
      const tabCount = (line.match(/\t/g) || []).length;

      if (tabCount > semicolonCount && tabCount > commaCount) {
        delimiter = "\t";
      } else if (commaCount > semicolonCount) {
        delimiter = ",";
      } else {
        delimiter = ";";
      }

      headers = parseLine(line, delimiter).map((h) =>
        h.replace(/^\uFEFF/, "").trim()
      );
      continue;
    }

    const values = parseLine(line, delimiter);
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = values[i]?.trim() ?? "";
    }

    records.push({
      ibge: getValue(row, "ibge"),
      uf: getValue(row, "uf"),
      municipio: getValue(row, "municipio"),
      financeira: getValue(row, "financeira"),
      cnrICreden: getValue(row, "cnricreden"),
      cnrIiCreden: getValue(row, "cnriicreden"),
      cnrIiiCreden: getValue(row, "cnriiicreden"),
      cnrIInformado: getValue(row, "cnriinformado"),
      cnrIiInformado: getValue(row, "cnriiinformado"),
      cnrIiiInformado: getValue(row, "cnriiiformado"),
      cnrIPago: getValue(row, "cnripago"),
      cnrIiPago: getValue(row, "cnriipago"),
      cnrIiiPago: getValue(row, "cnriiipago"),
      microscopistaCred: getValue(row, "microscopistacred"),
      microscopistaInformados: getValue(row, "microscopistainformados"),
      microscopistaPago: getValue(row, "microscopistapago"),
      uomCred: getValue(row, "uomcred"),
      uomInformado: getValue(row, "uominformado"),
      uomPago: getValue(row, "uompago"),
      ubsfCred: getValue(row, "ubsfcred"),
      ubsfsbCred: getValue(row, "ubsfsbcred"),
      ubsfComEsffInformado: getValue(row, "ubsfcomesffinformado"),
      ubsfComEsffsbInformado: getValue(row, "ubsfcomesffsbinformado"),
      ubsfComEsffMmInformado: getValue(row, "ubsfcomesffmminformado"),
      ubsfComEsffsbMmInformado: getValue(row, "ubsfcomesffsbmminformado"),
      ubsfPago: getValue(row, "ubsfpago"),
      gestaoCred: getValue(row, "gestaocred"),
      eabpCred: getValue(row, "eabpcred"),
      eabpInformado: getValue(row, "eabpinformado"),
      eabpPago: getValue(row, "eabppago"),
    });

    if (records.length >= batchSize) {
      await raw_db.insert(relHistoricoPagamentoOutros).values(records);
      totalInserted += records.length;
      records = [];
    }
  }

  if (records.length > 0) {
    await raw_db.insert(relHistoricoPagamentoOutros).values(records);
    totalInserted += records.length;
  }

  logger.info({ fileName, totalInserted }, "CSV processado com sucesso.");
}

export async function transformRelHistoricoPagamentoOutros(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "cobertura-da-aps",
    "paginas-acessopublico-relatorios-relhistoricopagamentoindex.xhtml",
    "historico-outros"
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
          if (
            entry.isDirectory ||
            !entry.entryName.toLowerCase().endsWith(".csv")
          ) {
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
      logger.error(
        { error, file },
        "Erro ao processar arquivo histórico Outros."
      );
    }
  }
}