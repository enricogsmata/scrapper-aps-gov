// src/transformers/cobertura-da-aps/mapasSusTransformer.ts
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pino from "pino";
import { raw_db } from "../../database/raw_db/connection.js";
import { mapasSusUnidadesCnesRealocadas } from "../../database/raw_db/schema.js";

const execFileAsync = promisify(execFile);
const logger = pino();

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
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
    files = await fs.promises.readdir(dirPath);
  } catch (error) {
    logger.error({ error, dirPath }, "Diretório não encontrado ou inacessível.");
    return;
  }

  const gpkgFiles = files.filter((file) => file.endsWith(".gpkg"));

  for (const gpkgFile of gpkgFiles) {
    const gpkgPath = path.join(dirPath, gpkgFile);
    const csvFileName = `${path.parse(gpkgFile).name}.csv`;
    const csvPath = path.join(dirPath, csvFileName);

    try {
      await execFileAsync("ogr2ogr", [
        "-f",
        "CSV",
        csvPath,
        gpkgPath,
        "-lco",
        "GEOMETRY=AS_GEOJSON",
      ]);
    } catch (conversionError) {
      logger.error(
        { conversionError, gpkgFile },
        "Falha ao converter GPKG para CSV via ogr2ogr."
      );
    }
  }

  try {
    files = await fs.promises.readdir(dirPath);
  } catch (error) {
    logger.error({ error, dirPath }, "Erro ao atualizar listagem do diretório.");
    return;
  }

  const csvFiles = files.filter((file) => file.endsWith(".csv"));

  for (const file of csvFiles) {
    const filePath = path.join(dirPath, file);
    try {
      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let headers: string[] = [];
      let records: (typeof mapasSusUnidadesCnesRealocadas.$inferInsert)[] = [];
      let totalInserted = 0;
      const batchSize = 1000;

      for await (const line of rl) {
        if (!line.trim()) continue;

        if (headers.length === 0) {
          headers = parseCsvLine(line).map((h) => h.trim());
          continue;
        }

        const values = parseCsvLine(line);
        const row: Record<string, string> = {};
        for (let i = 0; i < headers.length; i++) {
          row[headers[i]] = values[i]?.trim() ?? "";
        }

        records.push({
          geometry: row.geometry ?? "",
          latitude: row.latitude ?? "",
          longitude: row.longitude ?? "",
          coEquipe: row.CO_EQUIPE ?? "",
          sgEquipe: row.SG_EQUIPE ?? "",
          coSubTipoEquipe: row.CO_SUB_TIPO_EQUIPE ?? "",
          tpEquipe: row.TP_EQUIPE ?? "",
          dsEquipe: row.DS_EQUIPE ?? "",
          dsTipoEquipe: row.DS_TIPO_EQUIPE ?? "",
          dsValidacaoComposicacao: row.DS_VALIDACAO_COMPOSICACAO ?? "",
          modalidadde: row.MODALIDADDE ?? "",
          equipesVinculadas: row.EQUIPES_VINCULADAS ?? "",
          noReferencia: row.NO_REFERENCIA ?? "",
          coArea: row.CO_AREA ?? "",
          coCnes: row.CO_CNES ?? "",
          noFantasia: row.NO_FANTASIA ?? "",
          noLogradouro: row.NO_LOGRADOURO ?? "",
          coCep: row.CO_CEP ?? "",
          tpUnidade: row.TP_UNIDADE ?? "",
          dsTipoUnidade: row.DS_TIPO_UNIDADE ?? "",
          coTurnoAtendimento: row.CO_TURNO_ATENDIMENTO ?? "",
          coMunicipio: row.CO_MUNICIPIO ?? "",
          noMunicipio: row.NO_MUNICIPIO ?? "",
          coRegint: row.CO_REGINT ?? "",
          coMicrorregiao: row.CO_MICRORREGIAO ?? "",
          coRegiaoSaude: row.CO_REGIAO_SAUDE ?? "",
          noRegiaoSaude: row.NO_REGIAO_SAUDE ?? "",
          coMacrorregional: row.CO_MACRORREGIONAL ?? "",
          noMacrorregional: row.NO_MACRORREGIONAL ?? "",
          coUfIbge: row.CO_UF_IBGE ?? "",
          sgUf: row.SG_UF ?? "",
          noUf: row.NO_UF ?? "",
          noRegiao: row.NO_REGIAO ?? "",
          cadastrosAcompanhados: row.CADASTROS_ACOMPANHADOS ?? "",
          cadastrosVinculados: row.CADASTROS_VINCULADOS ?? "",
          pct: row.PCT ?? "",
          indigenas: row.INDIGENAS ?? "",
          ribeirinhos: row.RIBEIRINHOS ?? "",
          quilombolas: row.QUILOMBOLAS ?? "",
          pescadores: row.PESCADORES ?? "",
          assentada: row.ASSENTADA ?? "",
          parametroCadastral: row.PARAMETRO_CADASTRAL ?? "",
          cadastrosPrevine: row.CADASTROS_PREVINE ?? "",
          nuPopulacao: row.NU_POPULACAO ?? "",
          nuAnoPopulacao: row.NU_ANO_POPULACAO ?? "",
          tipologia: row.TIPOLOGIA ?? "",
          stCapital: row.ST_CAPITAL ?? "",
          stAmazonia: row.ST_AMAZONIA ?? "",
          stFronteira: row.ST_FRONTEIRA ?? "",
          stAtiva: row.ST_ATIVA ?? "",
          stEquipeValida: row.ST_EQUIPE_VALIDA ?? "",
          latitude1: row.LATITUDE_1 ?? "",
          longitude1: row.LONGITUDE_1 ?? "",
          dentroMunicipio: row.DENTRO_MUNICIPIO ?? "",
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

      logger.info({ file, totalInserted }, "Arquivo processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo.");
    }
  }
}