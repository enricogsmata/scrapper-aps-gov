// src/pipeline_silver/transformers/gerenciaaps_outros_incentivos_prt_650_2021.ts
import { sql, eq } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { 
  municipios, 
  estabelecimentosSaude, 
  portariasNormativas,
  incentivosCnesAvaliacoes
} from "../../database/db/schema.js";
import { gerenciaapsOutrosIncentivosPrt6502021 } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

export async function transformGerenciaapsOutrosIncentivosPrt6502021(): Promise<void> {
  const log = logger.forMethod("transformGerenciaapsOutrosIncentivosPrt6502021");

  try {
    log.info({ data: [] }, "Iniciando extração de gerenciaaps_outros_incentivos_prt_650_2021 do raw_db");

    const rawData = await raw_db.select().from(gerenciaapsOutrosIncentivosPrt6502021);
    
    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const uniqueMunicipiosMap = new Map<string, any>();
    const uniqueEstabelecimentosMap = new Map<string, any>();
    const fatosToInsert: any[] = [];
    
    // Tratativa Portaria Normativa
    const portariaNumero = "PRT 650/2021";
    const portariaAno = 2021;

    for (const row of rawData) {
      if (!row.ibge || !row.cnesSolicitado) continue;

      // 1. Municipios
      if (!uniqueMunicipiosMap.has(row.ibge)) {
        uniqueMunicipiosMap.set(row.ibge, {
          codigoIbge: row.ibge,
          codigoIbge6: row.ibge.substring(0, 6),
          nome: row.municipio || "Não informado",
          ufSigla: row.uf || "NI",
        });
      }

      // 2. Estabelecimentos de Saúde
      if (!uniqueEstabelecimentosMap.has(row.cnesSolicitado)) {
        uniqueEstabelecimentosMap.set(row.cnesSolicitado, {
          codigoCnes: row.cnesSolicitado,
          municipioIbge: row.ibge,
          tipoUnidadeCodigo: row.tipoDaUnidade,
        });
      }

      // 3. Fatos
      fatosToInsert.push({
        portariaOrigem: portariaNumero,
        municipioIbge: row.ibge,
        codigoCnes: row.cnesSolicitado,
        compCnes: row.compCnes,
        cnesSolicitado: row.cnesSolicitado,
        tipoUnidade: row.tipoDaUnidade,
        unidadeAtiva: row.unidadeAtiva,
        unidadeValida: row.unidadeValida,
        classificacaoValidada: row.classificacaoValidada,
        qtdeMedicos: row.qtdeDeMedicos ? parseInt(row.qtdeDeMedicos, 10) : 0,
        qtdeEnfermeiros: row.qtdeDeEnfermeiros ? parseInt(row.qtdeDeEnfermeiros, 10) : 0,
        qtdeTecnicoAuxiliarEnfermagem: row.qtdeDeTecnicoAuxiliarEnfermagem ? parseInt(row.qtdeDeTecnicoAuxiliarEnfermagem, 10) : 0,
        cargaHorariaMedicos: row.cargaHorariaDeMedicos ? parseInt(row.cargaHorariaDeMedicos, 10) : 0,
        cargaHorariaEnfermeiros: row.cargaHorariaDeEnfermeiros ? parseInt(row.cargaHorariaDeEnfermeiros, 10) : 0,
        cargaHorariaTecnicoAuxiliarEnfermagem: row.cargaHorariaDeTecnicoAuxiliarEnfermagem ? parseInt(row.cargaHorariaDeTecnicoAuxiliarEnfermagem, 10) : 0,
        cumpriuRequisitoCusteio: row.cumpriuRequisitoCusteio,
        contempladoPortaria650: row.contempladoPortaria650,
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

    // UPSERT Portaria Normativa
    await db.insert(portariasNormativas)
      .values({ numero: portariaNumero, ano: portariaAno })
      .onDuplicateKeyUpdate({
        set: {
            ano: sql`VALUES(ano)`
        }
      });
      
    const portariaRecord = await db.select({ id: portariasNormativas.id })
      .from(portariasNormativas)
      .where(eq(portariasNormativas.numero, portariaNumero))
      .limit(1);
      
    const portariaId = portariaRecord[0]?.id;

    // Adiciona o ID da portaria nos fatos
    const fatosComPortariaId = fatosToInsert.map(fato => ({
        ...fato,
        portariaNormativaId: portariaId
    }));

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
              tipoUnidadeCodigo: sql`VALUES(tipo_unidade_codigo)`,
            },
          });
      }
    }

    // CLEAN & INSERT Fatos (Garantir idempotência por portaria)
    await db.delete(incentivosCnesAvaliacoes).where(eq(incentivosCnesAvaliacoes.portariaOrigem, portariaNumero));
    
    if (fatosComPortariaId.length > 0) {
      for (let i = 0; i < fatosComPortariaId.length; i += chunkSize) {
        await db.insert(incentivosCnesAvaliacoes)
          .values(fatosComPortariaId.slice(i, i + chunkSize));
      }
    }

    log.info({ data: [] }, "Transformação e carga de gerenciaaps_outros_incentivos_prt_650_2021 concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de gerenciaaps_outros_incentivos_prt_650_2021");
    throw error;
  }
}