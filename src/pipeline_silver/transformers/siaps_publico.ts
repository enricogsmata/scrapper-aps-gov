// src/pipeline_silver/transformers/siaps_publico.ts
import { sql } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { 
  municipios, 
  siapsAvaliacoesEquipes 
} from "../../database/db/schema.js";
import { siapsPublico as sourceSiapsPublico } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

function parseIntSafe(val: string | null): number {
  if (!val) return 0;
  const parsed = parseInt(val.replace(/\D/g, ""), 10);
  return isNaN(parsed) ? 0 : parsed;
}

export async function transformSiapsPublico(): Promise<void> {
  const log = logger.forMethod("transformSiapsPublico");

  try {
    log.info({ data: [] }, "Iniciando extração de siaps_publico do raw_db");

    const rawData = await raw_db.select().from(sourceSiapsPublico);

    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const uniqueMunicipiosMap = new Map<string, any>();
    const fatosToInsert: any[] = [];

    for (const row of rawData) {
      if (!row.codigoIbge || !row.quadrimestreAno) continue;

      // 1. Municípios (Complemento SUS)
      if (!uniqueMunicipiosMap.has(row.codigoIbge)) {
        uniqueMunicipiosMap.set(row.codigoIbge, {
          codigoIbge: row.codigoIbge,
          codigoIbge6: row.codigoIbge.substring(0, 6),
          nome: row.municipio || "Não informado",
          ufSigla: row.uf || "NI",
        });
      }

      // 2. Fato: Avaliações de Equipes do SIAPS
      fatosToInsert.push({
        quadrimestreAno: row.quadrimestreAno,
        municipioIbge: row.codigoIbge,
        tipoDeEquipe: row.tipoDeEquipe,
        dimensaoPorTipoDeEquipe: row.dimensaoPorTipoDeEquipe,
        totalDeEquipeRegular: parseIntSafe(row.totalDeEquipeRegular),
        totalDeEquipeSuficiente: parseIntSafe(row.totalDeEquipeSuficiente),
        totalDeEquipeBom: parseIntSafe(row.totalDeEquipeBom),
        totalDeEquipeOtimo: parseIntSafe(row.totalDeEquipeOtimo),
      });
    }

    const municipiosValues = Array.from(uniqueMunicipiosMap.values());

    log.info({
      data: [{
        municipios: municipiosValues.length,
        fatos: fatosToInsert.length,
      }]
    }, "Iniciando UPSERTs nas tabelas dimensionais e inserção na tabela fato");

    const chunkSize = 1000;

    // UPSERT Municípios
    if (municipiosValues.length > 0) {
      for (let i = 0; i < municipiosValues.length; i += chunkSize) {
        await db.insert(municipios)
          .values(municipiosValues.slice(i, i + chunkSize))
          .onDuplicateKeyUpdate({
            set: {
              nome: sql`COALESCE(municipios.nome, VALUES(nome))`,
              ufSigla: sql`COALESCE(municipios.uf_sigla, VALUES(uf_sigla))`,
            },
          });
      }
    }

    // CLEAN & INSERT Fatos (Garantir idempotência na tabela fato)
    await db.delete(siapsAvaliacoesEquipes);

    if (fatosToInsert.length > 0) {
      for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
        await db.insert(siapsAvaliacoesEquipes)
          .values(fatosToInsert.slice(i, i + chunkSize));
      }
    }

    log.info({ data: [] }, "Transformação e carga de siaps_publico concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de siaps_publico");
    throw error;
  }
}