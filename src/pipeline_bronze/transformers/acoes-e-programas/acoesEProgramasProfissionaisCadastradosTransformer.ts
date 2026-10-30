// src/transformers/acoes-e-programas/profissionaisCadastradosProgramasTransformer.ts
import fs from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import pino from "pino";
import { raw_db } from "../../../database/raw_db/connection.js";
import { acoesEProgramasProfissionaisCadastrados } from "../../../database/raw_db/schema.js"; 

const logger = pino();

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

export async function transformprofissionaisCadastradosProgramas(): Promise<void> {
    const dirPath = path.resolve(
        process.cwd(),
        "downloads",
        "ações-e-programas",
        "profissionais-cadastrados"
    );

    let files: string[];
    try {
        files = await fs.readdir(dirPath);
    } catch (error) {
        logger.error({ error, dirPath }, "Diretório não encontrado ou inacessível.");
        return;
    }

    const excelFiles = files.filter(
        (file) => file.endsWith(".xlsx") || file.endsWith(".xls")
    );

    await raw_db.delete(acoesEProgramasProfissionaisCadastrados);

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
                        normalized.includes("nome") &&
                        normalized.includes("uf") &&
                        normalized.includes("ibge")
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
                            getValue(row, "nome") ||
                            getValue(row, "uf") ||
                            getValue(row, "ibge")
                    )
                    .map((row) => ({
                        nome: getValue(row, "nome"),
                        ciclo: getValue(row, "ciclo"),
                        perfil: getValue(row, "perfil"),
                        uf: getValue(row, "uf"),
                        ibge: getValue(row, "ibge"),
                        municipio: getValue(row, "municipio"),
                        competencia: getValue(row, "competencia"),
                    }));

                if (records.length === 0) continue;

                const batchSize = 1000;
                for (let i = 0; i < records.length; i += batchSize) {
                    const batch = records.slice(i, i + batchSize);
                    // CORREÇÃO: Inserindo na tabela raw correta
                    await raw_db.insert(acoesEProgramasProfissionaisCadastrados).values(batch);
                }
            }

            logger.info({ file }, "Arquivo Profissionais Cadastrados processado com sucesso.");
        } catch (error) {
            logger.error({ error, file }, "Erro ao processar arquivo Profissionais Cadastrados.");
        }
    }
}