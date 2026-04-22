export const characterRoles: Record<string, { color: string; key: string }> = {
  主角: { color: '#6366f1', key: 'protagonist' },
  女主: { color: '#ec4899', key: 'femaleLead' },
  导师: { color: '#f59e0b', key: 'mentor' },
  反派: { color: '#ef4444', key: 'antagonist' },
  其他: { color: '#6b7280', key: 'other' },
};

export const defaultRoleColor = '#6b7280';

export function getRoleColor(role: string): string {
  return characterRoles[role]?.color || defaultRoleColor;
}

export function getRoleKey(role: string): string {
  return characterRoles[role]?.key || 'other';
}
