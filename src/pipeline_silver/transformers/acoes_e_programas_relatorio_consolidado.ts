// src/pipeline_silver/transformers/acoes_e_programas_relatorio_consolidado.ts
import { sql } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { 
  municipios, 
  indicadoresAcompanhamentoPbf 
} from "../../database/db/schema.js";
import { acoesEProgramasRelatorioConsolidado } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

function parseIntSafe(val: string | null): number | undefined {
  if (!val) return undefined;
  const parsed = parseInt(val.replace(/\D/g, ""), 10);
  return isNaN(parsed) ? undefined : parsed;
}

function parseDecimalSafe(val: string | null): string | undefined {
  if (!val) return undefined;
  const parsed = parseFloat(val.replace(/\./g, "").replace(",", "."));
  return isNaN(parsed) ? undefined : parsed.toString();
}

export async function transformAcoesEProgramasRelatorioConsolidado(): Promise<void> {
  const log = logger.forMethod("transformAcoesEProgramasRelatorioConsolidado");

  try {
    log.info({ data: [] }, "Iniciando extração de acoes_e_programas_relatorio_consolidado do raw_db");

    const rawData = await raw_db.select().from(acoesEProgramasRelatorioConsolidado);

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
          nome: "Não informado",
          ufSigla: row.estado || "NI",
        });
      }

      // 2. Fato: Indicadores Acompanhamento PBF
      fatosToInsert.push({
        vigencia: row.vigencia,
        municipioIbge: row.ibge,
        qtdBeneficiariosASeremAcompanhados: parseIntSafe(row.qtdBeneficiariosASeremAcompanhados),
        qtdBeneficiariosAcompanhados: parseIntSafe(row.qtdBeneficiariosAcompanhados),
        percCoberturaDeBeneficiariosAcompanhados: parseDecimalSafe(row.percCoberturaDeBeneficiariosAcompanhados),
        qtdCriancaASerAcompanhada: parseIntSafe(row.qtdCriancaASerAcompanhada),
        qtdCriancaAcompanhada: parseIntSafe(row.qtdCriancaAcompanhada),
        percCoberturaDoAcompDeCriancas: parseDecimalSafe(row.percCoberturaDoAcompDeCriancas),
        qtdCriancaComVacEmDia: parseIntSafe(row.qtdCriancaComVacEmDia),
        percCriancasComVacEmDia: parseDecimalSafe(row.percCriancasComVacEmDia),
        qtdCriancaComDadosNutricionais: parseIntSafe(row.qtdCriancaComDadosNutricionais),
        percCriancasComDadosNutricionais: parseDecimalSafe(row.percCriancasComDadosNutricionais),
        qtdGestantesEstimadas: parseIntSafe(row.qtdGestantesEstimadas),
        qtdGestantesLocalizadas: parseIntSafe(row.qtdGestantesLocalizadas),
        percDeGestantesLocalizadasNoPbf: parseDecimalSafe(row.percDeGestantesLocalizadasNoPbf),
        qtdGestantesPreNatalEmDia: parseIntSafe(row.qtdGestantesPreNatalEmDia),
        coberturaGestantesComPreNatalEmDia: parseDecimalSafe(row.coberturaGestantesComPreNatalEmDia),
        qtdGestantesComDadosNutric: parseIntSafe(row.qtdGestantesComDadosNutric),
        percGestantesComDadosNutric: parseDecimalSafe(row.percGestantesComDadosNutric),
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
              ufSigla: sql`COALESCE(municipios.uf_sigla, VALUES(uf_sigla))`,
            },
          });
      }
    }

    // CLEAN & INSERT Fatos (Garantir idempotência na tabela fato)
    await db.delete(indicadoresAcompanhamentoPbf);

    if (fatosToInsert.length > 0) {
      for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
        await db.insert(indicadoresAcompanhamentoPbf)
          .values(fatosToInsert.slice(i, i + chunkSize));
      }
    }

    log.info({ data: [] }, "Transformação e carga de acoes_e_programas_relatorio_consolidado concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de acoes_e_programas_relatorio_consolidado");
    throw error;
  }
}