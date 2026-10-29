// src/pipeline_silver/transformers/siaps_publico_praticas_assistenciais_tab_4.ts
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { siapsPraticasPorTipoEquipe } from "../../database/db/schema.js";
import { siapsPublicoPraticasAssistenciaisTab4 as sourceSiapsTab4 } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

function parseIntSafe(val: string | null): number | undefined {
  if (!val) return undefined;
  const parsed = parseInt(val.replace(/\D/g, ""), 10);
  return isNaN(parsed) ? undefined : parsed;
}

export async function transformSiapsPublicoPraticasAssistenciaisTab4(): Promise<void> {
  const log = logger.forMethod("transformSiapsPublicoPraticasAssistenciaisTab4");

  try {
    log.info({ data: [] }, "Iniciando extração de siaps_publico_praticas_assistenciais_tab_4 do raw_db");

    const rawData = await raw_db.select().from(sourceSiapsTab4);

    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const fatosToInsert = rawData.map((row) => ({
      abrangencia: row.brasil || "Brasil",
      semInformacao: parseIntSafe(row.semInformacao),
      esfEquipeDeSaudeDaFamilia: parseIntSafe(row.esfEquipeDeSaudeDaFamilia),
      esfsbM1EsfComSaudeBucalMI: parseIntSafe(row.esfsbM1EsfComSaudeBucalMI),
      esfsbM2EsfComSaudeBucalMII: parseIntSafe(row.esfsbM2EsfComSaudeBucalMII),
      eacsEquipeDeAgentesComunitariosDeSaude: parseIntSafe(row.eacsEquipeDeAgentesComunitariosDeSaude),
      nasf1NucleoDeApoioASaudeDaFamiliaNasfModalidade1: parseIntSafe(row.nasf1NucleoDeApoioASaudeDaFamiliaNasfModalidade1),
      nasf2NucleoDeApoioASaudeDaFamiliaNasfModalidade2: parseIntSafe(row.nasf2NucleoDeApoioASaudeDaFamiliaNasfModalidade2),
      eacssbM1EqAgentesComunitariosComSaudeBucalMi: parseIntSafe(row.eacssbM1EqAgentesComunitariosComSaudeBucalMi),
      eacssbM2EqAgentesComunitariosComSaudeBucalMii: parseIntSafe(row.eacssbM2EqAgentesComunitariosComSaudeBucalMii),
      esfrsbMiEsfRibeirinhaComSaudeBucalMi: parseIntSafe(row.esfrsbMiEsfRibeirinhaComSaudeBucalMi),
      eab1EquipeDeAtencaoBasicaTipoI: parseIntSafe(row.eab1EquipeDeAtencaoBasicaTipoI),
      eab1sbEquipeDeAtencaoBasicaTipoIComSaudeBucal: parseIntSafe(row.eab1sbEquipeDeAtencaoBasicaTipoIComSaudeBucal),
      esf1EstrategiaDeSaudeDaFamiliaTipoI: parseIntSafe(row.esf1EstrategiaDeSaudeDaFamiliaTipoI),
      esf1sbM1EsfTipoIComSaudeBucalModalidadeI: parseIntSafe(row.esf1sbM1EsfTipoIComSaudeBucalModalidadeI),
      esf4EstrategiaDeSaudeDaFamiliaTipoIv: parseIntSafe(row.esf4EstrategiaDeSaudeDaFamiliaTipoIv),
      esf4sbM1EsfTipoIvComSaudeBucalModalidadeI: parseIntSafe(row.esf4sbM1EsfTipoIvComSaudeBucalModalidadeI),
      esf4sbM2EsfTipoIvComSaudeBucalModalidadeIi: parseIntSafe(row.esf4sbM2EsfTipoIvComSaudeBucalModalidadeIi),
      esftransEsfTransitoria: parseIntSafe(row.esftransEsfTransitoria),
      esftranssbM1EsfTransitoriaComSaudeBucalMi: parseIntSafe(row.esftranssbM1EsfTransitoriaComSaudeBucalMi),
      esftranssbM2EsfTransitoriaComSaudeBucalMii: parseIntSafe(row.esftranssbM2EsfTransitoriaComSaudeBucalMii),
      ecrMiiEquipeDosConsultoriosNaRuaModalidadeIi: parseIntSafe(row.ecrMiiEquipeDosConsultoriosNaRuaModalidadeIi),
      nasf3NucleoDeApoioASaudeDaFamiliaNasfModalidade3: parseIntSafe(row.nasf3NucleoDeApoioASaudeDaFamiliaNasfModalidade3),
      total: parseIntSafe(row.total),
    }));

    log.info({ data: [{ fatos: fatosToInsert.length }] }, "Iniciando carga idempotente na tabela fato");

    const chunkSize = 1000;

    await db.delete(siapsPraticasPorTipoEquipe);

    for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
      await db.insert(siapsPraticasPorTipoEquipe).values(fatosToInsert.slice(i, i + chunkSize));
    }

    log.info({ data: [] }, "Transformação e carga de siaps_publico_praticas_assistenciais_tab_4 concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de siaps_publico_praticas_assistenciais_tab_4");
    throw error;
  }
}