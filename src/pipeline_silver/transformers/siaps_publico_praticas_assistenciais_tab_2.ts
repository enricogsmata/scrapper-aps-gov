// src/pipeline_silver/transformers/siaps_publico_praticas_assistenciais_tab_2.ts
import { eq } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { siapsPraticasDemografia } from "../../database/db/schema.js";
import { siapsPublicoPraticasAssistenciaisTab2 as sourceSiapsTab2 } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

function parseIntSafe(val: string | null): number | undefined {
  if (!val) return undefined;
  const parsed = parseInt(val.replace(/\D/g, ""), 10);
  return isNaN(parsed) ? undefined : parsed;
}

export async function transformSiapsPublicoPraticasAssistenciaisTab2(): Promise<void> {
  const log = logger.forMethod("transformSiapsPublicoPraticasAssistenciaisTab2");
  const categoriaFixo = "praticas_assistenciais_tab_2";

  try {
    log.info({ data: [] }, "Iniciando extração de siaps_publico_praticas_assistenciais_tab_2 do raw_db");

    const rawData = await raw_db.select().from(sourceSiapsTab2);

    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const fatosToInsert = rawData.map((row) => ({
      categoria: categoriaFixo,
      abrangencia: row.brasil || "Brasil",
      masculino: parseIntSafe(row.masculino),
      feminino: parseIntSafe(row.feminino),
      total: parseIntSafe(row.total),
    }));

    log.info({ data: [{ fatos: fatosToInsert.length }] }, "Iniciando carga idempotente na tabela fato");

    const chunkSize = 1000;

    await db.delete(siapsPraticasDemografia).where(eq(siapsPraticasDemografia.categoria, categoriaFixo));

    for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
      await db.insert(siapsPraticasDemografia).values(fatosToInsert.slice(i, i + chunkSize));
    }

    log.info({ data: [] }, "Transformação e carga de siaps_publico_praticas_assistenciais_tab_2 concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de siaps_publico_praticas_assistenciais_tab_2");
    throw error;
  }
}