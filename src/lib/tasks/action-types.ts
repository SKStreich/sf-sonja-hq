// Canonical "action type" vocabulary shared by a project's next-action and by
// individual tasks. Mirrors the CHECK constraint on tasks.action_type /
// projects.next_action_type. Adding a value = edit this list + a migration.

export const ACTION_TYPES = [
  { value: 'meeting', label: 'Set Meeting', short: 'Meeting' },
  { value: 'call', label: 'Schedule Call', short: 'Call' },
  { value: 'email', label: 'Send Email', short: 'Email' },
  { value: 'create_file', label: 'Create File', short: 'Create File' },
  { value: 'review', label: 'Review', short: 'Review' },
  { value: 'design', label: 'Design', short: 'Design' },
  { value: 'deploy', label: 'Deploy', short: 'Deploy' },
  { value: 'research', label: 'Research', short: 'Research' },
  { value: 'other', label: 'Other', short: 'Other' },
] as const

export type ActionType = (typeof ACTION_TYPES)[number]['value']

/** Long label (e.g. "Set Meeting"), used in selects. */
export const ACTION_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ACTION_TYPES.map((a) => [a.value, a.label]),
)

/** Short label (e.g. "Meeting"), used in compact chips. */
export const ACTION_TYPE_SHORT: Record<string, string> = Object.fromEntries(
  ACTION_TYPES.map((a) => [a.value, a.short]),
)
