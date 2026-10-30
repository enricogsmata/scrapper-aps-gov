// src/pipeline_silver/transformers/cobertura_aps.ts
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { coberturaAps as targetCoberturaAps } from "../../database/db/schema.js";
import { coberturaAps as sourceCoberturaAps } from "../../database/raw_db/schema.js";
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

export async function transformCoberturaAps(): Promise<void> {
  const log = logger.forMethod("transformCoberturaAps");

  try {
    log.info({ data: [] }, "Iniciando extração de cobertura_aps do raw_db");

    const rawData = await raw_db.select().from(sourceCoberturaAps);

    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const fatosToInsert = rawData.map(row => {
      return {
        compCnes: row.compCnes || "NI",
        populacao: parseIntSafe(row.populacao),
        qtEsf: parseIntSafe(row.qtEsf),
        qtEap20hs: parseIntSafe(row.qtEap20hs),
        qtEap30hs: parseIntSafe(row.qtEap30hs),
        qtEcr: parseIntSafe(row.qtEcr),
        qtCadastroEcr: parseIntSafe(row.qtCadastroEcr),
        qtEapp20hs: parseIntSafe(row.qtEapp20hs),
        qtCadastroEapp20hs: parseIntSafe(row.qtCadastroEapp20hs),
        qtEapp30hs: parseIntSafe(row.qtEapp30hs),
        qtCadastroEapp30hs: parseIntSafe(row.qtCadastroEapp30hs),
        qtEsfr: parseIntSafe(row.qtEsfr),
        qtCadastroEsfr: parseIntSafe(row.qtCadastroEsfr),
        qtCadastrosDasEcrEEapp: parseIntSafe(row.qtCadastrosDasEcrEEapp),
        qtCapacidadeDaEquipe: parseIntSafe(row.qtCapacidadeDaEquipe),
        coberturaApsPercentual: parseDecimalSafe(row.coberturaAps),
        qtCadastroEquipeEsfrEcrEapp: parseIntSafe(row.qtCadastroEquipeEsfrEcrEapp),
      };
    });

    log.info({
      data: [{ fatos: fatosToInsert.length }]
    }, "Iniciando inserção na tabela fato");

    const chunkSize = 1000;

    // CLEAN & INSERT Fatos (Garante idempotência, visto que não há chaves compostas na fato)
    await db.delete(targetCoberturaAps);

    for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
      await db.insert(targetCoberturaAps)
        .values(fatosToInsert.slice(i, i + chunkSize));
    }

    log.info({ data: [] }, "Transformação e carga de cobertura_aps concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de cobertura_aps");
    throw error;
  }
}