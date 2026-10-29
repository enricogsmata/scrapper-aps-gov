// src/pipeline_silver/transformers/acoes_e_programas_descontinuados_informatiza_aps.ts
import { sql } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { 
  municipios, 
  equipesSaude, 
  informatizaApsHomologacoes 
} from "../../database/db/schema.js";
import { acoesEProgramasDescontinuadosInformatizaAps } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

export async function transformAcoesEProgramasDescontinuadosInformatizaAps(): Promise<void> {
  const log = logger.forMethod("transformAcoesEProgramasDescontinuadosInformatizaAps");

  try {
    log.info({ data: [] }, "Iniciando extração de acoes_e_programas_descontinuados_informatiza_aps do raw_db");

    const rawData = await raw_db.select().from(acoesEProgramasDescontinuadosInformatizaAps);

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

      // 1. Municípios (Complemento SUS)
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
          tipoEquipeCodigo: row.tipoDaEquipe,
        });
      }

      // 3. Fato: Informatiza APS Homologações
      fatosToInsert.push({
        codigoIne: row.ine,
        municipioIbge: row.ibge,
        situacao: row.situacao,
        portariaDeHomologacao: row.portariaDeHomologacao,
        portariaDeCancelamento: row.portariaDeCancelamento,
      });
    }

    const municipiosValues = Array.from(uniqueMunicipiosMap.values());
    const equipesSaudeValues = Array.from(uniqueEquipesSaudeMap.values());

    log.info({
      data: [{
        municipios: municipiosValues.length,
        equipesSaude: equipesSaudeValues.length,
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

    // UPSERT Equipes de Saúde
    if (equipesSaudeValues.length > 0) {
      for (let i = 0; i < equipesSaudeValues.length; i += chunkSize) {
        await db.insert(equipesSaude)
          .values(equipesSaudeValues.slice(i, i + chunkSize))
          .onDuplicateKeyUpdate({
            set: {
              municipioIbge: sql`VALUES(municipio_ibge)`,
              tipoEquipeCodigo: sql`COALESCE(VALUES(tipo_equipe_codigo), equipes_saude.tipo_equipe_codigo)`,
            },
          });
      }
    }

    // CLEAN & INSERT Fatos (Garantir idempotência na tabela fato)
    await db.delete(informatizaApsHomologacoes);

    if (fatosToInsert.length > 0) {
      for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
        await db.insert(informatizaApsHomologacoes)
          .values(fatosToInsert.slice(i, i + chunkSize));
      }
    }

    log.info({ data: [] }, "Transformação e carga de acoes_e_programas_descontinuados_informatiza_aps concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de acoes_e_programas_descontinuados_informatiza_aps");
    throw error;
  }
}