// Klipper Config language definition for Monaco (Monarch)
// Loaded as a plain script AFTER vs/editor/editor.main so `monaco` is global.
// NOTE: Uses ARRAY rule syntax ([/regex/, "token"]) which is the only form
// that works reliably in Monaco 0.52. The object syntax ({regex, token}) and
// escaped brackets (\[ \]) are buggy in 0.52, so we use \x5B/\x5D and simple
// character classes instead.

monaco.languages.register({ id: "klipper_config" });

// Monokai theme matching the old Ace theme-monokai.
monaco.editor.defineTheme("klipper-monokai", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "75715E", fontStyle: "italic" },
    { token: "comment.line.number-sign", foreground: "75715E", fontStyle: "italic" },
    { token: "comment.line.gcode", foreground: "75715E", fontStyle: "italic" },
    { token: "keyword", foreground: "F92672" },
    { token: "keyword.control", foreground: "F92672" },
    { token: "keyword.operator", foreground: "F92672" },
    { token: "storage.type", foreground: "66D9EF" },
    { token: "support.type", foreground: "66D9EF" },
    { token: "constant.language", foreground: "AE81FF" },
    { token: "constant.numeric", foreground: "AE81FF" },
    { token: "variable", foreground: "FD971F" },
    { token: "variable.name", foreground: "A6E22E" },
    { token: "variable.parameter", foreground: "FD971F" },
    { token: "entity.name.function", foreground: "A6E22E" },
    { token: "string", foreground: "E6DB74" },
    { token: "string.unquoted", foreground: "E6DB74" },
  ],
  colors: {
    "editor.background": "#272822",
    "editor.foreground": "#F8F8F2",
    "editorLineNumber.foreground": "#90908A",
    "editorCursor.foreground": "#F8F8F0",
    "editor.selectionBackground": "#49483E",
    "editor.inactiveSelectionBackground": "#3D3D35",
    "editor.lineHighlightBackground": "#3E3D32",
    "editorIndentGuide.background1": "#3E3D32",
    "editorWidget.background": "#272822",
    "editorWidget.border": "#49483E",
  },
});

monaco.languages.setMonarchTokensProvider("klipper_config", {
  defaultToken: "",
  tokenPostfix: ".klipper",

  tokenizer: {
    root: [
      // section header brackets
      [/\x5B/, "storage.type"],
      [/\x5D/, "storage.type"],
      // comments
      [/#.*$/, "comment.line.number-sign"],
      [/;.*$/, "comment.line.gcode"],
      // numbers
      [/\-?\d+(?:[.]\d+)?/, "constant.numeric"],
      // booleans
      [/true|false/i, "constant.language"],
      // known section names inside [ ... ]
      [/extruder|heater_bed|heater_fan|fan|probe|bltouch|mcu|printer|gcode_macro|display|menu|bed_mesh|bed_screws|bed_tilt|input_shaper|adxl345|temperature_sensor|thermistor|virtual_sdcard|pause_resume|output_pin|neopixel|servo|stepper_[a-z0-9]+|save_variables|idle_timeout|force_move|respond|safe_z_home|z_tilt|quad_gantry_level|screws_tilt_adjust|skew_correction|delayed_gcode|gcode_arcs|gcode_button|firmware_retraction|homing_override|manual_stepper|multi_pin|controller_fan|filament_switch_sensor|hall_filament_width_sensor|temperature_fan|verify_heater|endstop_phase|dual_carriage|extruder_stepper|heater_generic|homing_heaters|static_digital_output|board_pins|dotstar|samd_sercom|sx1509|mcp4018|mcp4451|mcp4728|replicape|tsl1401cl_filament_width_sensor|adc_temperature|resonance_tester|delta_calibrate|bed_mesh|bed_screws|bed_tilt|gcode_macro/i, "storage.type"],
      // config keys (word before : or =)
      [/[a-zA-Z_][a-zA-Z0-9_]*\s*[:=]/, "variable.name"],
      // gcode commands
      [/[A-Z][A-Z0-9_]+/, "keyword.operator"],
      // jinja template markers
      [/[{][{%]/, "string.unquoted"],
      [/[}][}]/, "string.unquoted"],
      // generic words
      [/[a-zA-Z_][a-zA-Z0-9_]*/, "variable"],
    ],
  },
});