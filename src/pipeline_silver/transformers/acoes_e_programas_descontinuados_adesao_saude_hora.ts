// src/pipeline_silver/transformers/acoes_e_programas_descontinuados_adesao_saude_hora.ts
import { sql } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { 
  municipios, 
  estabelecimentosSaude, 
  saudeNaHoraAdesoes 
} from "../../database/db/schema.js";
import { acoesEProgramasDescontinuadosAdesaoSaudeHora } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

export async function transformAcoesEProgramasDescontinuadosAdesaoSaudeHora(): Promise<void> {
  const log = logger.forMethod("transformAcoesEProgramasDescontinuadosAdesaoSaudeHora");

  try {
    log.info({ data: [] }, "Iniciando extração de acoes_e_programas_descontinuados_adesao_saude_hora do raw_db");

    const rawData = await raw_db.select().from(acoesEProgramasDescontinuadosAdesaoSaudeHora);

    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const uniqueMunicipiosMap = new Map<string, any>();
    const uniqueEstabelecimentosMap = new Map<string, any>();
    const fatosToInsert: any[] = [];

    for (const row of rawData) {
      if (!row.ibge || !row.cnes) continue;

      // 1. Municípios (Complemento SUS)
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
        });
      }

      // 3. Fato: Saúde na Hora Adesões
      fatosToInsert.push({
        codigoCnes: row.cnes,
        municipioIbge: row.ibge,
        tipoDaAdesao: row.tipoDaAdesao,
        situacaoDaAdesao: row.situacaoDaAdesao,
        portariaDeAdesao: row.portariaDeAdesao,
        portariaDeCancelamento: row.portariaDeCancelamento,
      });
    }

    const municipiosValues = Array.from(uniqueMunicipiosMap.values());
    const estabelecimentosValues = Array.from(uniqueEstabelecimentosMap.values());

    log.info({
      data: [{
        municipios: municipiosValues.length,
        estabelecimentos: estabelecimentosValues.length,
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

    // UPSERT Estabelecimentos de Saúde
    if (estabelecimentosValues.length > 0) {
      for (let i = 0; i < estabelecimentosValues.length; i += chunkSize) {
        await db.insert(estabelecimentosSaude)
          .values(estabelecimentosValues.slice(i, i + chunkSize))
          .onDuplicateKeyUpdate({
            set: {
              municipioIbge: sql`VALUES(municipio_ibge)`,
            },
          });
      }
    }

    // CLEAN & INSERT Fatos (Garantir idempotência na tabela fato)
    await db.delete(saudeNaHoraAdesoes);

    if (fatosToInsert.length > 0) {
      for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
        await db.insert(saudeNaHoraAdesoes)
          .values(fatosToInsert.slice(i, i + chunkSize));
      }
    }

    log.info({ data: [] }, "Transformação e carga de acoes_e_programas_descontinuados_adesao_saude_hora concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de acoes_e_programas_descontinuados_adesao_saude_hora");
    throw error;
  }
}