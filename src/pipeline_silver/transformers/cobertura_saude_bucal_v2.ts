// src/pipeline_silver/transformers/cobertura_saude_bucal_v2.ts
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { coberturaSaudeBucalV2 as targetCoberturaSaudeBucalV2 } from "../../database/db/schema.js";
import { coberturaSaudeBucalV2 as sourceCoberturaSaudeBucalV2 } from "../../database/raw_db/schema.js";
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

export async function transformCoberturaSaudeBucalV2(): Promise<void> {
  const log = logger.forMethod("transformCoberturaSaudeBucalV2");

  try {
    log.info({ data: [] }, "Iniciando extração de cobertura_saude_bucal_v2 do raw_db");

    const rawData = await raw_db.select().from(sourceCoberturaSaudeBucalV2);
    
    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const fatosToInsert = rawData.map(row => {
      return {
        compCnes: row.compCnes || "NI",
        populacao: parseIntSafe(row.populacao),
        anoDeReferencia: parseIntSafe(row.anoDeReferencia),
        qtEsb40h: parseIntSafe(row.qtEsb40h),
        qtEsb30h: parseIntSafe(row.qtEsb30h),
        qtEsb20h: parseIntSafe(row.qtEsb20h),
        qtParametroCadastroEquipeSb: parseIntSafe(row.qtParametroCadastroEquipeSb),
        coberturaSbSfPercentual: parseDecimalSafe(row.coberturaSbSf),
        qtEsfr: parseIntSafe(row.qtEsfr),
        qtEcr: parseIntSafe(row.qtEcr),
        qtEapp: parseIntSafe(row.qtEapp),
        qtSisabCadastroEquipeEsfrEcrEapp: parseIntSafe(row.qtSisabCadastroEquipeEsfrEcrEapp),
        qtParametroCadastroEquipeSbAps: parseIntSafe(row.qtParametroCadastroEquipeSbAps),
        coberturaSbApsPercentual: parseDecimalSafe(row.coberturaSbAps),
      };
    });

    log.info({ 
      data: [{ fatos: fatosToInsert.length }] 
    }, "Iniciando inserção na tabela fato");

    const chunkSize = 1000;

    // CLEAN & INSERT Fatos (Garante idempotência, visto que não há chaves compostas na fato)
    await db.delete(targetCoberturaSaudeBucalV2);
    
    for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
      await db.insert(targetCoberturaSaudeBucalV2)
        .values(fatosToInsert.slice(i, i + chunkSize));
    }

    log.info({ data: [] }, "Transformação e carga de cobertura_saude_bucal_v2 concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de cobertura_saude_bucal_v2");
    throw error;
  }
}