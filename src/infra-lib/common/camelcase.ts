const IDENTIFIER = /([\p{Alpha}\p{N}_]|$)/u;
const SEPARATORS = /[_.\- ]+/;

const LEADING_SEPARATORS = new RegExp("^" + SEPARATORS.source);
const SEPARATORS_AND_IDENTIFIER = new RegExp(SEPARATORS.source + IDENTIFIER.source, "gu");
const NUMBERS_AND_IDENTIFIER = new RegExp("\\d+" + IDENTIFIER.source, "gu");
const NON_ALPHA_NUMERIC = /[^a-zA-Z\d]/g;

const postProcess = (input: string) => {
  return input
    .replace(NUMBERS_AND_IDENTIFIER, (match, pattern, offset) =>
      ["_", "-"].includes(input.charAt(offset + match.length)) ? match : match.toUpperCase()
    )
    .replace(SEPARATORS_AND_IDENTIFIER, (_, identifier) => identifier.toUpperCase())
    .replace(NON_ALPHA_NUMERIC, "");
};

/**
 * This code is simplified logic of camelcase node module code
 *
 * @param input
 * @returns
 */
export const camelCase = (input: string | string[]) => {
  if (!Array.isArray(input)) {
    input = [input];
  }

  let resInput: string = "";
  resInput = input
    .map((x) => x.trim())
    .filter((x) => x.length)
    .join("-");

  if (resInput.length === 0) {
    return resInput;
  }

  resInput = resInput.replace(LEADING_SEPARATORS, "");
  resInput = resInput.toLowerCase();

  resInput = resInput.charAt(0).toUpperCase() + resInput.slice(1);

  return postProcess(resInput);
};
