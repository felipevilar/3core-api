/**
 * Utilitários de dinheiro no formato brasileiro.
 *
 * Valores no banco são NUMERIC (armazenados/trafegados como string para não
 * perder precisão em float). Aqui convertemos entre a string BR ("1.234,56",
 * "R$ 80,00") e um número, e vice-versa.
 */

/**
 * Converte uma string monetária BR (com R$, pontos de milhar e vírgula decimal)
 * para uma string numérica canônica ("1234.56"), ou null se não houver número.
 *
 * Ex.: "R$ 1.234,56" -> "1234.56"; "130,00" -> "130.00"; "" -> null.
 * Extrai o PRIMEIRO token monetário da string (ex. "100 por 3h" -> "100.00"),
 * sem concatenar dígitos de texto solto que venha depois.
 *
 * Desambiguação do ponto (heurística BR, aplicada só ao token extraído):
 *  - se há vírgula, ela é o decimal e o ponto é milhar ("1.234,56" -> 1234.56);
 *  - sem vírgula, um ponto seguido de exatamente 3 dígitos (e sem mais nada) é
 *    milhar ("1.500" -> 1500), assim como múltiplos pontos ("1.234.567");
 *  - sem vírgula, ponto com 1, 2 ou 4+ dígitos após é decimal ("130.00" ->
 *    130.00; "1.5" -> 1.5).
 */
export function parseBrMoney(raw?: string | number | null): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw.toFixed(2) : null;
  }
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Extrai o primeiro número reconhecível (com pontos/vírgulas), sinal opcional.
  const match = trimmed.match(/-?\d[\d.,]*/);
  if (!match) return null;
  const token = match[0];

  let normalized: string;
  if (token.includes(',')) {
    // Vírgula = decimal; pontos = milhar.
    normalized = token.replace(/\./g, '').replace(',', '.');
  } else {
    const dots = token.match(/\./g)?.length ?? 0;
    if (dots === 0) {
      normalized = token;
    } else if (dots > 1) {
      // Múltiplos pontos só fazem sentido como milhar ("1.234.567").
      normalized = token.replace(/\./g, '');
    } else {
      // Um ponto: milhar se seguido de exatamente 3 dígitos ("1.500"),
      // senão decimal ("130.00", "1.5").
      normalized = /\.\d{3}$/.test(token) ? token.replace(/\./g, '') : token;
    }
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return value.toFixed(2);
}

/** Converte string BR para number (0 se inválido). Útil para somas internas. */
export function brMoneyToNumber(raw?: string | number | null): number {
  const parsed = parseBrMoney(raw);
  return parsed === null ? 0 : Number(parsed);
}

/**
 * Soma valores monetários (string/number) com aritmética em centavos para
 * evitar erro de ponto flutuante, retornando string com 2 casas.
 */
export function sumMoney(
  values: Array<string | number | null | undefined>,
): string {
  const cents = values.reduce<number>((acc, v) => {
    const n = brMoneyToNumber(v);
    return acc + Math.round(n * 100);
  }, 0);
  return (cents / 100).toFixed(2);
}

/**
 * Multiplica quantidade × valor unitário em centavos (round-half-up no centavo)
 * e retorna string com 2 casas. Base do valorTotal de uma linha financeira.
 */
export function multiplyMoney(
  quantidade: string | number | null | undefined,
  valorUnitario: string | number | null | undefined,
): string {
  const q = brMoneyToNumber(quantidade);
  const v = brMoneyToNumber(valorUnitario);
  const cents = Math.round(q * v * 100);
  return (cents / 100).toFixed(2);
}
