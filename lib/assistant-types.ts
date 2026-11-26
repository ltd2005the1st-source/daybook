// Neutral chat types shared by the assistant UI and /api/assistant. The route translates them to
// and from the Gemini API, so nothing in the browser depends on a model vendor.
export type TextBlock = { type: "text"; text: string };
/** `signature` is Gemini's opaque thought signature; it must be sent back unchanged with the call. */
export type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown>; signature?: string };
export type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type Block = TextBlock | ToolUseBlock | ToolResultBlock;
export type ChatMessage = { role: "user" | "assistant"; content: string | Block[] };

export type Schema = {
  type: string;
  description?: string;
  enum?: readonly string[];
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
};
export type ToolDef = { name: string; description: string; input_schema: Schema };
