// src/pipeline_silver/transformers/acoes_e_programas_indicador_painel.ts
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { painelIndicadoresAps } from "../../database/db/schema.js";
import { acoesEProgramasIndicadorPainel as sourceAcoesEProgramasIndicadorPainel } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

function parseDecimalSafe(val: string | null): string | undefined {
  if (!val) return undefined;
  const parsed = parseFloat(val.replace(/[%\s]/g, "").replace(/\./g, "").replace(",", "."));
  return isNaN(parsed) ? undefined : parsed.toString();
}

export async function transformAcoesEProgramasIndicadorPainel(): Promise<void> {
  const log = logger.forMethod("transformAcoesEProgramasIndicadorPainel");

  try {
    log.info({ data: [] }, "Iniciando extração de acoes_e_programas_indicador_painel do raw_db");

    const rawData = await raw_db.select().from(sourceAcoesEProgramasIndicadorPainel);
    
    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const fatosToInsert = rawData.map(row => {
      return {
        preNatal6Consultas: parseDecimalSafe(row.preNatal6Consultas),
        preNatalSifilisEHiv: parseDecimalSafe(row.preNatalSifilisEHiv),
        gestantesSaudeBucal: parseDecimalSafe(row.gestantesSaudeBucal),
        coberturaCitopatologico: parseDecimalSafe(row.coberturaCitopatologico),
        coberturaPolioEPenta: parseDecimalSafe(row.coberturaPolioEPenta),
        hipertensaoPaAferida: parseDecimalSafe(row.hipertensaoPaAferida),
        diabetesHemoglobinaGlicada: parseDecimalSafe(row.diabetesHemoglobinaGlicada),
      };
    });

    log.info({ 
      data: [{ fatos: fatosToInsert.length }] 
    }, "Iniciando inserção na tabela fato");

    const chunkSize = 1000;

    // CLEAN & INSERT Fatos (Garante idempotência)
    await db.delete(painelIndicadoresAps);
    
    for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
      await db.insert(painelIndicadoresAps)
        .values(fatosToInsert.slice(i, i + chunkSize));
    }

    log.info({ data: [] }, "Transformação e carga de acoes_e_programas_indicador_painel concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de acoes_e_programas_indicador_painel");
    throw error;
  }
}