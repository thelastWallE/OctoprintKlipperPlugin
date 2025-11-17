# GitHub Copilot Instructions for OctoprintKlipperPlugin

## Project Overview

This is an OctoPrint plugin for Klipper 3D printer firmware. The project combines Python backend (OctoPrint plugin) with a Svelte 5 frontend.

## Technology Stack

### Frontend

- **Svelte 5** with modern runes API (`$state`, `$derived`, `$props`)
- **Vite** for build tooling
- **JavaScript** (not TypeScript)
- Build output: `octoprint_klipper/static/dist/`

### Backend

- **Python** OctoPrint plugin
- Located in `octoprint_klipper/` directory
- Jinja2 templates in `octoprint_klipper/templates/`

## Code Style Guidelines

### Svelte Components (src/components/)

- Use Svelte 5 runes syntax:
  - `let foo = $state(...)` for reactive state
  - `let bar = $derived(...)` for computed values
  - `let { propName } = $props()` for component props
- Follow accessibility best practices:
  - Associate form labels with controls using `for`/`id` attributes
  - Use `<div>` for display-only text, not `<label>`
  - Use `<button>` elements for clickable actions, not `<a href="#">`
  - Never use `href="#"` or `href="javascript:void(0)"`
- Component structure:

  ````svelte
  <!--
  @component

  - You can use markdown here.
  - You can also use code blocks here.
  - Usage:
  ```html
  <main name="Arethra"></main>
  ```
  -->
  <script>
    // imports
    // props with $props()
    // state with $state()
    // derived values with $derived()
    // functions
  </script>

  <!-- markup -->

  <style>
    /* component styles */
  </style>
  ````

### Python Code

- Follow PEP 8 style guidelines
- Use type hints where appropriate
- OctoPrint plugin structure in `octoprint_klipper/__init__.py`

### Store Management (src/stores/)

- Use class-based stores with `$state` for reactivity
- Export singleton instances
- Store files should use Svelte 5 runes for state management

## Build and Development

### Commands

- `npm run build` - Build production assets
- `npm run dev` - Development mode with watch
- Python package: `python setup.py develop` for development install

### File Structure

- Svelte source: `src/`
- Python plugin: `octoprint_klipper/`
- Static assets: `octoprint_klipper/static/`
- Build output: `octoprint_klipper/static/dist/`
- Templates: `octoprint_klipper/templates/`

## Important Patterns

### API Communication

- Use `api.js` helper functions from `src/lib/api.js`
- Backend API endpoints handled by OctoPrint plugin

### Accessibility

- All form inputs must have associated labels
- Use semantic HTML elements
- Buttons should be `<button>` elements, not styled divs or anchors
- Section headings should use `<div>` with appropriate classes, not `<label>`

### Integration with OctoPrint

- Global `OctoPrint` object available in browser
- Plugin integrates via OctoPrint's plugin system
- Templates in `octoprint_klipper/templates/` load Svelte components

## Migration Notes

- Project is migrating from jQuery/Knockout to Svelte 5
- Legacy code exists in `octoprint_klipper/static/js/`
- New Svelte components replace legacy implementations

## Testing

- Build must complete without warnings
- Check for Svelte accessibility warnings during build
- Test in OctoPrint environment for full integration

## Common Tasks

### Adding a New Svelte Component

1. Create in `src/components/`
2. Use Svelte 5 runes syntax
3. Follow accessibility guidelines
4. Import and use in parent components or templates

### Adding API Endpoints

1. Add to Python plugin in `octoprint_klipper/`
2. Create helper function in `src/lib/api.js`
3. Use in Svelte components via store or directly

### Styling

- Existing CSS in `octoprint_klipper/static/css/klipper.css`
- Component-specific styles in `<style>` blocks
- Bootstrap classes available from OctoPrint
