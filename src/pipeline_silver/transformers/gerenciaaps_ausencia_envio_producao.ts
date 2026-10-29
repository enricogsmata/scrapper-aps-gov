// src/pipeline_silver/transformers/gerenciaaps_ausencia_envio_producao.ts
import { sql } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { 
  municipios, 
  estabelecimentosSaude, 
  gerenciaapsAusenciasEnvioProducao 
} from "../../database/db/schema.js";
import { gerenciaapsAusenciaEnvioProducao } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

export async function transformGerenciaapsAusenciaEnvioProducao(): Promise<void> {
  const log = logger.forMethod("transformGerenciaapsAusenciaEnvioProducao");

  try {
    log.info({ data: [] }, "Iniciando extração de gerenciaaps_ausencia_envio_producao do raw_db");

    const rawData = await raw_db.select().from(gerenciaapsAusenciaEnvioProducao);
    
    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const uniqueMunicipiosMap = new Map<string, any>();
    const uniqueEstabelecimentosMap = new Map<string, any>();
    const fatosToInsert: any[] = [];

    for (const row of rawData) {
      if (!row.ibge || !row.cnes || !row.compCnes) continue;

      // 1. Municipios (Apenas dados complementares do SUS, tabela master preenchida via seed)
      if (!uniqueMunicipiosMap.has(row.ibge)) {
        uniqueMunicipiosMap.set(row.ibge, {
          codigoIbge: row.ibge,
          codigoIbge6: row.ibge.substring(0, 6),
          nome: row.municipio || "Não informado",
          ufSigla: row.uf || "NI",
        });
      }

      // 2. Estabelecimentos de Saúde
      if (!uniqueEstabelecimentosMap.has(row.cnes)) {
        uniqueEstabelecimentosMap.set(row.cnes, {
          codigoCnes: row.cnes,
          municipioIbge: row.ibge,
          tipoEstabelecimento: row.tipoDeEstabelecimento,
        });
      }

      // 3. Fato: Gerencia APS Ausências de Envio de Produção
      fatosToInsert.push({
        compCnes: row.compCnes,
        municipioIbge: row.ibge,
        codigoCnes: row.cnes,
        gestao: row.gestao,
        situacaoEnvioProducao: row.situacaoDoEnvioDeProducao,
      });
    }

    const municipiosValues = Array.from(uniqueMunicipiosMap.values());
    const estabelecimentosValues = Array.from(uniqueEstabelecimentosMap.values());

    log.info({ 
      data: [{ 
        municipios: municipiosValues.length,
        estabelecimentos: estabelecimentosValues.length,
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

    // UPSERT Estabelecimentos
    if (estabelecimentosValues.length > 0) {
      for (let i = 0; i < estabelecimentosValues.length; i += chunkSize) {
        await db.insert(estabelecimentosSaude)
          .values(estabelecimentosValues.slice(i, i + chunkSize))
          .onDuplicateKeyUpdate({
            set: {
              municipioIbge: sql`VALUES(municipio_ibge)`,
              tipoEstabelecimento: sql`VALUES(tipo_estabelecimento)`,
            },
          });
      }
    }

    // CLEAN & INSERT Fatos (Garantir idempotência na tabela fato)
    await db.delete(gerenciaapsAusenciasEnvioProducao);
    
    if (fatosToInsert.length > 0) {
      for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
        await db.insert(gerenciaapsAusenciasEnvioProducao)
          .values(fatosToInsert.slice(i, i + chunkSize));
      }
    }

    log.info({ data: [] }, "Transformação e carga de gerenciaaps_ausencia_envio_producao concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de gerenciaaps_ausencia_envio_producao");
    throw error;
  }
}