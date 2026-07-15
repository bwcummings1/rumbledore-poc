import type { CentralColumnId } from "./central-columns";
import { CENTRAL_COLUMN_KEYS, CENTRAL_COLUMN_LINEUP } from "./central-columns";

const CENTRAL_GENERATION_KEY_PREFIX = "central-ai";

export function centralGenerationKey({
  columnId,
  triggerKey,
}: {
  columnId: CentralColumnId;
  triggerKey: string;
}): string {
  return `${CENTRAL_GENERATION_KEY_PREFIX}:${columnId}:${triggerKey.trim()}`;
}

export function centralColumnIdFromGenerationKey(
  generationKey: string,
): CentralColumnId | null {
  const prefix = `${CENTRAL_GENERATION_KEY_PREFIX}:`;
  if (!generationKey.startsWith(prefix)) {
    return null;
  }

  const remainder = generationKey.slice(prefix.length);
  const column = CENTRAL_COLUMN_KEYS.map(
    (key) => CENTRAL_COLUMN_LINEUP[key],
  ).find(({ id }) => remainder.startsWith(`${id}:`));
  return column?.id ?? null;
}
