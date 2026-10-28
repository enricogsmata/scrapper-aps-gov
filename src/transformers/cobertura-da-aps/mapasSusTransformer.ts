// src/transformers/cobertura-da-aps/mapasSusTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3"
import pino from "pino";
import { raw_db } from "../../database/raw_db/connection.js";
import { mapasSusUnidadesCnesRealocadas } from "../../database/raw_db/schema.js";

const logger = pino();

function extractGeoJsonGeometry(geomBuffer: Buffer | null): string {
  if (!geomBuffer || geomBuffer.length < 8) return "";
  if (geomBuffer[0] !== 0x47 || geomBuffer[1] !== 0x50) return "";

  const flags = geomBuffer[3] ?? 0;
  const envelopeType = (flags >> 1) & 0x07;
  const envelopeLengths: Record<number, number> = {
    0: 0,
    1: 32,
    2: 48,
    3: 48,
    4: 64,
  };
  const offset = 8 + (envelopeLengths[envelopeType] ?? 0);
  if (geomBuffer.length < offset + 21) return "";

  const byteOrder = geomBuffer[offset];
  const isLittleEndian = byteOrder === 1;

  const geomType = isLittleEndian
    ? geomBuffer.readUInt32LE(offset + 1)
    : geomBuffer.readUInt32BE(offset + 1);

  if (geomType === 1) {
    const x = isLittleEndian
      ? geomBuffer.readDoubleLE(offset + 5)
      : geomBuffer.readDoubleBE(offset + 5);
    const y = isLittleEndian
      ? geomBuffer.readDoubleLE(offset + 13)
      : geomBuffer.readDoubleBE(offset + 13);

    return JSON.stringify({
      type: "Point",
      coordinates: [x, y],
    });
  }

  return "";
}

export async function transformMapasSus(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "cobertura-da-aps",
    "mapas-sus"
  );

  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch (error) {
    logger.error({ error, dirPath }, "Diretório não encontrado ou inacessível.");
    return;
  }

  const gpkgFiles = files.filter((file) => file.endsWith(".gpkg"));

  for (const file of gpkgFiles) {
    const filePath = path.join(dirPath, file);
    let sqliteDb: Database.Database | null = null;

    try {
      sqliteDb = new Database(filePath, { readonly: true });

      const gpkgContents = sqliteDb
        .prepare<[], { table_name: string }>(
          "SELECT table_name FROM gpkg_contents WHERE data_type = 'features'"
        )
        .all();

      const featureTables = gpkgContents.map((row: any) => row.table_name);
      if (featureTables.length === 0) {
        const userTables = sqliteDb
          .prepare<[], { name: string }>(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'gpkg_%' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'rtree_%'"
          )
          .all();
        featureTables.push(...userTables.map((t: any) => t.name));
      }

      for (const tableName of featureTables) {
        const rows = sqliteDb
          .prepare(`SELECT * FROM "${tableName}"`)
          .all() as Record<string, unknown>[];

        if (rows.length === 0) continue;

        let records: (typeof mapasSusUnidadesCnesRealocadas.$inferInsert)[] = [];
        const batchSize = 1000;
        let totalInserted = 0;

        for (const row of rows) {
          const rawGeom = row.geom ?? row.geometry;
          const geometryJson = Buffer.isBuffer(rawGeom)
            ? extractGeoJsonGeometry(rawGeom)
            : rawGeom != null
              ? String(rawGeom).trim()
              : "";

          records.push({
            geometry: geometryJson,
            latitude: row.latitude != null ? String(row.latitude).trim() : "",
            longitude: row.longitude != null ? String(row.longitude).trim() : "",
            coEquipe: row.CO_EQUIPE != null ? String(row.CO_EQUIPE).trim() : "",
            sgEquipe: row.SG_EQUIPE != null ? String(row.SG_EQUIPE).trim() : "",
            coSubTipoEquipe:
              row.CO_SUB_TIPO_EQUIPE != null
                ? String(row.CO_SUB_TIPO_EQUIPE).trim()
                : "",
            tpEquipe: row.TP_EQUIPE != null ? String(row.TP_EQUIPE).trim() : "",
            dsEquipe: row.DS_EQUIPE != null ? String(row.DS_EQUIPE).trim() : "",
            dsTipoEquipe:
              row.DS_TIPO_EQUIPE != null ? String(row.DS_TIPO_EQUIPE).trim() : "",
            dsValidacaoComposicacao:
              row.DS_VALIDACAO_COMPOSICACAO != null
                ? String(row.DS_VALIDACAO_COMPOSICACAO).trim()
                : "",
            modalidadde:
              row.MODALIDADDE != null ? String(row.MODALIDADDE).trim() : "",
            equipesVinculadas:
              row.EQUIPES_VINCULADAS != null
                ? String(row.EQUIPES_VINCULADAS).trim()
                : "",
            noReferencia:
              row.NO_REFERENCIA != null ? String(row.NO_REFERENCIA).trim() : "",
            coArea: row.CO_AREA != null ? String(row.CO_AREA).trim() : "",
            coCnes: row.CO_CNES != null ? String(row.CO_CNES).trim() : "",
            noFantasia:
              row.NO_FANTASIA != null ? String(row.NO_FANTASIA).trim() : "",
            noLogradouro:
              row.NO_LOGRADOURO != null ? String(row.NO_LOGRADOURO).trim() : "",
            coCep: row.CO_CEP != null ? String(row.CO_CEP).trim() : "",
            tpUnidade:
              row.TP_UNIDADE != null ? String(row.TP_UNIDADE).trim() : "",
            dsTipoUnidade:
              row.DS_TIPO_UNIDADE != null
                ? String(row.DS_TIPO_UNIDADE).trim()
                : "",
            coTurnoAtendimento:
              row.CO_TURNO_ATENDIMENTO != null
                ? String(row.CO_TURNO_ATENDIMENTO).trim()
                : "",
            coMunicipio:
              row.CO_MUNICIPIO != null ? String(row.CO_MUNICIPIO).trim() : "",
            noMunicipio:
              row.NO_MUNICIPIO != null ? String(row.NO_MUNICIPIO).trim() : "",
            coRegint:
              row.CO_REGINT != null ? String(row.CO_REGINT).trim() : "",
            coMicrorregiao:
              row.CO_MICRORREGIAO != null
                ? String(row.CO_MICRORREGIAO).trim()
                : "",
            coRegiaoSaude:
              row.CO_REGIAO_SAUDE != null
                ? String(row.CO_REGIAO_SAUDE).trim()
                : "",
            noRegiaoSaude:
              row.NO_REGIAO_SAUDE != null
                ? String(row.NO_REGIAO_SAUDE).trim()
                : "",
            coMacrorregional:
              row.CO_MACRORREGIONAL != null
                ? String(row.CO_MACRORREGIONAL).trim()
                : "",
            noMacrorregional:
              row.NO_MACRORREGIONAL != null
                ? String(row.NO_MACRORREGIONAL).trim()
                : "",
            coUfIbge:
              row.CO_UF_IBGE != null ? String(row.CO_UF_IBGE).trim() : "",
            sgUf: row.SG_UF != null ? String(row.SG_UF).trim() : "",
            noUf: row.NO_UF != null ? String(row.NO_UF).trim() : "",
            noRegiao: row.NO_REGIAO != null ? String(row.NO_REGIAO).trim() : "",
            cadastrosAcompanhados:
              row.CADASTROS_ACOMPANHADOS != null
                ? String(row.CADASTROS_ACOMPANHADOS).trim()
                : "",
            cadastrosVinculados:
              row.CADASTROS_VINCULADOS != null
                ? String(row.CADASTROS_VINCULADOS).trim()
                : "",
            pct: row.PCT != null ? String(row.PCT).trim() : "",
            indigenas:
              row.INDIGENAS != null ? String(row.INDIGENAS).trim() : "",
            ribeirinhos:
              row.RIBEIRINHOS != null ? String(row.RIBEIRINHOS).trim() : "",
            quilombolas:
              row.QUILOMBOLAS != null ? String(row.QUILOMBOLAS).trim() : "",
            pescadores:
              row.PESCADORES != null ? String(row.PESCADORES).trim() : "",
            assentada:
              row.ASSENTADA != null ? String(row.ASSENTADA).trim() : "",
            parametroCadastral:
              row.PARAMETRO_CADASTRAL != null
                ? String(row.PARAMETRO_CADASTRAL).trim()
                : "",
            cadastrosPrevine:
              row.CADASTROS_PREVINE != null
                ? String(row.CADASTROS_PREVINE).trim()
                : "",
            nuPopulacao:
              row.NU_POPULACAO != null ? String(row.NU_POPULACAO).trim() : "",
            nuAnoPopulacao:
              row.NU_ANO_POPULACAO != null
                ? String(row.NU_ANO_POPULACAO).trim()
                : "",
            tipologia:
              row.TIPOLOGIA != null ? String(row.TIPOLOGIA).trim() : "",
            stCapital:
              row.ST_CAPITAL != null ? String(row.ST_CAPITAL).trim() : "",
            stAmazonia:
              row.ST_AMAZONIA != null ? String(row.ST_AMAZONIA).trim() : "",
            stFronteira:
              row.ST_FRONTEIRA != null ? String(row.ST_FRONTEIRA).trim() : "",
            stAtiva: row.ST_ATIVA != null ? String(row.ST_ATIVA).trim() : "",
            stEquipeValida:
              row.ST_EQUIPE_VALIDA != null
                ? String(row.ST_EQUIPE_VALIDA).trim()
                : "",
            latitude1:
              row.LATITUDE_1 != null ? String(row.LATITUDE_1).trim() : "",
            longitude1:
              row.LONGITUDE_1 != null ? String(row.LONGITUDE_1).trim() : "",
            dentroMunicipio:
              row.DENTRO_MUNICIPIO != null
                ? String(row.DENTRO_MUNICIPIO).trim()
                : "",
          });

          if (records.length >= batchSize) {
            await raw_db.insert(mapasSusUnidadesCnesRealocadas).values(records);
            totalInserted += records.length;
            records = [];
          }
        }

        if (records.length > 0) {
          await raw_db.insert(mapasSusUnidadesCnesRealocadas).values(records);
          totalInserted += records.length;
        }

        logger.info(
          { file, tableName, totalInserted },
          "Tabela GPKG processada com sucesso."
        );
      }
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo GPKG.");
    } finally {
      if (sqliteDb) {
        sqliteDb.close();
      }
    }
  }
}