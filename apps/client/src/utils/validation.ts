import { validName } from '@osrs-mcp/shared';

const NAME_RULE_MESSAGE = 'Must be 1-16 characters: letters, digits, spaces, hyphens, and underscores only.';

/** Same rule the server enforces (packages/shared's validName) - kept as a single source of truth. */
export function validateOsrsName(value: string): string | null {
  return validName(value) ? null : NAME_RULE_MESSAGE;
}
