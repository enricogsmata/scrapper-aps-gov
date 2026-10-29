// src/pipeline_silver/transformers/acoes_e_programas_saude_producao.ts
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { producaoSaudeNacional } from "../../database/db/schema.js";
import { acoesEProgramasSaudeProducao as sourceAcoesEProgramasSaudeProducao } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

function parseIntSafe(val: string | null): number | undefined {
  if (!val) return undefined;
  const parsed = parseInt(val.replace(/\D/g, ""), 10);
  return isNaN(parsed) ? undefined : parsed;
}

export async function transformAcoesEProgramasSaudeProducao(): Promise<void> {
  const log = logger.forMethod("transformAcoesEProgramasSaudeProducao");

  try {
    log.info({ data: [] }, "Iniciando extração de acoes_e_programas_saude_producao do raw_db");

    const rawData = await raw_db.select().from(sourceAcoesEProgramasSaudeProducao);
    
    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const fatosToInsert = rawData.map(row => {
      return {
        abrangencia: row.brasil || "Brasil",
        atendimentoIndividual: parseIntSafe(row.atendimentoIndividual),
        atendimentoOdontologico: parseIntSafe(row.atendimentoOdontologico),
        procedimento: parseIntSafe(row.procedimento),
        visitaDomiciliar: parseIntSafe(row.visitaDomiciliar),
      };
    });

    log.info({ 
      data: [{ fatos: fatosToInsert.length }] 
    }, "Iniciando inserção na tabela fato");

    const chunkSize = 1000;

    // CLEAN & INSERT Fatos (Garante idempotência)
    await db.delete(producaoSaudeNacional);
    
    for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
      await db.insert(producaoSaudeNacional)
        .values(fatosToInsert.slice(i, i + chunkSize));
    }

    log.info({ data: [] }, "Transformação e carga de acoes_e_programas_saude_producao concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de acoes_e_programas_saude_producao");
    throw error;
  }
}