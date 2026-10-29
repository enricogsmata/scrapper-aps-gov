// src/pipeline_silver/transformers/gerenciaaps_pagamento.ts
import { sql } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { 
  municipios, 
  planosOrcamentarios, 
  gerenciaapsPagamentos 
} from "../../database/db/schema.js";
import { gerenciaapsPagamento } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

function parseDecimal(value: string | null): string | undefined {
  if (!value) return undefined;
  const parsed = value.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(parsed);
  return isNaN(num) ? undefined : num.toString();
}

export async function transformGerenciaapsPagamento(): Promise<void> {
  const log = logger.forMethod("transformGerenciaapsPagamento");

  try {
    log.info({ data: [] }, "Iniciando extração de gerenciaaps_pagamento do raw_db");

    const rawData = await raw_db.select().from(gerenciaapsPagamento);
    
    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const uniqueMunicipiosMap = new Map<string, any>();
    const uniquePlanosMap = new Map<string, any>();
    const fatosToInsert: any[] = [];

    for (const row of rawData) {
      if (!row.coMunicipioIbge) continue;

      // 1. Municipios (Apenas dados complementares do SUS, tabela master preenchida via seed)
      if (!uniqueMunicipiosMap.has(row.coMunicipioIbge)) {
        uniqueMunicipiosMap.set(row.coMunicipioIbge, {
          codigoIbge: row.coMunicipioIbge,
          codigoIbge6: row.coMunicipioIbge.substring(0, 6),
          nome: row.noMunicipio || "Não informado",
          ufSigla: row.sgUf || "NI",
        });
      }

      // 2. Planos Orçamentários
      if (row.coSeqPlanoOrcamentario && !uniquePlanosMap.has(row.coSeqPlanoOrcamentario)) {
        uniquePlanosMap.set(row.coSeqPlanoOrcamentario, {
          codigoSeq: row.coSeqPlanoOrcamentario,
          descricao: row.dsPlanoOrcamentario || "Não informado",
        });
      }

      // 3. Fato: Gerencia APS Pagamentos
      fatosToInsert.push({
        dataPagamento: row.data,
        ufSigla: row.sgUf,
        municipioIbge: row.coMunicipioIbge,
        compCnes: row.nuCompCnes,
        parcela: row.nuParcela,
        codigoProcesso: row.coProcesso,
        planoOrcamentarioSeq: row.coSeqPlanoOrcamentario,
        gestao: row.dsGestao,
        total: parseDecimal(row.total),
        vlTotalCusteio: parseDecimal(row.vlTotalCusteio),
        vlTotalImplantacao: parseDecimal(row.vlTotalImplantacao),
        valorIntegral: parseDecimal(row.valorIntegral),
        ajuste: parseDecimal(row.ajuste),
        desconto: parseDecimal(row.desconto),
        valorEfetivoRepasse: parseDecimal(row.valorEfetivoRepasse),
        valorImplantacao: parseDecimal(row.valorImplantacao),
        ajusteImplantacao: parseDecimal(row.ajusteImplantacao),
        descontoImplantacao: parseDecimal(row.descontoImplantacao),
      });
    }

    const municipiosValues = Array.from(uniqueMunicipiosMap.values());
    const planosValues = Array.from(uniquePlanosMap.values());

    log.info({ 
      data: [{ 
        municipios: municipiosValues.length,
        planosOrcamentarios: planosValues.length,
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

    // UPSERT Planos Orçamentários
    if (planosValues.length > 0) {
      for (let i = 0; i < planosValues.length; i += chunkSize) {
        await db.insert(planosOrcamentarios)
          .values(planosValues.slice(i, i + chunkSize))
          .onDuplicateKeyUpdate({
            set: {
              descricao: sql`VALUES(descricao)`,
            },
          });
      }
    }

    // CLEAN & INSERT Fatos (Garantir idempotência)
    await db.delete(gerenciaapsPagamentos);
    
    if (fatosToInsert.length > 0) {
      for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
        await db.insert(gerenciaapsPagamentos)
          .values(fatosToInsert.slice(i, i + chunkSize));
      }
    }

    log.info({ data: [] }, "Transformação e carga de gerenciaaps_pagamento concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de gerenciaaps_pagamento");
    throw error;
  }
}