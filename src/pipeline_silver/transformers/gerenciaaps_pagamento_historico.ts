// src/pipeline_silver/transformers/gerenciaaps_pagamento_historico.ts
import { sql } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import {
  municipios,
  gerenciaapsPagamentosHistorico
} from "../../database/db/schema.js";
import { gerenciaapsPagamentoHistorico } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

function parseIntSafe(val: string | null): number | undefined {
  if (!val) return undefined;
  const parsed = parseInt(val.replace(/\D/g, ""), 10);
  return isNaN(parsed) ? undefined : parsed;
}

function parseDecimalSafe(val: string | null): string | undefined {
  if (!val) return undefined;
  const cleaned = val.replace(/[R$%\s]/g, "").trim();
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? undefined : parsed.toString();
}

export async function transformGerenciaapsPagamentoHistorico(): Promise<void> {
  const log = logger.forMethod("transformGerenciaapsPagamentoHistorico");

  try {
    log.info({ data: [] }, "Iniciando extração de gerenciaaps_pagamento_historico do raw_db");

    const rawData = await raw_db.select().from(gerenciaapsPagamentoHistorico);

    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const uniqueMunicipiosMap = new Map<string, any>();
    const fatosToInsert: any[] = [];

    for (const row of rawData) {
      if (!row.ibge || !row.compCnes) continue;

      // 1. Municípios (Complemento SUS)
      if (!uniqueMunicipiosMap.has(row.ibge)) {
        uniqueMunicipiosMap.set(row.ibge, {
          codigoIbge: row.ibge,
          codigoIbge6: row.ibge.substring(0, 6),
          nome: row.municipio || "Não informado",
          ufSigla: row.uf || "NI",
          tipologia: row.tipologia || null,
          populacao: parseIntSafe(row.populacao),
        });
      }

      // 2. Fato: Gerência APS Pagamentos Histórico
      fatosToInsert.push({
        municipioIbge: row.ibge,
        compCnes: row.compCnes,
        parcela: row.parcela,
        populacao: parseIntSafe(row.populacao),
        credenciadasEsf: parseIntSafe(row.credenciadasEsf),
        credenciadasEap: parseIntSafe(row.credenciadasEap),
        homologadasEsf: parseIntSafe(row.homologadasEsf),
        homologadasEap: parseIntSafe(row.homologadasEap),
        pagasEsf: parseIntSafe(row.pagasEsf),
        pagasEap20h: parseIntSafe(row.pagasEap20h),
        pagasEap30h: parseIntSafe(row.pagasEap30h),
        calcCadastroEsfEap: parseIntSafe(row.calcCadastroEsfEap),
        calcCadastroPotencial: parseIntSafe(row.calcCadastroPotencial),
        calcQtdeEsfQuadrimestre: parseIntSafe(row.calcQtdeEsfQuadrimestre),
        calcQtdeEap20hQuadrimestre: parseIntSafe(row.calcQtdeEap20hQuadrimestre),
        calcQtdeEap30hQuadrimestre: parseIntSafe(row.calcQtdeEap30hQuadrimestre),
        calcQtdePopVulneravel: parseIntSafe(row.calcQtdePopVulneravel),
        calcQtdePopNaoVulneravel: parseIntSafe(row.calcQtdePopNaoVulneravel),
        calcQtdeCadastroPagamento: parseIntSafe(row.calcQtdeCadastroPagamento),
        calcValorPontoVulneravel: parseDecimalSafe(row.calcValorPontoVulneravel),
        calcValorPontoNaoVulneravel: parseDecimalSafe(row.calcValorPontoNaoVulneravel),
        calcValorPontoPorEquipe: parseDecimalSafe(row.calcValorPontoPorEquipe),
        calcValorPagamentoPorEquipeQuadrimestre: parseDecimalSafe(row.calcValorPagamentoPorEquipeQuadrimestre),
        compEsfCompletas: parseIntSafe(row.compEsfCompletas),
        compEsfIncompletas75: parseIntSafe(row.compEsfIncompletas75),
        compEsfIncompletas50: parseIntSafe(row.compEsfIncompletas50),
        compEsfIncompletas25: parseIntSafe(row.compEsfIncompletas25),
        compEap20hCompletas: parseIntSafe(row.compEap20hCompletas),
        compEap20hIncompletas: parseIntSafe(row.compEap20hIncompletas),
        compEap30hCompletas: parseIntSafe(row.compEap30hCompletas),
        compEap30hIncompletas: parseIntSafe(row.compEap30hIncompletas),
        compValorTotalPagamento: parseDecimalSafe(row.compValorTotalPagamento),
        novasEsfCompletas: parseIntSafe(row.novasEsfCompletas),
        novasEsfIncompletas75: parseIntSafe(row.novasEsfIncompletas75),
        novasEsfIncompletas50: parseIntSafe(row.novasEsfIncompletas50),
        novasEsfIncompletas25: parseIntSafe(row.novasEsfIncompletas25),
        novasEap20hCompletas: parseIntSafe(row.novasEap20hCompletas),
        novasEap20hIncompletas: parseIntSafe(row.novasEap20hIncompletas),
        novasEap30hCompletas: parseIntSafe(row.novasEap30hCompletas),
        novasEap30hIncompletas: parseIntSafe(row.novasEap30hIncompletas),
        novasCadastroPotencial: parseIntSafe(row.novasCadastroPotencial),
        novasValorPagamentoPorEquipe: parseDecimalSafe(row.novasValorPagamentoPorEquipe),
        novasValorTotalPagamento: parseDecimalSafe(row.novasValorTotalPagamento),
        especificasQtdeEcr: parseIntSafe(row.especificasQtdeEcr),
        especificasCadastroEcr: parseIntSafe(row.especificasCadastroEcr),
        especificasValorPontoEcr: parseDecimalSafe(row.especificasValorPontoEcr),
        especificasValorPagamentoEcr: parseDecimalSafe(row.especificasValorPagamentoEcr),
        especificasQtdeEapp: parseIntSafe(row.especificasQtdeEapp),
        especificasCadastroEapp: parseIntSafe(row.especificasCadastroEapp),
        especificasValorPontoEapp: parseDecimalSafe(row.especificasValorPontoEapp),
        especificasValorPagamentoEapp: parseDecimalSafe(row.especificasValorPagamentoEapp),
        especificasQtdeEsfr: parseIntSafe(row.especificasQtdeEsfr),
        especificasCadastroVulneravelEsfr: parseIntSafe(row.especificasCadastroVulneravelEsfr),
        especificasCadastroNaoVulneravelEsfr: parseIntSafe(row.especificasCadastroNaoVulneravelEsfr),
        especificasValorPontoVulneravelEsfrb: parseDecimalSafe(row.especificasValorPontoVulneravelEsfrb),
        especificasValorPontoNaoVulneravelEsfr: parseDecimalSafe(row.especificasValorPontoNaoVulneravelEsfr),
        especificasValorPagamentoVulneravelEsfr: parseDecimalSafe(row.especificasValorPagamentoVulneravelEsfr),
        especificasValorPagamentoNaoVulneravelEsfr: parseDecimalSafe(row.especificasValorPagamentoNaoVulneravelEsfr),
        valorCapitacaoPonderada: parseDecimalSafe(row.valorCapitacaoPonderada),
        valorComplementacaoFinanceira: parseDecimalSafe(row.valorComplementacaoFinanceira),
        ajusteAdicional: parseDecimalSafe(row.ajusteAdicional),
        ajusteDesconto: parseDecimalSafe(row.ajusteDesconto),
        valorTotal: parseDecimalSafe(row.valorTotal),
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
              tipologia: sql`COALESCE(municipios.tipologia, VALUES(tipologia))`,
              populacao: sql`COALESCE(municipios.populacao, VALUES(populacao))`,
            },
          });
      }
    }

    // CLEAN & INSERT Fatos (Garantir idempotência na tabela fato)
    await db.delete(gerenciaapsPagamentosHistorico);

    if (fatosToInsert.length > 0) {
      for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
        await db.insert(gerenciaapsPagamentosHistorico)
          .values(fatosToInsert.slice(i, i + chunkSize));
      }
    }

    log.info({ data: [] }, "Transformação e carga de gerenciaaps_pagamento_historico concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de gerenciaaps_pagamento_historico");
    throw error;
  }
}