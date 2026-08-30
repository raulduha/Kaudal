import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";

/**
 * Ruta 1 (flagship) — Agente de ejemplo, nativo en Mastra.
 * Cambia instrucciones/modelo para adaptarlo. El modelo se elige acá.
 */
export const MODELO = "claude-3-5-sonnet-latest";

export const agente = new Agent({
  name: "Agente de Atención",
  instructions:
    "Eres un asistente de atención al cliente de una PYME chilena. " +
    "Respondes claro, breve y en español de Chile. " +
    "Si no sabes algo con certeza, lo dices y ofreces derivar a una persona. Nunca inventes datos.",
  model: anthropic(MODELO),
});
