## What and why

<!-- Story / requirement IDs, e.g. KIT-031, KIT-03 -->

## Checklist

- [ ] Every screen state handled (loading, empty, offline, error)
- [ ] New tables have RLS policies and a pgTAP test; `python3 tools/archgen/build.py --check` passes
- [ ] No hard-coded copy: strings are in `apps/mobile/src/i18n/*.json`
- [ ] Touch targets ≥ 48 dp (≥ 56 dp in Cook), labels for screen readers
- [ ] Voice writes go through the confirmation gate
- [ ] Tests added or updated
