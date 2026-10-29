// src/pipeline_silver/transformers/gerenciaaps_solicitacoes_adesao.ts
import { sql } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { 
  municipios, 
  gerenciaapsSolicitacoesAdesaoFato 
} from "../../database/db/schema.js";
import { gerenciaapsSolicitacoesAdesao } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

export async function transformGerenciaapsSolicitacoesAdesao(): Promise<void> {
  const log = logger.forMethod("transformGerenciaapsSolicitacoesAdesao");

  try {
    log.info({ data: [] }, "Iniciando extração de gerenciaaps_solicitacoes_adesao do raw_db");

    const rawData = await raw_db.select().from(gerenciaapsSolicitacoesAdesao);

    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const uniqueMunicipiosMap = new Map<string, any>();
    const fatosToInsert: any[] = [];

    for (const row of rawData) {
      if (!row.ibge) continue;

      // 1. Municípios (Complemento SUS)
      if (!uniqueMunicipiosMap.has(row.ibge)) {
        uniqueMunicipiosMap.set(row.ibge, {
          codigoIbge: row.ibge,
          codigoIbge6: row.ibge.substring(0, 6),
          nome: row.municipio || "Não informado",
          ufSigla: row.uf || "NI",
        });
      }

      // 2. Fato: Gerência APS Solicitações Adesão
      fatosToInsert.push({
        municipioIbge: row.ibge,
        gestao: row.gestao,
        numeroSolicitacao: row.numeroDaSolicitacao,
        programa: row.programa,
        situacaoAdesao: row.situacaoDaAdesao,
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
    await db.delete(gerenciaapsSolicitacoesAdesaoFato);

    if (fatosToInsert.length > 0) {
      for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
        await db.insert(gerenciaapsSolicitacoesAdesaoFato)
          .values(fatosToInsert.slice(i, i + chunkSize));
      }
    }

    log.info({ data: [] }, "Transformação e carga de gerenciaaps_solicitacoes_adesao concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de gerenciaaps_solicitacoes_adesao");
    throw error;
  }
}