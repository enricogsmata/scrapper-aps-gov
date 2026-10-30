// src/transformers/acoes-e-programas/acoesEProgramasAdesaoPseTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../../database/raw_db/connection.js";
import { acoesEProgramasAdesaoPse } from "../../../database/raw_db/schema.js";

const logger = pino();

interface AdesaoPseJsonItem {
  coMunicipioIbge?: unknown;
  sgUf?: unknown;
  noUfAcentuado?: unknown;
  noMunicipioAcentuado?: unknown;
  coSeqPseEstabelecimento?: unknown;
  noEstabelecimento?: unknown;
  qtdEducandos?: unknown;
  qtMatriculaCreche?: unknown;
  qtMatriculaPreEscola?: unknown;
  qtMatriculaFundamental?: unknown;
  qtMatriculaMedio?: unknown;
  qtMatriculaProfissional?: unknown;
  qtMatriculaEja?: unknown;
  dsEsferaAdministrativa?: unknown;
  dsPseLocalizacao?: unknown;
  dsLocalizacaoDiferenciada?: unknown;
  stAdesao?: unknown;
  stPrioritario?: unknown;
  stMaioriaPbf?: unknown;
  stSinase?: unknown;
  stAdesaoNutrisus?: unknown;
  stObesidade?: unknown;
  nuCiclo?: unknown;
}

interface AdesaoPseJsonPayload {
  data?: unknown;
  adesoes?: AdesaoPseJsonItem[];
}

function normalizeHeader(key: string): string {
  return key
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function getValue(
  row: Record<string, unknown>,
  normalizedTarget: string
): string {
  for (const [key, value] of Object.entries(row)) {
    if (normalizeHeader(key) === normalizedTarget) {
      return value != null ? String(value).trim() : "";
    }
  }
  return "";
}

export async function transformAcoesEProgramasAdesaoPse(): Promise<void> {
  const dirPath = path.resolve(
    process.cwd(),
    "downloads",
    "ações-e-programas",
    "adesao-pse"
  );

  let files: string[];
  try {
    files = await fs.readdir(dirPath);
  } catch (error) {
    logger.error({ error, dirPath }, "Diretório não encontrado ou inacessível.");
    return;
  }

  await raw_db.delete(acoesEProgramasAdesaoPse);

  const jsonFiles = files.filter((file) => file.endsWith(".json"));
  const excelFiles = files.filter(
    (file) => file.endsWith(".xlsx") || file.endsWith(".xls")
  );

  for (const file of jsonFiles) {
    const filePath = path.join(dirPath, file);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed: AdesaoPseJsonPayload = JSON.parse(content);
      const items = Array.isArray(parsed.adesoes) ? parsed.adesoes : [];

      if (items.length === 0) continue;

      const dataStr = parsed.data != null ? String(parsed.data).trim() : "";

      const records = items.map((item) => ({
        uf: item.sgUf != null ? String(item.sgUf).trim() : "",
        municipio: item.noMunicipioAcentuado != null ? String(item.noMunicipioAcentuado).trim() : "",
        ibge: item.coMunicipioIbge != null ? String(item.coMunicipioIbge).trim() : "",
        ciclo: item.nuCiclo != null ? String(item.nuCiclo).trim() : "",
        tipoDeLocalizacao: item.dsPseLocalizacao != null ? String(item.dsPseLocalizacao).trim() : "",
        localizacaoDiferenciada: item.dsLocalizacaoDiferenciada != null ? String(item.dsLocalizacaoDiferenciada).trim() : "",
        esferaAdministrativa: item.dsEsferaAdministrativa != null ? String(item.dsEsferaAdministrativa).trim() : "",
        inep: item.coSeqPseEstabelecimento != null ? String(item.coSeqPseEstabelecimento).trim() : "",
        nomeDaEscola: item.noEstabelecimento != null ? String(item.noEstabelecimento).trim() : "",
        quantidadeEducandos: item.qtdEducandos != null ? String(item.qtdEducandos).trim() : "",
        quantidadeCreche: item.qtMatriculaCreche != null ? String(item.qtMatriculaCreche).trim() : "",
        quantidadePreEscola: item.qtMatriculaPreEscola != null ? String(item.qtMatriculaPreEscola).trim() : "",
        quantidadeFundamental: item.qtMatriculaFundamental != null ? String(item.qtMatriculaFundamental).trim() : "",
        quantidadeMedio: item.qtMatriculaMedio != null ? String(item.qtMatriculaMedio).trim() : "",
        quantidadeProfissional: item.qtMatriculaProfissional != null ? String(item.qtMatriculaProfissional).trim() : "",
        quantidadeEja: item.qtMatriculaEja != null ? String(item.qtMatriculaEja).trim() : "",
        situacaoAdesao: item.stAdesao != null ? String(item.stAdesao).trim() : "",
        parteDoGrupoPrioritario: item.stPrioritario != null ? String(item.stPrioritario).trim() : "",
        possuiMaisDe50DosEducandosNoBfa: item.stMaioriaPbf != null ? String(item.stMaioriaPbf).trim() : "",
        participaDoSistemaNacionalDeAcompanhamentoDeMedidasSocioeducativas: item.stSinase != null ? String(item.stSinase).trim() : "",
        participouDoNutrisus: item.stAdesaoNutrisus != null ? String(item.stAdesaoNutrisus).trim() : "",
        aderiuAoProgramaDeObesidade: item.stObesidade != null ? String(item.stObesidade).trim() : "",
        data: dataStr,
        noUfAcentuado: item.noUfAcentuado != null ? String(item.noUfAcentuado).trim() : "",
      }));

      const batchSize = 1000;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await raw_db.insert(acoesEProgramasAdesaoPse).values(batch);
      }

      logger.info({ file, count: records.length }, "Arquivo JSON processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo JSON.");
    }
  }

  for (const file of excelFiles) {
    const filePath = path.join(dirPath, file);
    try {
      const fileBuffer = await fs.readFile(filePath);
      const workbook = xlsx.read(fileBuffer, { type: "buffer" });

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;

        const rawRows = xlsx.utils.sheet_to_json<unknown[]>(worksheet, {
          header: 1,
          defval: "",
        });

        let headerIdx = -1;
        for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
          const rowLine = (rawRows[i] ?? []).map((c) => String(c).trim());
          const normalized = rowLine.map(normalizeHeader);
          if (
            normalized.includes("uf") &&
            normalized.includes("ibge") &&
            normalized.includes("inep")
          ) {
            headerIdx = i;
            break;
          }
        }

        if (headerIdx === -1) continue;

        const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
          range: headerIdx,
          defval: "",
        });

        if (rows.length === 0) continue;

        const records = rows
          .filter(
            (row) =>
              getValue(row, "uf") ||
              getValue(row, "ibge") ||
              getValue(row, "inep")
          )
          .map((row) => ({
            uf: getValue(row, "uf"),
            municipio: getValue(row, "municipio"),
            ibge: getValue(row, "ibge"),
            ciclo: getValue(row, "ciclo"),
            tipoDeLocalizacao:
              getValue(row, "tipodelocalizacacao") ||
              getValue(row, "tipodelocalizacao"),
            localizacaoDiferenciada: getValue(row, "localizacaodiferenciada"),
            esferaAdministrativa: getValue(row, "esferaadministrativa"),
            inep: getValue(row, "inep"),
            nomeDaEscola: getValue(row, "nomedaescola"),
            quantidadeEducandos: getValue(row, "quantidadeeducandos"),
            quantidadeCreche: getValue(row, "quantidadecreche"),
            quantidadePreEscola: getValue(row, "quantidadepreescola"),
            quantidadeFundamental: getValue(row, "quantidadefundamental"),
            quantidadeMedio: getValue(row, "quantidademedio"),
            quantidadeProfissional: getValue(row, "quantidadeprofissional"),
            quantidadeEja: getValue(row, "quantidadeeja"),
            situacaoAdesao: getValue(row, "situacaoadesao"),
            parteDoGrupoPrioritario: getValue(row, "partedogrupoprioritario"),
            possuiMaisDe50DosEducandosNoBfa: getValue(
              row,
              "possuimaisde50doseducandosnobfa"
            ),
            participaDoSistemaNacionalDeAcompanhamentoDeMedidasSocioeducativas:
              getValue(
                row,
                "participadosistemanacionaldeacompanhamentodemedidassocioeducativas"
              ),
            participouDoNutrisus: getValue(row, "participoudonutrisus"),
            aderiuAoProgramaDeObesidade: getValue(
              row,
              "aderiuaoprogramadeobesidade"
            ),
            data: "",
            noUfAcentuado: "",
          }));

        if (records.length === 0) continue;

        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await raw_db.insert(acoesEProgramasAdesaoPse).values(batch);
        }
      }

      logger.info({ file }, "Arquivo Adesão PSE processado com sucesso.");
    } catch (error) {
      logger.error({ error, file }, "Erro ao processar arquivo Adesão PSE.");
    }
  }
}