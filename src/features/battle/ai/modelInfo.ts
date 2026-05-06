export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.4-nano";

export function formatBattleAiModelLabel(model: string = DEFAULT_OPENROUTER_MODEL) {
  const slug = model.split("/").pop() || model;
  const parts = slug.split(/[-_]/).filter(Boolean);
  if (parts[0]?.toLowerCase() === "gpt" && parts[1]) {
    return [`GPT-${parts[1]}`, ...parts.slice(2).map(capitalize)].join(" ");
  }
  return parts.map((part) => (part.toLowerCase() === "gpt" ? "GPT" : capitalize(part))).join(" ");
}

export const DEFAULT_BATTLE_AI_MODEL_LABEL = formatBattleAiModelLabel(DEFAULT_OPENROUTER_MODEL);

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
