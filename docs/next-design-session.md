# Events and rewards: next decisions

These are design tasks, not enabled production features. The rest of the refresh can ship independently.

## Events

Open [the interactive prototype](events-prototype.html) locally. Its navigation selector compares an Events tab with an Events view inside Chores. Switching the selected person demonstrates independent time responses and availability. All data is disposable and in memory.

Decide together:

1. Which placement is easiest to find on a phone?
2. Start with proposed times and Available/Maybe/Can't responses, or include the availability grid in v1?
3. Does the organizer select a final time, and can any roommate revise/cancel it under the app's existing attribution-only model?
4. Which changes deserve opt-in notifications: invitation, finalized time, changed time, cancellation? Preserve existing quiet hours and avoid alerts for every availability toggle.
5. When an event is finalized, retain the poll and response history; decide whether later responses are attendance answers or reopen scheduling.

Before implementation, turn those answers into event state transitions and RPC contracts with version checks, safe retries, export/fallback support, New York display time, and preserved response history. No changes to the current four-tab navigation until placement is chosen.

## Point-policy preview

Keep the current 1–3 point system until a replacement is agreed. Use a fresh exported chore ledger or private household backup as input. The checked-in example policy is an intentionally empty mapping, not an adopted points schedule.

```bash
source scripts/runtime.sh
node scripts/preview-points.mjs EXPORTED_CHORES.json docs/points-policy.example.json
```

Policy fields:

- `from` and `through`: inclusive completion dates in America/New_York.
- `points_by_icon`: proposed default points for matching chore icons.
- `points_by_task`: specific task-ID overrides, taking precedence over icon mappings.

The report lists task IDs/versions and old/proposed points, plus exact before/after/delta totals in twelfths. Unspecified tasks retain their points; zero-point reminders/favors remain unscored. It writes only to standard output and cannot apply changes. Values over three are flagged because production would need an explicitly reviewed point-range change.

Before adopting a policy, decide:

- Which chores earn which prescribed values, and whether ad hoc work uses the same schedule.
- Historical date range, task exceptions, and treatment of later completion corrections.
- Winner-only versus threshold/proportional awards; ties, eligibility, and maximum household/monthly budget.
- Who funds a $5–$10 credit, including how Michal's reward works when he pays the providers.
- Whether posted monthly credits are final or later corrected by an additional adjustment.

Implementation must retain original completion revisions. Store adopted policy versions and append-only point adjustments with actor/reason/reversal links; show both original and adjusted contribution values. Utility credits need their own adjustment ledger and explicit balance treatment, separate from bills, reimbursements, miscellaneous debts, and bulletin statistics. Preview the complete proposed change set before any historical or monetary mutation.
