// src/transformers/credenciamento-e-financiamento/gerenciaapsPagamentoTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import { raw_db } from "../../database/raw_db/connection.js";
import { gerenciaapsPagamento } from "../../database/raw_db/schema.js";

const logger = pino();

interface PlanoOrcamentario {
  coSeqPlanoOrcamentario?: unknown;
  dsPlanoOrcamentario?: unknown;
  dsGestao?: unknown;
  vlTotalCusteio?: unknown;
  vlTotalImplantacao?: unknown;
}

interface Agrupamento {
  coUfIbge?: unknown;
  sgUf?: unknown;
  coMunicipioIbge?: unknown;
  noMunicipio?: unknown;
  nuCompCnes?: unknown;
  nuParcela?: unknown;
  coProcesso?: unknown;
  total?: unknown;
  listaPagamentoPlanoOrcamentario?: PlanoOrcamentario[];
}

interface JsonPayload {
  data?: unknown;
  agrupamentos?: Agrupamento[];
}

export async function transformGerenciaapsPagamento(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "credenciamento-e-financiamento",
    "gerenciaaps-pagamento"
  );

  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch (error) {
    logger.error({ error, dirPath }, "Diretório não encontrado ou inacessível.");
    return;
  }

  const jsonFiles = files.filter((file) => file.endsWith(".json"));

  for (const file of jsonFiles) {
    const filePath = path.join(dirPath, file);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed: JsonPayload = JSON.parse(content);

      const records: (typeof gerenciaapsPagamento.$inferInsert)[] = [];
      const dataStr = parsed.data != null ? String(parsed.data).trim() : "";

      if (Array.isArray(parsed.agrupamentos)) {
        for (const agrupamento of parsed.agrupamentos) {
          const coUfIbge = agrupamento.coUfIbge != null ? String(agrupamento.coUfIbge).trim() : "";
          const sgUf = agrupamento.sgUf != null ? String(agrupamento.sgUf).trim() : "";
          const coMunicipioIbge = agrupamento.coMunicipioIbge != null ? String(agrupamento.coMunicipioIbge).trim() : "";
          const noMunicipio = agrupamento.noMunicipio != null ? String(agrupamento.noMunicipio).trim() : "";
          const nuCompCnes = agrupamento.nuCompCnes != null ? String(agrupamento.nuCompCnes).trim() : "";
          const nuParcela = agrupamento.nuParcela != null ? String(agrupamento.nuParcela).trim() : "";
          const coProcesso = agrupamento.coProcesso != null ? String(agrupamento.coProcesso).trim() : "";
          const total = agrupamento.total != null ? String(agrupamento.total).trim() : "";

          const itens = agrupamento.listaPagamentoPlanoOrcamentario;
          if (Array.isArray(itens) && itens.length > 0) {
            for (const item of itens) {
              records.push({
                data: dataStr,
                coUfIbge,
                sgUf,
                coMunicipioIbge,
                noMunicipio,
                nuCompCnes,
                nuParcela,
                coProcesso,
                total,
                coSeqPlanoOrcamentario: item.coSeqPlanoOrcamentario != null ? String(item.coSeqPlanoOrcamentario).trim() : "",
                dsPlanoOrcamentario: item.dsPlanoOrcamentario != null ? String(item.dsPlanoOrcamentario).trim() : "",
                dsGestao: item.dsGestao != null ? String(item.dsGestao).trim() : "",
                vlTotalCusteio: item.vlTotalCusteio != null ? String(item.vlTotalCusteio).trim() : "",
                vlTotalImplantacao: item.vlTotalImplantacao != null ? String(item.vlTotalImplantacao).trim() : "",
              });
            }
          } else {
            records.push({
              data: dataStr,
              coUfIbge,
              sgUf,
              coMunicipioIbge,
              noMunicipio,
              nuCompCnes,
              nuParcela,
              coProcesso,
              total,
              coSeqPlanoOrcamentario: "",
              dsPlanoOrcamentario: "",
              dsGestao: "",
              vlTotalCusteio: "",
              vlTotalImplantacao: "",
            });
          }
        }
      }

      if (records.length === 0) continue;

      const batchSize = 1000;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await raw_db.insert(gerenciaapsPagamento).values(batch);
      }

      logger.info({ file, count: records.length }, "Arquivo processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo.");
    }
  }
}