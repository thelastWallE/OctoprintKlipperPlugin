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
      // Ordered so that a section name that is a prefix of another comes
      // later (e.g. fan_generic before fan, probe_eddy_current before probe,
      // display_data/display_template/display_glyph before display).
      // Source: https://www.klipper3d.org/Config_Reference.html
      [/axis_twist_compensation|ad5206|adc_scaled|adc_temperature|ads1x1x|adxl345|angle|bed_mesh|bed_screws|bed_tilt|bltouch|board_pins|bmi160|carriage|controller_fan|delta_calibrate|delayed_gcode|display_data|display_glyph|display_template|display|dotstar|dual_carriage|duplicate_pin_override|endstop_phase|exclude_object|extruder_stepper|extruder|fan_generic|fan|filament_motion_sensor|filament_switch_sensor|firmware_retraction|force_move|gcode_arcs|gcode_button|gcode_macro|hall_filament_width_sensor|heater_bed|heater_fan|heater_generic|homing_heaters|homing_override|icm20948|idle_timeout|input_shaper|led|lis2dw|lis3dh|load_cell_probe|load_cell|manual_stepper|mcp4018|mcp4451|mcp4728|mcu|menu|mpu9250|multi_pin|neopixel|output_pin|palette2|pause_resume|pca9533|pca9632|printer|probe_eddy_current|probe|pwm_cycle_time|pwm_tool|quad_gantry_level|replicape|resonance_tester|respond|safe_z_home|samd_sercom|save_variables|screws_tilt_adjust|sdcard_loop|servo|skew_correction|smart_effector|static_digital_output|static_pwm_clock|stepper_[a-z0-9]+|sx1509|temperature_fan|temperature_probe|temperature_sensor|thermistor|tmc2130|tmc2208|tmc2209|tmc2240|tmc2660|tmc5160|tsl1401cl_filament_width_sensor|verify_heater|virtual_sdcard|z_thermal_adjust|z_tilt/i, "storage.type"],
      // config keys (word before : or =)
      [/[a-zA-Z_][a-zA-Z0-9_]*\s*[:=]/, "variable.name"],
      // file-path values (./ ../ ~/ /) — keep the whole path one token so it
      // doesn't get re-coloured as separate variable words; never swallow a
      // closing bracket
      [/[.]{1,2}\/[^\s\]]*|~[^\s\]]*|\/[^\s\]]*/, "string.unquoted"],
      // multi-segment paths / [include ...] targets ("a/b.cfg",
      // "Neuertest/Sub/file.cfg") — one token
      [/[a-zA-Z0-9_.~-]+(?:\/[a-zA-Z0-9_.~\-]+)+/, "string.unquoted"],
      // MCU pin names (P0.2, PA1, P1.28, PC13): the port letter is an identifier
      // and the pin number is a number. Must come before the gcode-command rule
      // below, which would otherwise swallow "P0" as one uppercase word.
      // variable.parameter (not variable.name) so the port letter doesn't share
      // the colour of the config keys.
      [/\bP[A-Z]?(?=[-+]?\d)/, "variable.parameter"],
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
// Standalone gcode tokenizer, used for the read-only preview of a parsed macro's
// body in the settings (monaco.editor.tokenize). The config language above marks
// every uppercase word as a keyword, which is right for [section] files but makes
// a gcode block one flat colour, so command words, parameter letters, numbers and
// jinja/parameter expressions get their own tokens here.
monaco.languages.register({ id: "klipper_gcode" });

monaco.languages.setMonarchTokensProvider("klipper_gcode", {
  defaultToken: "",
  tokenPostfix: ".klipper-gcode",

  tokenizer: {
    root: [
      // comments
      [/;.*$/, "comment.line.gcode"],
      [/#.*$/, "comment.line.number-sign"],
      // jinja expressions and Klipper runtime parameters ({params.X}, {rawparams})
      [/\{[^{}]*\}/, "variable.parameter"],
      // gcode command words: G1, M140, T0 (no trailing \b so "G1Z10" still splits)
      [/\b[GMT]\d+/, "keyword"],
      // long uppercase commands: PRINT_START, SET_PRESSURE_ADVANCE
      [/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/, "keyword"],
      // parameter letters directly followed by a value: X10, S-1.5, Z0.2, E0.8.
      // Must cover the whole alphabet — X/Y/Z are the most common gcode
      // parameters, and leaving them out made "Z0" one word-like token, so the
      // digit got the letter's colour.
      [/\b[A-Z](?=[-+]?\d)/, "variable.name"],
      // numbers
      [/-?\d+(?:[.]\d+)?/, "constant.numeric"],
      // bare words (macro names in comments, free text)
      [/[a-zA-Z_][a-zA-Z0-9_]*/, "variable"],
    ],
  },
});