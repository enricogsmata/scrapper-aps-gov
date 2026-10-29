// src/pipeline_silver/transformers/acoes_e_programas_relpagamentopmaq.ts
import { sql } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { 
  municipios, 
  relPagamentosPmaq 
} from "../../database/db/schema.js";
import { acoesEProgramasRelpagamentopmaq } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

function parseIntSafe(val: string | null): number | undefined {
  if (!val) return undefined;
  const parsed = parseInt(val.replace(/\D/g, ""), 10);
  return isNaN(parsed) ? undefined : parsed;
}

function parseDecimalSafe(val: string | null): string | undefined {
  if (!val) return undefined;
  const cleaned = val.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? undefined : parsed.toString();
}

export async function transformAcoesEProgramasRelpagamentopmaq(): Promise<void> {
  const log = logger.forMethod("transformAcoesEProgramasRelpagamentopmaq");

  try {
    log.info({ data: [] }, "Iniciando extração de acoes_e_programas_relpagamentopmaq do raw_db");

    const rawData = await raw_db.select().from(acoesEProgramasRelpagamentopmaq);

    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const uniqueMunicipiosMap = new Map<string, any>();
    const fatosToInsert: any[] = [];

    for (const row of rawData) {
      if (!row.ibge || !row.competenciaCnes || !row.competenciaFinanceira) continue;

      // 1. Municípios (Complemento SUS)
      if (!uniqueMunicipiosMap.has(row.ibge)) {
        uniqueMunicipiosMap.set(row.ibge, {
          codigoIbge: row.ibge,
          codigoIbge6: row.ibge.substring(0, 6),
          nome: row.municipio || "Não informado",
          ufSigla: row.uf || "NI",
        });
      }

      // 2. Fato: Relatório Pagamentos PMAQ
      fatosToInsert.push({
        municipioIbge: row.ibge,
        competenciaCnes: row.competenciaCnes,
        competenciaFinanceira: row.competenciaFinanceira,
        qntEsf: parseIntSafe(row.qntEsf),
        qntEsb: parseIntSafe(row.qntEsb),
        qntNasf: parseIntSafe(row.qntNasf),
        valorEsf: parseDecimalSafe(row.valorEsf),
        valorEsb: parseDecimalSafe(row.valorEsb),
        valorNasf: parseDecimalSafe(row.valorNasf),
        subtotal: parseDecimalSafe(row.subtotal),
        desconto: parseDecimalSafe(row.desconto),
        total: parseDecimalSafe(row.total),
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
    await db.delete(relPagamentosPmaq);

    if (fatosToInsert.length > 0) {
      for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
        await db.insert(relPagamentosPmaq)
          .values(fatosToInsert.slice(i, i + chunkSize));
      }
    }

    log.info({ data: [] }, "Transformação e carga de acoes_e_programas_relpagamentopmaq concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de acoes_e_programas_relpagamentopmaq");
    throw error;
  }
}