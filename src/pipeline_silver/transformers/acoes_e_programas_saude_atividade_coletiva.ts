// src/pipeline_silver/transformers/acoes_e_programas_saude_atividade_coletiva.ts
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { producaoAtividadeColetiva } from "../../database/db/schema.js";
import { acoesEProgramasSaudeAtividadeColetiva as sourceAcoesEProgramasSaudeAtividadeColetiva } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

function parseIntSafe(val: string | null): number | undefined {
  if (!val) return undefined;
  const parsed = parseInt(val.replace(/\D/g, ""), 10);
  return isNaN(parsed) ? undefined : parsed;
}

export async function transformAcoesEProgramasSaudeAtividadeColetiva(): Promise<void> {
  const log = logger.forMethod("transformAcoesEProgramasSaudeAtividadeColetiva");

  try {
    log.info({ data: [] }, "Iniciando extração de acoes_e_programas_saude_atividade_coletiva do raw_db");

    const rawData = await raw_db.select().from(sourceAcoesEProgramasSaudeAtividadeColetiva);

    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const fatosToInsert = rawData.map((row) => ({
      abrangencia: row.brasil || "Brasil",
      quantidadeAtividade: parseIntSafe(row.quantidadeAtividade),
      numParticipantes: parseIntSafe(row.numParticipantes),
    }));

    log.info({ data: [{ fatos: fatosToInsert.length }] }, "Iniciando inserção na tabela fato");

    const chunkSize = 1000;

    await db.delete(producaoAtividadeColetiva);

    for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
      await db.insert(producaoAtividadeColetiva).values(fatosToInsert.slice(i, i + chunkSize));
    }

    log.info({ data: [] }, "Transformação e carga de acoes_e_programas_saude_atividade_coletiva concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de acoes_e_programas_saude_atividade_coletiva");
    throw error;
  }
}