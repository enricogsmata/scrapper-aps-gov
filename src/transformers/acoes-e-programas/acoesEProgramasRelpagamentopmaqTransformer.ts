// src/transformers/acoes-e-programas/acoesEProgramasRelpagamentopmaqTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../database/raw_db/connection.js";
import { acoesEProgramasRelpagamentopmaq } from "../../database/raw_db/schema.js";

const logger = pino();

interface RelpagamentopmaqRecord {
  competenciaCnes: string;
  competenciaFinanceira: string;
  uf: string;
  ibge: string;
  municipio: string;
  qntEsf: string;
  qntEsb: string;
  qntNasf: string;
  valorEsf: string;
  valorEsb: string;
  valorNasf: string;
  subtotal: string;
  desconto: string;
  total: string;
}

export async function transformAcoesEProgramasRelpagamentopmaq(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "ações-e-programas",
    "paginas-acessopublico-relatorios-relpagamentopmaq.xhtml"
  );

  logger.info({ dirPath }, "Iniciando processamento dos arquivos XLS de Relatório de Pagamento PMAQ.");

  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch (error) {
    logger.error({ error, dirPath }, "Diretório não encontrado ou inacessível.");
    return;
  }

  const excelFiles = files.filter(
    (file) => file.toLowerCase().endsWith(".xls") || file.toLowerCase().endsWith(".xlsx")
  );

  for (const file of excelFiles) {
    const filePath = path.join(dirPath, file);
    logger.info({ file }, "Processando arquivo XLS.");

    try {
      const fileBuffer = await fs.readFile(filePath);
      const workbook = xlsx.read(fileBuffer, { type: "buffer" });

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;

        const rows = xlsx.utils.sheet_to_json<unknown[]>(worksheet, {
          header: 1,
          defval: "",
        });

        if (rows.length === 0) continue;

        let headerRowIndex = -1;
        let colMap: Record<string, number> = {};

        for (let i = 0; i < rows.length; i++) {
          const row = (rows[i] as unknown[]).map((c) =>
            String(c ?? "")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .trim()
              .toLowerCase()
          );

          if (row.includes("competencia cnes") && row.includes("ibge")) {
            headerRowIndex = i;
            row.forEach((colName, idx) => {
              if (colName) colMap[colName] = idx;
            });
            break;
          }
        }

        if (headerRowIndex === -1) continue;

        const records: RelpagamentopmaqRecord[] = [];

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i] as unknown[];
          const getVal = (key: string): string => {
            const idx = colMap[key];
            if (idx === undefined) return "";
            const v = row[idx];
            return v !== undefined && v !== null ? String(v).trim() : "";
          };

          const competenciaCnes = getVal("competencia cnes");
          const ibge = getVal("ibge");
          const uf = getVal("uf");

          if (!competenciaCnes && !ibge && !uf) continue;

          records.push({
            competenciaCnes,
            competenciaFinanceira: getVal("competencia financeira"),
            uf,
            ibge,
            municipio: getVal("municipio"),
            qntEsf: getVal("qnt. esf"),
            qntEsb: getVal("qnt. esb"),
            qntNasf: getVal("qnt. nasf"),
            valorEsf: getVal("valor_esf"),
            valorEsb: getVal("valor_esb"),
            valorNasf: getVal("valor-nasf"),
            subtotal: getVal("subtotal"),
            desconto: getVal("desconto"),
            total: getVal("total"),
          });
        }

        if (records.length === 0) continue;

        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db.insert(acoesEProgramasRelpagamentopmaq).values(batch);
          logger.info({ file, sheetName, inserted: i + batch.length, total: records.length }, "Lote inserido com sucesso.");
        }
      }

      logger.info({ file }, "Arquivo processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo XLS.");
    }
  }

  logger.info("Processamento de Relatório de Pagamento PMAQ concluído.");
}