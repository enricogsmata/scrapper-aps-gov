// src/pipeline_silver/transformers/cobertura_aps_historico.ts
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { coberturaApsHistorico as targetCoberturaApsHistorico } from "../../database/db/schema.js";
import { coberturaApsHistorico as sourceCoberturaApsHistorico } from "../../database/raw_db/schema.js";
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

export async function transformCoberturaApsHistorico(): Promise<void> {
  const log = logger.forMethod("transformCoberturaApsHistorico");

  try {
    log.info({ data: [] }, "Iniciando extração de cobertura_aps_historico do raw_db");

    const rawData = await raw_db.select().from(sourceCoberturaApsHistorico);
    
    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const fatosToInsert = rawData.map(row => {
      return {
        competenciaCnes: row.competenciaCnes || "NI",
        populacao: parseIntSafe(row.populacao),
        qtEapFinanciada: parseIntSafe(row.qtEapFinanciada),
        qtEsfFinanciada: parseIntSafe(row.qtEsfFinanciada),
        qtCadastrosEapFinanciadas: parseIntSafe(row.qtCadastrosEapFinanciadas),
        qtCadastrosEsfFinanciadas: parseIntSafe(row.qtCadastrosEsfFinanciadas),
        qtTotalDeCadastrosLimPopIbge: parseIntSafe(row.qtTotalDeCadastrosLimPopIbge),
        coberturaApsPercentual: parseDecimalSafe(row.coberturaAps),
      };
    });

    log.info({ 
      data: [{ fatos: fatosToInsert.length }] 
    }, "Iniciando inserção na tabela fato");

    const chunkSize = 1000;

    // CLEAN & INSERT Fatos (Garante idempotência, visto que não há chaves compostas na fato)
    await db.delete(targetCoberturaApsHistorico);
    
    for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
      await db.insert(targetCoberturaApsHistorico)
        .values(fatosToInsert.slice(i, i + chunkSize));
    }

    log.info({ data: [] }, "Transformação e carga de cobertura_aps_historico concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de cobertura_aps_historico");
    throw error;
  }
}