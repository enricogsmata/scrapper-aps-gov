// src/pipeline_silver/transformers/cobertura_acs.ts
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { coberturaAcs as targetCoberturaAcs } from "../../database/db/schema.js";
import { coberturaAcs as sourceCoberturaAcs } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

function parseIntSafe(val: string | null): number | undefined {
  if (!val) return undefined;
  const parsed = parseInt(val.replace(/\D/g, ""), 10);
  return isNaN(parsed) ? undefined : parsed;
}

function parseDecimalSafe(val: string | null): string | undefined {
  if (!val) return undefined;
  const cleaned = val.replace(/[R$%\s]/g, "").trim();
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? undefined : parsed.toString();
}

export async function transformCoberturaAcs(): Promise<void> {
  const log = logger.forMethod("transformCoberturaAcs");

  try {
    log.info({ data: [] }, "Iniciando extração de cobertura_acs do raw_db");

    const rawData = await raw_db.select().from(sourceCoberturaAcs);
    
    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const fatosToInsert = rawData.map(row => {
      return {
        compCnes: row.compCnes || "NI",
        populacao: parseIntSafe(row.populacao),
        qtAcsAtiva: parseIntSafe(row.qtAcsAtiva),
        qtAcsCobertura: parseIntSafe(row.qtAcsCobertura),
        qtPopulacaoCoberta: parseIntSafe(row.qtPopulacaoCoberta),
        coberturaAcsPercentual: parseDecimalSafe(row.coberturaAcs),
      };
    });

    log.info({ 
      data: [{ fatos: fatosToInsert.length }] 
    }, "Iniciando inserção na tabela fato");

    const chunkSize = 1000;

    // CLEAN & INSERT Fatos (Garante idempotência)
    await db.delete(targetCoberturaAcs);
    
    for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
      await db.insert(targetCoberturaAcs)
        .values(fatosToInsert.slice(i, i + chunkSize));
    }

    log.info({ data: [] }, "Transformação e carga de cobertura_acs concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de cobertura_acs");
    throw error;
  }
}