// src/pipeline_silver/transformers/acoes_e_programas_indicador_prenatal.ts
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { indicadoresPrenatalAps } from "../../database/db/schema.js";
import { acoesEProgramasIndicadorPrenatal as sourceAcoesEProgramasIndicadorPrenatal } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

function parseIntSafe(val: string | null): number {
  if (!val) return 0;
  const parsed = parseInt(val.replace(/\D/g, ""), 10);
  return isNaN(parsed) ? 0 : parsed;
}

export async function transformAcoesEProgramasIndicadorPrenatal(): Promise<void> {
  const log = logger.forMethod("transformAcoesEProgramasIndicadorPrenatal");

  try {
    log.info({ data: [] }, "Iniciando extração de acoes_e_programas_indicador_prenatal do raw_db");

    const rawData = await raw_db.select().from(sourceAcoesEProgramasIndicadorPrenatal);
    
    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const fatosToInsert = rawData.map(row => {
      return {
        competencia: row.competencia || "Não informada",
        totalGestantes: parseIntSafe(row.totalGestantes),
      };
    });

    log.info({ 
      data: [{ fatos: fatosToInsert.length }] 
    }, "Iniciando inserção na tabela fato");

    const chunkSize = 1000;

    // CLEAN & INSERT Fatos (Garante idempotência)
    await db.delete(indicadoresPrenatalAps);
    
    for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
      await db.insert(indicadoresPrenatalAps)
        .values(fatosToInsert.slice(i, i + chunkSize));
    }

    log.info({ data: [] }, "Transformação e carga de acoes_e_programas_indicador_prenatal concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de acoes_e_programas_indicador_prenatal");
    throw error;
  }
}