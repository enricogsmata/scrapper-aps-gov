// src/pipeline_silver/transformers/rel_historico_pagamento_esf.ts
import { sql } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { 
  municipios, 
  relHistoricoPagamentoEsf as targetRelHistoricoPagamentoEsf 
} from "../../database/db/schema.js";
import { relHistoricoPagamentoEsf as sourceRelHistoricoPagamentoEsf } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

function parseIntSafe(val: string | null): number | undefined {
  if (!val) return undefined;
  const parsed = parseInt(val.replace(/\D/g, ""), 10);
  return isNaN(parsed) ? undefined : parsed;
}

function parseDecimalSafe(val: string | null): string | undefined {
  if (!val) return undefined;
  const cleaned = val.replace(/[R$%\s]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? undefined : parsed.toString();
}

export async function transformRelHistoricoPagamentoEsf(): Promise<void> {
  const log = logger.forMethod("transformRelHistoricoPagamentoEsf");

  try {
    log.info({ data: [] }, "Iniciando extração de rel_historico_pagamento_esf do raw_db");

    const rawData = await raw_db.select().from(sourceRelHistoricoPagamentoEsf);

    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const uniqueMunicipiosMap = new Map<string, any>();
    const fatosToInsert: any[] = [];

    for (const row of rawData) {
      const codigoIbge = row.codigo;
      const ano = parseIntSafe(row.ano);
      const mes = parseIntSafe(row.mes);

      if (!codigoIbge || ano === undefined || mes === undefined) continue;

      // 1. Municípios (Complemento SUS)
      if (!uniqueMunicipiosMap.has(codigoIbge)) {
        uniqueMunicipiosMap.set(codigoIbge, {
          codigoIbge,
          codigoIbge6: row.mun6 || codigoIbge.substring(0, 6),
          nome: row.municipio || "Não informado",
          ufSigla: row.uf || "NI",
          populacao: parseIntSafe(row.populacao),
        });
      }

      // 2. Fato: Relatório Histórico de Pagamento ESF
      fatosToInsert.push({
        municipioIbge: codigoIbge,
        ano,
        mes,
        competencia: row.competencia,
        populacao: parseIntSafe(row.populacao),
        tetoDeAcs: parseIntSafe(row.tetoDeAcs),
        acsQualificados: parseIntSafe(row.acsQualificados),
        acsNoSiab: parseIntSafe(row.acsNoSiab),
        acsImplantado: parseIntSafe(row.acsImplantado),
        popAcs: parseIntSafe(row.popAcs),
        pctAcs: parseDecimalSafe(row.pctAcs),
        incentivoAoPacs: parseDecimalSafe(row.incentivoAoPacs),
        tetoDeEsf: parseIntSafe(row.tetoDeEsf),
        esfQualificadas: parseIntSafe(row.esfQualificadas),
        esfNoSiab: parseIntSafe(row.esfNoSiab),
        esfImplantada: parseIntSafe(row.esfImplantada),
        pctCobertura: parseDecimalSafe(row.pctCobertura),
        popAcomp: parseIntSafe(row.popAcomp),
        incentivoAoPsf: parseDecimalSafe(row.incentivoAoPsf),
        iaPsf: parseDecimalSafe(row.iaPsf),
        esbMod1Qualificadas: parseIntSafe(row.esbMod1Qualificadas),
        esbMod1Siab: parseIntSafe(row.esbMod1Siab),
        esbMod1Implantada: parseIntSafe(row.esbMod1Implantada),
        incentivoMod1: parseDecimalSafe(row.incentivoMod1),
        esbMod2Qualificadas: parseIntSafe(row.esbMod2Qualificadas),
        esbMod2Siab: parseIntSafe(row.esbMod2Siab),
        esbMod2Implantada: parseIntSafe(row.esbMod2Implantada),
        incentivoMod2: parseDecimalSafe(row.incentivoMod2),
        popEsb: parseIntSafe(row.popEsb),
        pctEsb: parseDecimalSafe(row.pctEsb),
        incentivoAdicional: parseDecimalSafe(row.incentivoAdicional),
        nasf1Cred: parseIntSafe(row.nasf1Cred),
        nasf1Sistema: parseIntSafe(row.nasf1Sistema),
        nasf1Pago: parseIntSafe(row.nasf1Pago),
        nasf1Valor: parseDecimalSafe(row.nasf1Valor),
        nasf2Cred: parseIntSafe(row.nasf2Cred),
        nasf2Sistema: parseIntSafe(row.nasf2Sistema),
        nasf2Pago: parseIntSafe(row.nasf2Pago),
        nasf2Valor: parseDecimalSafe(row.nasf2Valor),
        nasf3Cred: parseIntSafe(row.nasf3Cred),
        nasf3Sistema: parseIntSafe(row.nasf3Sistema),
        nasf3Pago: parseIntSafe(row.nasf3Pago),
        nasf3Valor: parseDecimalSafe(row.nasf3Valor),
        nasfIncAdicional: parseDecimalSafe(row.nasfIncAdicional),
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
              codigoIbge6: sql`COALESCE(municipios.codigo_ibge_6, VALUES(codigo_ibge_6))`,
              nome: sql`COALESCE(municipios.nome, VALUES(nome))`,
              ufSigla: sql`COALESCE(municipios.uf_sigla, VALUES(uf_sigla))`,
              populacao: sql`COALESCE(municipios.populacao, VALUES(populacao))`,
            },
          });
      }
    }

    // CLEAN & INSERT Fatos (Garantir idempotência na tabela fato)
    await db.delete(targetRelHistoricoPagamentoEsf);

    if (fatosToInsert.length > 0) {
      for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
        await db.insert(targetRelHistoricoPagamentoEsf)
          .values(fatosToInsert.slice(i, i + chunkSize));
      }
    }

    log.info({ data: [] }, "Transformação e carga de rel_historico_pagamento_esf concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de rel_historico_pagamento_esf");
    throw error;
  }
}