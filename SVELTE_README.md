# OctoPrint Klipper Plugin - Svelte 5 Frontend

This plugin's frontend has been refactored to use Svelte 5, replacing the original Knockout.js implementation.

## Development Setup

### Prerequisites
- Node.js 18 or higher
- npm 9 or higher

### Installation

1. Install dependencies:
```bash
npm install
```

### Development

To start the development server with hot module replacement:
```bash
npm run dev
```

### Building

To build the production bundle:
```bash
npm run build
```

The build output will be placed in `octoprint_klipper/static/dist/` and automatically included in the OctoPrint plugin.

### Project Structure

```
src/
├── App.svelte              # Main application component
├── main.js                 # Entry point and mounting logic
├── components/             # Svelte components
│   ├── TabMain.svelte      # Main tab with log and controls
│   ├── Sidebar.svelte      # Sidebar with connection controls
│   ├── Navbar.svelte       # Navbar status display
│   ├── LevelingDialog.svelte
│   ├── PidTuningDialog.svelte
│   └── OffsetDialog.svelte
├── lib/                    # Library code
│   └── api.js              # API service layer for OctoPrint communication
└── stores/                 # Svelte stores for state management
    └── klipper.js          # Main application state
```

## Svelte 5 Features Used

- **Runes**: Modern reactive syntax (`$state`, `$derived`, `$props`)
- **Stores**: For managing global application state
- **Component-based architecture**: Modular and reusable components
- **Vite**: Fast build tool with HMR support

## Integration with OctoPrint

The Svelte components are integrated with OctoPrint through:

1. **Bridge Script** (`octoprint_klipper/static/js/klipper_svelte_bridge.js`): Mounts Svelte components into OctoPrint's view model system
2. **API Layer** (`src/lib/api.js`): Wraps OctoPrint API calls for use in Svelte components
3. **Build Output**: Vite builds to `octoprint_klipper/static/dist/` which is loaded by the Python plugin

## Migration Notes

The frontend has been fully migrated from Knockout.js to Svelte 5:

- ✅ Main tab component
- ✅ Sidebar component
- ✅ Navbar component
- ✅ Leveling dialog
- ✅ PID tuning dialog
- ✅ Offset dialog
- ⏳ Settings dialog (still uses Knockout.js)
- ⏳ Editor dialog (still uses Knockout.js)
- ⏳ Backup dialog (still uses Knockout.js)
- ⏳ Graph dialog (still uses Knockout.js)
- ⏳ Param macro dialog (still uses Knockout.js)

## Contributing

When adding new features:

1. Create Svelte components in `src/components/`
2. Update stores in `src/stores/` if new state is needed
3. Build the project with `npm run build`
4. Test with OctoPrint

## License

See LICENSE.md in the root directory.
