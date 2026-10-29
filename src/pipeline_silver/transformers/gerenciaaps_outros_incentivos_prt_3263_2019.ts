// src/pipeline_silver/transformers/gerenciaaps_outros_incentivos_prt_3263_2019.ts
import { sql } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { 
  municipios, 
  equipesSaude, 
  incentivosEquipesPrt32632019 
} from "../../database/db/schema.js";
import { gerenciaapsOutrosIncentivosPrt32632019 } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

export async function transformGerenciaapsOutrosIncentivosPrt32632019(): Promise<void> {
  const log = logger.forMethod("transformGerenciaapsOutrosIncentivosPrt32632019");

  try {
    log.info({ data: [] }, "Iniciando extração de gerenciaaps_outros_incentivos_prt_3263_2019 do raw_db");

    const rawData = await raw_db.select().from(gerenciaapsOutrosIncentivosPrt32632019);
    
    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const uniqueMunicipiosMap = new Map<string, any>();
    const uniqueEquipesSaudeMap = new Map<string, any>();
    const fatosToInsert: any[] = [];

    for (const row of rawData) {
      if (!row.ibge || !row.ine) continue;

      // 1. Municipios (Apenas dados básicos do SUS, IBGE master seed mantém o resto)
      if (!uniqueMunicipiosMap.has(row.ibge)) {
        uniqueMunicipiosMap.set(row.ibge, {
          codigoIbge: row.ibge,
          codigoIbge6: row.ibge.substring(0, 6),
          nome: row.municipio || "Não informado",
          ufSigla: row.uf || "NI",
        });
      }

      // 2. Equipes de Saúde
      if (!uniqueEquipesSaudeMap.has(row.ine)) {
        uniqueEquipesSaudeMap.set(row.ine, {
          codigoIne: row.ine,
          municipioIbge: row.ibge,
        });
      }

      // 3. Fato: Incentivos Equipes PRT 3263 2019
      fatosToInsert.push({
        municipioIbge: row.ibge,
        codigoIne: row.ine,
      });
    }

    const municipiosValues = Array.from(uniqueMunicipiosMap.values());
    const equipesSaudeValues = Array.from(uniqueEquipesSaudeMap.values());

    log.info({ 
      data: [{ 
        municipios: municipiosValues.length,
        equipesSaude: equipesSaudeValues.length,
        fatos: fatosToInsert.length
      }] 
    }, "Iniciando UPSERTs nas tabelas dimensionais e inserção na tabela fato");

    const chunkSize = 1000;

    // UPSERT Municipios
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

    // UPSERT Equipes de Saúde
    if (equipesSaudeValues.length > 0) {
      for (let i = 0; i < equipesSaudeValues.length; i += chunkSize) {
        await db.insert(equipesSaude)
          .values(equipesSaudeValues.slice(i, i + chunkSize))
          .onDuplicateKeyUpdate({
            set: {
              municipioIbge: sql`VALUES(municipio_ibge)`,
            },
          });
      }
    }

    // CLEAN & INSERT Fatos (Garantir idempotência)
    await db.delete(incentivosEquipesPrt32632019);
    
    if (fatosToInsert.length > 0) {
      for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
        await db.insert(incentivosEquipesPrt32632019)
          .values(fatosToInsert.slice(i, i + chunkSize));
      }
    }

    log.info({ data: [] }, "Transformação e carga de gerenciaaps_outros_incentivos_prt_3263_2019 concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de gerenciaaps_outros_incentivos_prt_3263_2019");
    throw error;
  }
}