// src/transformers/acoes-e-programas/acoesEProgramasHomologacaoSaudeComAgenteTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import { PDFExtract } from "pdf.js-extract";
import { raw_db } from "../../database/raw_db/connection.js";
import { acoesEProgramasHomologacaoSaudeComAgente } from "../../database/raw_db/schema.js";

const logger = pino();
const pdfExtract = new PDFExtract();

interface ExtractedRecord {
  ibge: string;
  municipio: string;
  uf: string;
  nomeDoAgente: string;
  curso: string;
  vinculo: string;
  dataDeFinalizacao: string;
}

export async function transformAcoesEProgramasHomologacaoSaudeComAgente(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "ações-e-programas",
    "listagem-saude-com-agente"
  );

  logger.info({ dirPath }, "Iniciando processamento de listagem Saúde com Agente em PDF.");

  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch (error) {
    logger.error({ error, dirPath }, "Diretório não encontrado ou inacessível.");
    return;
  }

  const pdfFiles = files.filter((file) => file.toLowerCase().endsWith(".pdf"));

  for (const file of pdfFiles) {
    const filePath = path.join(dirPath, file);
    logger.info({ file }, "Processando arquivo PDF.");

    try {
      const data = await pdfExtract.extract(filePath, {});
      const records: ExtractedRecord[] = [];

      for (const page of data.pages) {
        const linesMap = new Map<number, typeof page.content>();

        for (const item of page.content) {
          const text = item.str.trim();
          if (!text) continue;

          let matchedY: number | null = null;
          for (const y of linesMap.keys()) {
            if (Math.abs(y - item.y) <= 3) {
              matchedY = y;
              break;
            }
          }

          if (matchedY !== null) {
            linesMap.get(matchedY)!.push(item);
          } else {
            linesMap.set(item.y, [item]);
          }
        }

        const sortedYs = Array.from(linesMap.keys()).sort((a, b) => a - b);

        for (const y of sortedYs) {
          const items = linesMap.get(y)!.sort((a, b) => a.x - b.x);
          const fullLineText = items.map((it) => it.str.trim()).join(" ");

          if (
            fullLineText.includes("IBGE") ||
            fullLineText.includes("MAIS SAÚDE COM AGENTE") ||
            fullLineText.includes("Ministério da Saúde") ||
            fullLineText.includes("Secretaria de Gestão")
          ) {
            continue;
          }

          let ibge = "";
          let uf = "";
          let municipio = "";
          let nomeDoAgente = "";
          let curso = "";
          let vinculo = "";
          let dataDeFinalizacao = "";

          const dateItems = items.filter((it) =>
            /\d{1,2}\/\d{1,2}\/\d{4}/.test(it.str)
          );

          if (dateItems.length === 0) continue;

          const dateItem = dateItems[0];
          const datePart = items
            .filter((it) => it.x >= dateItem.x - 5)
            .map((it) => it.str.trim())
            .join(" ");

          dataDeFinalizacao = datePart;

          for (const item of items) {
            const val = item.str.trim();
            if (item.x < 100 && /^\d{6}$/.test(val)) {
              ibge = val;
            } else if (item.x >= 80 && item.x < 150 && /^[A-Z]{2}$/.test(val)) {
              uf = val;
            } else if (item.x >= 100 && item.x < 260 && !/^[A-Z]{2}$/.test(val) && !/^\d+$/.test(val)) {
              municipio += (municipio ? " " : "") + val;
            } else if (item.x >= 240 && item.x < 460) {
              nomeDoAgente += (nomeDoAgente ? " " : "") + val;
            } else if (item.x >= 450 && item.x < 700) {
              if (val === "SIM" || val === "NÃO" || val === "NAO") {
                vinculo = val;
              } else {
                curso += (curso ? " " : "") + val;
              }
            } else if (item.x >= 680 && item.x < dateItem.x - 5) {
              if (val === "SIM" || val === "NÃO" || val === "NAO") {
                vinculo = val;
              }
            }
          }

          if (ibge || nomeDoAgente) {
            records.push({
              ibge: ibge.trim(),
              municipio: municipio.trim(),
              uf: uf.trim(),
              nomeDoAgente: nomeDoAgente.trim(),
              curso: curso.trim(),
              vinculo: vinculo.trim(),
              dataDeFinalizacao: dataDeFinalizacao.trim(),
            });
          }
        }
      }

      logger.info({ file, total: records.length }, "Extração finalizada. Iniciando inserção no MySQL.");

      const batchSize = 1000;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await raw_db.insert(acoesEProgramasHomologacaoSaudeComAgente).values(batch);
        logger.info({ file, inserted: i + batch.length, total: records.length }, "Lote inserido com sucesso.");
      }

      logger.info({ file }, "Arquivo PDF processado e persistido integralmente.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo PDF.");
    }
  }

  logger.info("Processamento de arquivos concluído.");
}