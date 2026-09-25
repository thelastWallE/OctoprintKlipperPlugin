## Description

<!--
Briefly describe what this PR does and why. Reference any related issues
(e.g. "Closes #91").
-->

Closes #

## Type of change

<!-- Check all that apply. -->

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would change existing behavior)
- [ ] Refactor / code cleanup
- [ ] Documentation update
- [ ] Translation update

## Checklist

<!--
Make sure the following are done before requesting a review. The plugin must
stay backward compatible with OctoPrint 1.11.x while targeting OctoPrint 2.0.
-->

### Code

- [ ] Code follows the project's existing style and conventions
- [ ] No use of deprecated OctoPrint APIs (`@restricted_access`, `pkg_resources`, ...)
- [ ] Blueprint / Simple API routes remain login-protected (no regressions)
- [ ] Templates remain autoescaped — no raw HTML inside `{{ _('...') }}` strings
- [ ] Tornado download routes still include `access_validation` (if touched)
- [ ] `plugin_requires` in `setup.py` is in sync with actual imports (if changed)

### Testing (TDD)

- [ ] Tests were written/updated for the change (red-green-refactor)
- [ ] All tests pass: `.\.venv\Scripts\python -m pytest`
- [ ] Manually verified against OctoPrint 2.0
- [ ] Manually verified against OctoPrint 1.11.x if the change touches compatibility-sensitive code

### Translations

- [ ] New/changed translatable strings updated in:
  - `translations/messages.pot`
  - `translations/de/LC_MESSAGES/messages.po`
  - `octoprint_klipper/translations/de/LC_MESSAGES/messages.po`
- [ ] `.mo` files recompiled with `msgfmt`

### Docs

- [ ] `changelog.md` updated with a dated entry
- [ ] `docs/api.md` updated if routes/API changed

## Screenshots (if applicable)

<!-- Add screenshots to help explain your change. -->

## Additional context

<!-- Add any other context about the PR here. -->
