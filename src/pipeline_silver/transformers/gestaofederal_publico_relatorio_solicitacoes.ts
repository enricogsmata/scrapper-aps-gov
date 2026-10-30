// src/pipeline_silver/transformers/gestaofederal_publico_relatorio_solicitacoes.ts
import { sql } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import {
  municipios,
  gestaofederalSolicitacoes
} from "../../database/db/schema.js";
import { gestaofederalPublicoRelatorioSolicitacoes } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

function parseIntSafe(val: string | null): number | undefined {
  if (!val) return undefined;
  const parsed = parseInt(val.replace(/\D/g, ""), 10);
  return isNaN(parsed) ? undefined : parsed;
}

export async function transformGestaofederalPublicoRelatorioSolicitacoes(): Promise<void> {
  const log = logger.forMethod("transformGestaofederalPublicoRelatorioSolicitacoes");

  try {
    log.info({ data: [] }, "Iniciando extração de gestaofederal_publico_relatorio_solicitacoes do raw_db");

    const rawData = await raw_db.select().from(gestaofederalPublicoRelatorioSolicitacoes);

    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const uniqueMunicipiosMap = new Map<string, any>();
    const fatosToInsert: any[] = [];

    for (const row of rawData) {
      if (!row.ibge || !row.estrategia) continue;

      // 1. Municípios (Complemento SUS)
      if (!uniqueMunicipiosMap.has(row.ibge)) {
        uniqueMunicipiosMap.set(row.ibge, {
          codigoIbge: row.ibge,
          codigoIbge6: row.ibge.substring(0, 6),
          nome: row.municipio || "Não informado",
          ufSigla: row.uf || "NI",
        });
      }

      // 2. Fato: Gestão Federal Solicitações
      fatosToInsert.push({
        municipioIbge: row.ibge,
        estrategia: row.estrategia,
        qtdeSolicitada: parseIntSafe(row.qtdeSolicitada),
        codigoAcaoEstrategica: row.codigoAcaoEstrategica,
        qtTeto: parseIntSafe(row.qtTeto),
        qtCredenciado: parseIntSafe(row.qtCredenciado),
        qtSaldo: parseIntSafe(row.qtSaldo),
        aplicavelTeto: row.aplicavelTeto,
        aplicavelSaldo: row.aplicavelSaldo,
        qtMedicinaSolicitada: parseIntSafe(row.qtMedicinaSolicitada),
        qtEnfermagemSolicitada: parseIntSafe(row.qtEnfermagemSolicitada),
        qtOdontologiaSolicitada: parseIntSafe(row.qtOdontologiaSolicitada),
        qtMultiprofissionalSolicitada: parseIntSafe(row.qtMultiprofissionalSolicitada),
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
    await db.delete(gestaofederalSolicitacoes);

    if (fatosToInsert.length > 0) {
      for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
        await db.insert(gestaofederalSolicitacoes)
          .values(fatosToInsert.slice(i, i + chunkSize));
      }
    }

    log.info({ data: [] }, "Transformação e carga de gestaofederal_publico_relatorio_solicitacoes concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de gestaofederal_publico_relatorio_solicitacoes");
    throw error;
  }
}