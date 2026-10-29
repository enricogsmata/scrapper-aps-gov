// src/pipeline_silver/transformers/cobertura_saude_bucal_v2_historico.ts
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { coberturaSaudeBucalV2Historico as targetCoberturaSaudeBucalV2Historico } from "../../database/db/schema.js";
import { coberturaSaudeBucalV2Historico as sourceCoberturaSaudeBucalV2Historico } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

function parseIntSafe(val: string | null): number | undefined {
  if (!val) return undefined;
  const parsed = parseInt(val.replace(/\D/g, ""), 10);
  return isNaN(parsed) ? undefined : parsed;
}

function parseDecimalSafe(val: string | null): string | undefined {
  if (!val) return undefined;
  const parsed = parseFloat(val.replace(/\./g, "").replace(",", "."));
  return isNaN(parsed) ? undefined : parsed.toString();
}

export async function transformCoberturaSaudeBucalV2Historico(): Promise<void> {
  const log = logger.forMethod("transformCoberturaSaudeBucalV2Historico");

  try {
    log.info({ data: [] }, "Iniciando extração de cobertura_saude_bucal_v2_historico do raw_db");

    const rawData = await raw_db.select().from(sourceCoberturaSaudeBucalV2Historico);
    
    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const fatosToInsert = rawData.map(row => {
      return {
        compCnes: row.compCnes || "NI",
        populacao: parseIntSafe(row.populacao),
        numEsfsbCob: parseIntSafe(row.numEsfsbCob),
        estimPopCobEsfsb: parseIntSafe(row.estimPopCobEsfsb),
        coberturaEsfsbPercentual: parseDecimalSafe(row.coberturaEsfsb),
        estimPopCobSbAb: parseIntSafe(row.estimPopCobSbAb),
        coberturaSbAbPercentual: parseDecimalSafe(row.coberturaSbAb),
      };
    });

    log.info({ 
      data: [{ fatos: fatosToInsert.length }] 
    }, "Iniciando inserção na tabela fato");

    const chunkSize = 1000;

    // CLEAN & INSERT Fatos (Garante idempotência, visto que não há chaves compostas restritivas na fato)
    await db.delete(targetCoberturaSaudeBucalV2Historico);
    
    for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
      await db.insert(targetCoberturaSaudeBucalV2Historico)
        .values(fatosToInsert.slice(i, i + chunkSize));
    }

    log.info({ data: [] }, "Transformação e carga de cobertura_saude_bucal_v2_historico concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de cobertura_saude_bucal_v2_historico");
    throw error;
  }
}