// src/transformers/siaps/siapsPublicoPraticasAssistenciaisTab4Transformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import { raw_db } from "../../database/raw_db/connection.js";
import { siapsPublicoPraticasAssistenciaisTab4 } from "../../database/raw_db/schema.js";

const logger = pino();

interface Tab4Record {
  brasil: string;
  semInformacao: string;
  esfEquipeDeSaudeDaFamilia: string;
  esfsbM1EsfComSaudeBucalMI: string;
  esfsbM2EsfComSaudeBucalMII: string;
  eacsEquipeDeAgentesComunitariosDeSaude: string;
  nasf1NucleoDeApoioASaudeDaFamiliaNasfModalidade1: string;
  nasf2NucleoDeApoioASaudeDaFamiliaNasfModalidade2: string;
  eacssbM1EqAgentesComunitariosComSaudeBucalMi: string;
  eacssbM2EqAgentesComunitariosComSaudeBucalMii: string;
  esfrsbMiEsfRibeirinhaComSaudeBucalMi: string;
  eab1EquipeDeAtencaoBasicaTipoI: string;
  eab1sbEquipeDeAtencaoBasicaTipoIComSaudeBucal: string;
  esf1EstrategiaDeSaudeDaFamiliaTipoI: string;
  esf1sbM1EsfTipoIComSaudeBucalModalidadeI: string;
  esf4EstrategiaDeSaudeDaFamiliaTipoIv: string;
  esf4sbM1EsfTipoIvComSaudeBucalModalidadeI: string;
  esf4sbM2EsfTipoIvComSaudeBucalModalidadeIi: string;
  esftransEsfTransitoria: string;
  esftranssbM1EsfTransitoriaComSaudeBucalMi: string;
  esftranssbM2EsfTransitoriaComSaudeBucalMii: string;
  ecrMiiEquipeDosConsultoriosNaRuaModalidadeIi: string;
  nasf3NucleoDeApoioASaudeDaFamiliaNasfModalidade3: string;
  total: string;
}

export async function transformSiapsPublicoPraticasAssistenciaisTab4(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "siaps",
    "publico-praticas-assistenciais",
    "tab-4"
  );

  logger.info(
    { dirPath },
    "Iniciando processamento dos arquivos CSV de SIAPS Práticas Assistenciais - Tab-4."
  );

  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch (error) {
    logger.error({ error, dirPath }, "Diretório não encontrado ou inacessível.");
    return;
  }

  const csvFiles = files.filter((file) => file.toLowerCase().endsWith(".csv"));

  for (const file of csvFiles) {
    const filePath = path.join(dirPath, file);
    logger.info({ file }, "Processando arquivo CSV.");

    try {
      const buffer = await fs.readFile(filePath);
      const content = buffer.toString("utf-8");
      const lines = content.split(/\r?\n/);

      let headerFound = false;
      const records: Tab4Record[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const parts = trimmedLine
          .split(";")
          .map((p) => p.replace(/^["']|["']$/g, "").trim());

        if (!headerFound) {
          const col0 = parts[0]?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const col1 = parts[1]?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

          if (col0 === "brasil" && col1.includes("sem informacao")) {
            headerFound = true;
          }
          continue;
        }

        if (
          trimmedLine.startsWith('"Fonte:') ||
          trimmedLine.startsWith("Fonte:") ||
          trimmedLine.startsWith("---")
        ) {
          break;
        }

        if (parts.length >= 24) {
          const brasil = parts[0] ?? "";
          if (brasil) {
            records.push({
              brasil,
              semInformacao: parts[1] ?? "",
              esfEquipeDeSaudeDaFamilia: parts[2] ?? "",
              esfsbM1EsfComSaudeBucalMI: parts[3] ?? "",
              esfsbM2EsfComSaudeBucalMII: parts[4] ?? "",
              eacsEquipeDeAgentesComunitariosDeSaude: parts[5] ?? "",
              nasf1NucleoDeApoioASaudeDaFamiliaNasfModalidade1: parts[6] ?? "",
              nasf2NucleoDeApoioASaudeDaFamiliaNasfModalidade2: parts[7] ?? "",
              eacssbM1EqAgentesComunitariosComSaudeBucalMi: parts[8] ?? "",
              eacssbM2EqAgentesComunitariosComSaudeBucalMii: parts[9] ?? "",
              esfrsbMiEsfRibeirinhaComSaudeBucalMi: parts[10] ?? "",
              eab1EquipeDeAtencaoBasicaTipoI: parts[11] ?? "",
              eab1sbEquipeDeAtencaoBasicaTipoIComSaudeBucal: parts[12] ?? "",
              esf1EstrategiaDeSaudeDaFamiliaTipoI: parts[13] ?? "",
              esf1sbM1EsfTipoIComSaudeBucalModalidadeI: parts[14] ?? "",
              esf4EstrategiaDeSaudeDaFamiliaTipoIv: parts[15] ?? "",
              esf4sbM1EsfTipoIvComSaudeBucalModalidadeI: parts[16] ?? "",
              esf4sbM2EsfTipoIvComSaudeBucalModalidadeIi: parts[17] ?? "",
              esftransEsfTransitoria: parts[18] ?? "",
              esftranssbM1EsfTransitoriaComSaudeBucalMi: parts[19] ?? "",
              esftranssbM2EsfTransitoriaComSaudeBucalMii: parts[20] ?? "",
              ecrMiiEquipeDosConsultoriosNaRuaModalidadeIi: parts[21] ?? "",
              nasf3NucleoDeApoioASaudeDaFamiliaNasfModalidade3: parts[22] ?? "",
              total: parts[23] ?? "",
            });
          }
        }
      }

      logger.info({ file, totalRecords: records.length }, "Extração de registros concluída.");

      if (records.length > 0) {
        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db
            .insert(siapsPublicoPraticasAssistenciaisTab4)
            .values(batch);
          logger.info(
            { file, inserted: i + batch.length, total: records.length },
            "Lote inserido com sucesso."
          );
        }
      }

      logger.info({ file }, "Arquivo processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo CSV.");
    }
  }

  logger.info("Processamento de Tab-4 concluído.");
}