// src/pipeline_silver/transformers/mapas_sus_unidades_cnes_realocadas.ts
import { sql } from "drizzle-orm";
import { db } from "../../database/db/connection.js";
import { raw_db } from "../../database/raw_db/connection.js";
import { 
  regioesSaude,
  municipios, 
  estabelecimentosSaude,
  tiposEquipe, 
  equipesSaude, 
  mapasSusEquipesIndicadores 
} from "../../database/db/schema.js";
import { mapasSusUnidadesCnesRealocadas } from "../../database/raw_db/schema.js";
import { new_logger } from "../../services/logs.js";

const logger = new_logger(import.meta.url);

export async function transformMapasSusUnidadesCnesRealocadas(): Promise<void> {
  const log = logger.forMethod("transformMapasSusUnidadesCnesRealocadas");

  try {
    log.info({ data: [] }, "Iniciando extração de mapas_sus_unidades_cnes_realocadas do raw_db");

    const rawData = await raw_db.select().from(mapasSusUnidadesCnesRealocadas);
    
    log.info({ data: [{ totalExtraido: rawData.length }] }, "Dados extraídos. Iniciando processamento e normalização");

    if (rawData.length === 0) {
      log.info({ data: [] }, "Nenhum dado para processar.");
      return;
    }

    const uniqueRegioesSaudeMap = new Map<string, any>();
    const uniqueMunicipiosMap = new Map<string, any>();
    const uniqueEstabelecimentosMap = new Map<string, any>();
    const uniqueTiposEquipeMap = new Map<string, any>();
    const uniqueEquipesSaudeMap = new Map<string, any>();
    const fatosToInsert: any[] = [];

    for (const row of rawData) {
      // Ignorar linhas sem chaves mínimas de relacionamento
      if (!row.coCnes || !row.coMunicipio) continue;

      // 1. Regiões de Saúde
      if (row.coRegiaoSaude && !uniqueRegioesSaudeMap.has(row.coRegiaoSaude)) {
        uniqueRegioesSaudeMap.set(row.coRegiaoSaude, {
          codigo: row.coRegiaoSaude,
          nome: row.noRegiaoSaude || "Não informado",
          ufSigla: row.sgUf,
        });
      }

      // 2. Municípios (Complemento SUS)
      if (!uniqueMunicipiosMap.has(row.coMunicipio)) {
        uniqueMunicipiosMap.set(row.coMunicipio, {
          codigoIbge: row.coMunicipio,
          codigoIbge6: row.coMunicipio.substring(0, 6),
          nome: row.noMunicipio || "Não informado",
          ufSigla: row.sgUf || "NI",
          regiaoSaudeCodigo: row.coRegiaoSaude,
          codigoRegint: row.coRegint,
          codigoMicrorregiao: row.coMicrorregiao,
          codigoMacrorregional: row.coMacrorregional,
          nomeMacrorregional: row.noMacrorregional,
          tipologia: row.tipologia,
          populacao: row.nuPopulacao ? parseInt(row.nuPopulacao, 10) : null,
          stCapital: row.stCapital === "SIM" || row.stCapital === "1" || row.stCapital?.toLowerCase() === "true",
          stAmazonia: row.stAmazonia === "SIM" || row.stAmazonia === "1" || row.stAmazonia?.toLowerCase() === "true",
          stFronteira: row.stFronteira === "SIM" || row.stFronteira === "1" || row.stFronteira?.toLowerCase() === "true",
        });
      }

      // 3. Estabelecimentos de Saúde
      if (!uniqueEstabelecimentosMap.has(row.coCnes)) {
        uniqueEstabelecimentosMap.set(row.coCnes, {
          codigoCnes: row.coCnes,
          nomeFantasia: row.noFantasia,
          municipioIbge: row.coMunicipio,
          tipoUnidadeCodigo: row.tpUnidade,
          tipoUnidadeDescricao: row.dsTipoUnidade,
          logradouro: row.noLogradouro,
          cep: row.coCep,
          turnoAtendimento: row.coTurnoAtendimento,
          latitude: row.latitude,
          longitude: row.longitude,
          geometry: row.geometry,
        });
      }

      if (row.coEquipe) {
        // 4. Tipos de Equipe
        const tipoEquipeCodigo = row.tpEquipe || "NI";
        if (!uniqueTiposEquipeMap.has(tipoEquipeCodigo)) {
          uniqueTiposEquipeMap.set(tipoEquipeCodigo, {
            codigo: tipoEquipeCodigo,
            sigla: row.sgEquipe,
            nome: row.dsTipoEquipe || row.dsEquipe || "Não informado",
            subtipo: row.coSubTipoEquipe,
          });
        }

        // 5. Equipes de Saúde
        if (!uniqueEquipesSaudeMap.has(row.coEquipe)) {
          uniqueEquipesSaudeMap.set(row.coEquipe, {
            codigoIne: row.coEquipe,
            codigoCnes: row.coCnes,
            municipioIbge: row.coMunicipio,
            tipoEquipeCodigo: tipoEquipeCodigo,
            nomeReferencia: row.noReferencia,
            areaCodigo: row.coArea,
            modalidade: row.modalidadde,
            equipesVinculadas: row.equipesVinculadas ? parseInt(row.equipesVinculadas, 10) : 0,
            stAtiva: row.stAtiva === "SIM" || row.stAtiva === "1" || row.stAtiva?.toLowerCase() === "true",
            stEquipeValida: row.stEquipeValida,
          });
        }

        // 6. Fato: Mapas SUS Equipes Indicadores
        fatosToInsert.push({
          codigoEquipe: row.coEquipe,
          codigoCnes: row.coCnes,
          municipioIbge: row.coMunicipio,
          cadastrosAcompanhados: row.cadastrosAcompanhados ? parseInt(row.cadastrosAcompanhados, 10) : 0,
          cadastrosVinculados: row.cadastrosVinculados ? parseInt(row.cadastrosVinculados, 10) : 0,
          pct: row.pct ? parseFloat(row.pct) : 0,
          indigenas: row.indigenas ? parseInt(row.indigenas, 10) : 0,
          ribeirinhos: row.ribeirinhos ? parseInt(row.ribeirinhos, 10) : 0,
          quilombolas: row.quilombolas ? parseInt(row.quilombolas, 10) : 0,
          pescadores: row.pescadores ? parseInt(row.pescadores, 10) : 0,
          assentada: row.assentada ? parseInt(row.assentada, 10) : 0,
          parametroCadastral: row.parametroCadastral ? parseInt(row.parametroCadastral, 10) : 0,
          cadastrosPrevine: row.cadastrosPrevine ? parseInt(row.cadastrosPrevine, 10) : 0,
          dentroMunicipio: row.dentroMunicipio === "SIM" || row.dentroMunicipio === "1" || row.dentroMunicipio?.toLowerCase() === "true",
        });
      }
    }

    const regioesSaudeValues = Array.from(uniqueRegioesSaudeMap.values());
    const municipiosValues = Array.from(uniqueMunicipiosMap.values());
    const estabelecimentosValues = Array.from(uniqueEstabelecimentosMap.values());
    const tiposEquipeValues = Array.from(uniqueTiposEquipeMap.values());
    const equipesSaudeValues = Array.from(uniqueEquipesSaudeMap.values());

    log.info({ 
      data: [{ 
        regioesSaude: regioesSaudeValues.length,
        municipios: municipiosValues.length,
        estabelecimentos: estabelecimentosValues.length,
        tiposEquipe: tiposEquipeValues.length,
        equipesSaude: equipesSaudeValues.length,
        fatos: fatosToInsert.length
      }] 
    }, "Iniciando UPSERTs nas tabelas dimensionais e inserção na tabela fato");

    const chunkSize = 1000;

    // UPSERT Regioes de Saúde
    for (let i = 0; i < regioesSaudeValues.length; i += chunkSize) {
      await db.insert(regioesSaude)
        .values(regioesSaudeValues.slice(i, i + chunkSize))
        .onDuplicateKeyUpdate({
          set: {
            nome: sql`VALUES(nome)`,
            ufSigla: sql`VALUES(uf_sigla)`,
          },
        });
    }

    // UPSERT Municipios
    for (let i = 0; i < municipiosValues.length; i += chunkSize) {
      await db.insert(municipios)
        .values(municipiosValues.slice(i, i + chunkSize))
        .onDuplicateKeyUpdate({
          set: {
            nome: sql`COALESCE(municipios.nome, VALUES(nome))`,
            ufSigla: sql`COALESCE(municipios.uf_sigla, VALUES(uf_sigla))`,
            regiaoSaudeCodigo: sql`COALESCE(VALUES(regiao_saude_codigo), municipios.regiao_saude_codigo)`,
            codigoRegint: sql`COALESCE(VALUES(codigo_regint), municipios.codigo_regint)`,
            codigoMicrorregiao: sql`COALESCE(VALUES(codigo_microrregiao), municipios.codigo_microrregiao)`,
            codigoMacrorregional: sql`COALESCE(VALUES(codigo_macrorregional), municipios.codigo_macrorregional)`,
            nomeMacrorregional: sql`COALESCE(VALUES(nome_macrorregional), municipios.nome_macrorregional)`,
            tipologia: sql`COALESCE(VALUES(tipologia), municipios.tipologia)`,
            populacao: sql`COALESCE(VALUES(populacao), municipios.populacao)`,
            stCapital: sql`COALESCE(VALUES(st_capital), municipios.st_capital)`,
            stAmazonia: sql`COALESCE(VALUES(st_amazonia), municipios.st_amazonia)`,
            stFronteira: sql`COALESCE(VALUES(st_fronteira), municipios.st_fronteira)`,
          },
        });
    }

    // UPSERT Estabelecimentos de Saúde
    for (let i = 0; i < estabelecimentosValues.length; i += chunkSize) {
      await db.insert(estabelecimentosSaude)
        .values(estabelecimentosValues.slice(i, i + chunkSize))
        .onDuplicateKeyUpdate({
          set: {
            nomeFantasia: sql`VALUES(nome_fantasia)`,
            municipioIbge: sql`VALUES(municipio_ibge)`,
            tipoUnidadeCodigo: sql`VALUES(tipo_unidade_codigo)`,
            tipoUnidadeDescricao: sql`VALUES(tipo_unidade_descricao)`,
            logradouro: sql`VALUES(logradouro)`,
            cep: sql`VALUES(cep)`,
            turnoAtendimento: sql`VALUES(turno_atendimento)`,
            latitude: sql`VALUES(latitude)`,
            longitude: sql`VALUES(longitude)`,
            geometry: sql`VALUES(geometry)`,
          },
        });
    }

    // UPSERT Tipos de Equipe
    for (let i = 0; i < tiposEquipeValues.length; i += chunkSize) {
      await db.insert(tiposEquipe)
        .values(tiposEquipeValues.slice(i, i + chunkSize))
        .onDuplicateKeyUpdate({
          set: {
            sigla: sql`VALUES(sigla)`,
            nome: sql`VALUES(nome)`,
            subtipo: sql`VALUES(subtipo)`,
          },
        });
    }

    // UPSERT Equipes de Saúde
    for (let i = 0; i < equipesSaudeValues.length; i += chunkSize) {
      await db.insert(equipesSaude)
        .values(equipesSaudeValues.slice(i, i + chunkSize))
        .onDuplicateKeyUpdate({
          set: {
            codigoCnes: sql`VALUES(codigo_cnes)`,
            municipioIbge: sql`VALUES(municipio_ibge)`,
            tipoEquipeCodigo: sql`VALUES(tipo_equipe_codigo)`,
            nomeReferencia: sql`VALUES(nome_referencia)`,
            areaCodigo: sql`VALUES(area_codigo)`,
            modalidade: sql`VALUES(modalidade)`,
            equipesVinculadas: sql`VALUES(equipes_vinculadas)`,
            stAtiva: sql`VALUES(st_ativa)`,
            stEquipeValida: sql`VALUES(st_equipe_valida)`,
          },
        });
    }

    // CLEAN & INSERT Fatos
    await db.delete(mapasSusEquipesIndicadores);
    
    for (let i = 0; i < fatosToInsert.length; i += chunkSize) {
      await db.insert(mapasSusEquipesIndicadores)
        .values(fatosToInsert.slice(i, i + chunkSize));
    }

    log.info({ data: [] }, "Transformação e carga de mapas_sus_unidades_cnes_realocadas concluídas com sucesso");
  } catch (error) {
    log.error({ data: [error] }, "Erro durante a transformação de mapas_sus_unidades_cnes_realocadas");
    throw error;
  }
}