ace.define("ace/mode/klipper_config_highlight_rules", [], function (require, exports, module) {
  "use strict";

  var oop = require("../lib/oop");
  var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;

  var KlipperConfigHighlightRules = function () {

    this.$rules = {
      start: [{
        include: "#single_line_comment"
      }, {
        include: "#config_block"
      }, {
        include: "#config_line_sensor"
      }, {
        include: "#config_line_pin"
      }, {
        include: "#config_block_include"
      }, {
        include: "#config_line_display"
      }, {
        include: "#config_line"
      }, {
        include: "#number"
      }, {
        include: "#config_line_start_gcode"
      }, {
        include: "#gcode_macro_block"
      }],
      gcode: [{
        token: "constant.language",
        regex: /(?=(\[|#\*#|^\w.))/,
        next: "start"
      }, {
        include: "#single_line_comment"
      }, {
        include: "#gcode_line"
      }],
      jinja: [{
        token: "string",
        regex: '".*?"'
      }, {
        token: "string",
        regex: "'.*?'"
      }, {
        token: "constant.numeric",
        regex: '[0-9]+'
      }, {
        token: "variable",
        regex: "[_a-zA-Z:]+"
      }],
      'tag': [{
        token: "entity.name.function",
        regex: "[a-zA-Z][_a-zA-Z0-9]*",
        next: "jinja"
      }],
      "#single_line_comment": [{
        token: "comment.line.number-sign",
        regex: /(?!#\*#)([^\*]|^)#[^\*].*/
      }, {
        token: "comment.line.gcode",
        regex: /;.*$/
      }],
      "#number": [{
        token: "constant.numeric",
        regex: /\-?\d+(?:[\.]\d+)?\b/
      }, {
        token: "constant.numeric",
        regex: /\-?[\.]\d+?\b/
      }],
      "#boolean": [{
        token: "constant.language",
        regex: /\b(?:true|false)\b/,
        caseInsensitive: true
      }],
      "#string-single": [{
        token: "text",
        regex: /'/,
        push: [{
          token: "text",
          regex: /'/,
          next: "pop"
        }]
      }],
      "#string-double": [{
        token: "text",
        regex: /"/,
        push: [{
          token: "text",
          regex: /"/,
          next: "pop"
        }]
      }],
      "#config_block": [{
        token: "storage.type",
        regex: /\[(?!include)/,
        push: [{
          token: "storage.type",
          regex: /\]/,
          next: "start"
        }, {
          include: "#known_config_block_name"
        }, {
          include: "#known_driver_type"
        }, {
          defaultToken: "keyword.control"
        }]
      }],
      "#known_config_block_name": [{
        token: "storage.type",
        regex: /\b(?:save_variables|ad5206|adxl345|input_shaper|resonance_tester|adc_temperature|bed_mesh|bed_screws|bed_tilt|bltouch|board_pins|controller_fan|delayed_gcode|delta_calibrate|display|display_data|display_template|dotstar|dual_carriage|endstop_phase|extruder_stepper|extruder[1-9]{0,1}|fan|filament_switch_sensor|firmware_retraction|force_move|gcode_arcs|gcode_button|gcode_macro|hall_filament_width_sensor|heater_bed|heater_fan|heater_generic|homing_heaters|homing_override|idle_timeout|manual_stepper|mcp4018|mcp4451|mcp4728|mcu|menu|multi_pin|neopixel|output_pin|pause_resume|printer|probe|quad_gantry_level|replicape|respond|safe_z_home|samd_sercom|screws_tilt_adjust|servo|skew_correction|static_digital_output|stepper_(?:bed|arm|[abcdxy]|z[1-9]{0,1})|sx1509|temperature_fan|temperature_sensor|thermistor|tsl1401cl_filament_width_sensor|verify_heater|virtual_sdcard|z_tilt)\b/,
        caseInsensitive: true
      }],
      "#known_driver_type": [{
        token: "support.type",
        regex: /\b(?:tmc)(?:2130|2208|2209|2660|5160)\b/,
        caseInsensitive: true,
        push: [{
          token: "text",
          regex: /(?=(\]))/,
          next: "pop"
        }, {
          defaultToken: "keyword.control"
        }]
      }],
      "#known_thermistor_type": [{
        token: "constant.language",
        regex: /\b(?:EPCOS 100K B57560G104F|ATC Semitec 104GT-2|NTC 100K beta 3950|Honeywell 100K 135-104LAG-J01|NTC 100K MGB18-104F39050L32)\b/,
        caseInsensitive: true
      }],
      "#known_extruder_sensor_type": [{
        token: "constant.language",
        regex: /\b(?:MAX6675|MAX31855|MAX31856|MAX31865|PT100 INA826|AD595|AD597|AD8494|AD8495|AD8496|AD8497|PT1000|BME280|HTU21D|SI7013|SI7020|SI7021|SHT21|lm75|temperature_mcu|temperature_host|DS18B20)\b/,
        caseInsensitive: true
      }],
      "#known_control_type": [{
        token: "constant.language",
        regex: /\b(?:watermark|pid)\b/,
        caseInsensitive: true
      }],
      "#known_menu_type": [{
        token: "constant.language",
        regex: /\b(?:list|command|input|vsdlist)\b/,
        caseInsensitive: true
      }],
      "#known_kinematics_type": [{
        token: "support.type",
        regex: /\b(?:cartesian|delta|corexy|corexz|polar|rotary_delta|winch|none)\b/,
        caseInsensitive: true
      }],
      "#known_screws_type": [{
        token: "constant.language",
        regex: /\b(?:CW-M3|CCW-M3|CW-M4|CCW-M4|CW-M5|CCW-M5)\b/,
        caseInsensitive: true
      }],
      "#known_algo_type": [{
        token: "constant.language",
        regex: /\b(?:lagrange|bicubic)\b/,
        caseInsensitive: true
      }],
      "#known_samples_result_type": [{
        token: "constant.language",
        regex: /\b(?:median|average)\b/,
        caseInsensitive: true
      }],
      "#known_shaper_type": [{
        token: "constant.language",
        regex: /\b(?:zv|mzv|zvd|ei|2hump_ei|and|3hump_ei)\b/,
        caseInsensitive: true
      }],
      "#known_axel_chip": [{
        token: "support.type",
        regex: /\b(?:adxl345)\b/,
        caseInsensitive: true
      }],
      "#known_display_type": [{
        token: "constant.language",
        regex: /\b(?:hd44780|st7920|uc1701|ssd1306|emulated_st7920|sh1106)\b/,
        caseInsensitive: true
      }],
      "#serial": [{
        token: "constant.language",
        regex: /(?:\/dev\/serial\/by-)(?:id\/|path\/)[\d\w\/\-:\.]+/
      }],
      "#known_restart_command": [{
        token: "constant.language",
        regex: /\b(?:arduino|cheetah|rpi_usb|command)\b/,
        caseInsensitive: true
      }],
      "#config_name": [{
        token: "keyword.control",
        regex: /.*\.cfg/,
        caseInsensitive: true
      }],
      "#pin": [{
        token: "constant.language",
        regex: /[\^~!]*(?:EXP|ar|analog)\d{1,2}(?:_*\d{0,2})|(?:probe:z_virtual_endstop|rpi:)/,
        caseInsensitive: true
      }, {
        token: "constant.language",
        regex: /[\^~!]*(?:z:)?[a-zA-Z]{1,4}(?:gpio)?\d{1,2}(?:\.\d{1,2})?(?:_\d{1,2})?\b|<\w*>/,
        caseInsensitive: true
      }
      //, {
      //   token: "support.type",
      //   regex: /[^,#=]*/,
      //   caseInsensitive: true
      // }
      ],
      "#config_line_sensor": [{
        token: ["variable.name", "variable.name"],
        regex: /(sensor_type)(\s*[:]\s*)/,
        push: [{
          token: "text",
          regex: /$/,
          next: "pop"
        }, {
          include: "#known_thermistor_type"
        }, {
          include: "#known_extruder_sensor_type"
        }, {
          include: "#single_line_comment"
        }]
      }],
      "#config_line_name": [{
        token: ["variable.name", "variable.name"],
        regex: /(name)(\s*[:]\s*)/,
        push: [{
          token: "text",
          regex: /$/,
          next: "pop"
        }, {
          include: "#single_line_comment"
        }]
      }],
      "#config_line": [{
        token: ["variable.name", "variable.name"],
        regex: /(^(?!\:|gcode|name|sensor_type|rpi:|\w*pins)\w+\s*[=:]\s*\w+[:])|(^(?!\:|gcode|sensor_type|rpi:|\w*pins)\w+\s*[=:])/,
        push: [{
          token: "text",
          regex: /($|\n|\r|,)/,
          next: "pop"
        }, {
          include: "#known_control_type"
        }, {
          include: "#known_menu_type"
        }, {
          include: "#known_display_type"
        }, {
          include: "#known_kinematics_type"
        }, {
          include: "#known_screws_type"
        }, {
          include: "#known_algo_type"
        }, {
          include: "#known_samples_result_type"
        }, {
          include: "#known_shaper_type"
        }, {
          include: "#known_axel_chip"
        }, {
          include: "#pin"
        }, {
          include: "#serial"
        }, {
          include: "#known_restart_command"
        }, {
          include: "#number"
        }, {
          include: "#boolean"
        }, {
          include: "#single_line_comment"
        }, {
          include: "#gcode_macro_block"
        }]
      }],
      "#config_line_pin": [{
        token: ["variable.name", "variable.name"],
        regex: /(?!(gcode))(.*pins*:)/,
        push: [{
          token: "text",
          regex: /$/,
          next: "pop"
        }, {
          include: "#pin"
        }, {
          include: "#single_line_comment"
        }]
      }],
      "#config_block_include": [{
        token: "storage.type",
        regex: /\[include/,
        push: [{
          token: "storage.type",
          regex: /\]/,
          next: "pop"
        }, {
          include: "#config_name"
        }]
      }],
      "#gcode_line": [{
        include: "#gcode_command"
      }, {
        include: "#gcode_extended_command"
      }, {
        include: "#gcode_extended_parameter"
      }, {
        include: "#gcode_macro_block"
      }],
      "#gcode_command": [{
        token: ["text", "keyword.operator"],
        regex: /(\s*)([A-z]+)(?![A-z])/,
        caseInsensitive: true,
        push: [{
          token: "text",
          regex: /(?=(\s|$|;))/,
          next: "gcode"
        }, {
          include: "#number"
        }, {
          include: "#gcode_macro_block"
        }, {
          include: "#gcode_parameter"
        }]
      }],
      "#gcode_extended_command": [{
        token: "keyword.operator",
        regex: /^\s*(?:SAVE_VARIABLE|ABORT|ACCEPT|ACTIVATE_EXTRUDER|BED_MESH_CALIBRATE|BED_MESH_CLEAR|BED_MESH_MAP|BED_MESH_OUTPUT|BED_MESH_PROFILE|BED_SCREWS_ADJUST|BED_TILT_CALIBRATE|BLTOUCH_DEBUG|BLTOUCH_STORE|CALC_MEASURED_SKEW|CLEAR_PAUSE|DELTA_ANALYZE|DELTA_CALIBRATE|DUMP_TMC|ENDSTOP_PHASE_CALIBRATE|FIRMWARE_RESTART|FORCE_MOVE|GET_CURRENT_SKEW|GET_POSITION|GET_RETRACTION|HELP|MANUAL_PROBE|MANUAL_STEPPER|PAUSE|PID_CALIBRATE|PROBE|PROBE_ACCURACY|PROBE_CALIBRATE|QUAD_GANTRY_LEVEL|QUERY_ADC|QUERY_ENDSTOPS|QUERY_FILAMENT_SENSOR|QUERY_PROBE|RESPOND|RESTART|RESTORE_GCODE_STATE|RESUME|SAVE_CONFIG|SAVE_GCODE_STATE|SCREWS_TILT_CALCULATE|SET_DUAL_CARRIAGE|SET_EXTRUDER_STEP_DISTANCE|SET_FILAMENT_SENSOR|SET_GCODE_OFFSET|SET_GCODE_VARIABLE|SET_HEATER_TEMPERATURE|SET_IDLE_TIMEOUT|SET_KINEMATIC_POSITION|SET_LED|SET_PIN|SET_PRESSURE_ADVANCE|SET_RETRACTION|SET_SERVO|SET_SKEW|SET_STEPPER_ENABLE|SET_TMC_CURRENT|SET_TMC_FIELD|SET_VELOCITY_LIMIT|SKEW_PROFILE|STATUS|STEPPER_BUZZ|TESTZ|TUNING_TOWER|TURN_OFF_HEATERS|UPDATE_DELAYED_GCODE|Z_ENDSTOP_CALIBRATE|Z_TILT_ADJUST)\s/,
        caseInsensitive: true
      }],
      "#gcode_parameter": [{
        token: ["variable.parameter", "variable.parameter"],
        regex: /\b[A-z]+(?![a-z])|(=)/,
        caseInsensitive: true,
        push: [{
          token: "variable.parameter",
          regex: /(?=(\s|$|;))|^/,
          next: "gcode"
        }, {
          include: "#number"
        }, {
          include: "#string-single"
        }, {
          include: "#string-double"
        }, {
          include: "#gcode_macro_block"
        }, {
          defaultToken: "constant.language"
        }]
      }],
      "#gcode_extended_parameter": [{
        token: ["variable.parameter", "variable.parameter"],
        regex: /\b(AC|ACCEL|ACCEL_TO_DECEL|AD|ADVANCE|ANGLE|BAND|BD|BLUE|CARRIAGE|CLEAR|COMMAND|CURRENT|DISTANCE|DURATION|ENABLE|EXTRUDER|FACTOR|FIELD|GREEN|HEATER|HOLDCURRENT|ID|INDEX|LED|LIFT_SPEED|LOAD|MACRO|METHOD|MODE|MOVE_SPEED|MSG|NAME|PARAMETER|PGP|PIN|PREFIX|PROBE_SPEED|PULLUP|RED|REMOVE|RETRACT_LENGTH|RETRACT_SPEED|SAMPLE_RETRACT_DIST|SAMPLES|SAMPLES_RESULT|SAMPLES_TOLERANCE|SAMPLES_TOLERANCE_RETRIES|SAVE|SENSOR|SERVO|SET_POSITION|SMOOTH_TIME|SPEED|SQUARE_CORNER_VELOCITY|START|STEPPER|STOP_ON_ENDSTOP|SYNC|TARGET|TIMEOUT|TRANSMIT|TYPE|UNRETRACT_EXTRA_LENGTH|UNRETRACT_SPEED|VALUE|VARIABLE|VELOCITY|WIDTH|WRITE_FILE|X|X_ADJUST|XY|XZ|Y|Y_ADJUST|YZ|Z|Z_ADJUST)(=*)/,
        caseInsensitive: true,
        push: [{
          token: "text",
          regex: /[^\d\w]/,
          next: "gcode"

        }, {
          token: "constant.language",
          regex: /$|5V|average|command|echo|error|manual|median|OD|output_mode_store|pin_down|pin_up|reset|self_test|set_5V_output_mode|set_5V_output_mode|set_OD_output_mode|touch_mode/,
          caseInsensitive: true
        }, {
          include: "#number"
        }, {
          include: "#gcode_macro_block"
        }]
      }],
      // GCODE
      "#config_line_start_gcode": [{
        token: ["variable.name", "variable.name"],
        regex: /^(gcode)(\s*[:=]\s*)/,
        next: "gcode"
      }],
      "#gcode_macro_block": [{
        token: "string.unquoted",
        regex: /\{/,
        caseInsensitive: true,
        push: [{
          token: "string.unquoted",
          regex: /\}/,
          next: "gcode"
        }, {
          include: "jinja"
        }, {
          defaultToken: "string.unquoted"
        }]
      }]
    }

    this.normalizeRules();
  };

  KlipperConfigHighlightRules.metaData = {
    "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
    name: "Klipper Config",
    scopeName: "source.klipper-config"
  }


  oop.inherits(KlipperConfigHighlightRules, TextHighlightRules);

  exports.KlipperConfigHighlightRules = KlipperConfigHighlightRules;
});

ace.define("ace/mode/folding/cstyle", [], function (require, exports, module) {
  "use strict";

  var oop = require("../../lib/oop");
  var Range = require("../../range").Range;
  var BaseFoldMode = require("./fold_mode").FoldMode;

  var FoldMode = exports.FoldMode = function (commentRegex) {
    if (commentRegex) {
      this.foldingStartMarker = new RegExp(
        this.foldingStartMarker.source.replace(/\|[^|]*?$/, "|" + commentRegex.start)
      );
      this.foldingStopMarker = new RegExp(
        this.foldingStopMarker.source.replace(/\|[^|]*?$/, "|" + commentRegex.end)
      );
    }
  };
  oop.inherits(FoldMode, BaseFoldMode);

  (function () {

    this.foldingStartMarker = /([\{\[\(])[^\}\]\)]*$|^\s*(\/\*)|\[/;
    this.foldingStopMarker = /^[^\[\{\(]*([\}\]\)])|^[\s\*]*(\*\/)/;
    this.singleLineBlockCommentRe = /^\s*(\/\*).*\*\/\s*$/;
    this.tripleStarBlockCommentRe = /^\s*(\/\*\*\*).*\*\/\s*$/;
    this.startRegionRe = /^\s*(\/\*|\/\/)#?region\b/;
    this._getFoldWidgetBase = this.getFoldWidget;
    this.getFoldWidget = function (session, foldStyle, row) {
      var line = session.getLine(row);

      if (this.singleLineBlockCommentRe.test(line)) {
        if (!this.startRegionRe.test(line) && !this.tripleStarBlockCommentRe.test(line))
          return "";
      }

      var fw = this._getFoldWidgetBase(session, foldStyle, row);

      if (!fw && this.startRegionRe.test(line))
        return "start"; // lineCommentRegionStart

      return fw;
    };

    this.getFoldWidgetRange = function (session, foldStyle, row, forceMultiline) {
      var line = session.getLine(row);

      if (this.startRegionRe.test(line))
        return this.getCommentRegionBlock(session, line, row);

      var match = line.match(this.foldingStartMarker);
      if (match) {
        var i = match.index;

        if (match[1])
          return this.openingBracketBlock(session, match[1], row, i);

        var range = session.getCommentFoldRange(row, i + match[0].length, 1);

        if (range && !range.isMultiLine()) {
          if (forceMultiline) {
            range = this.getSectionRange(session, row);
          } else if (foldStyle != "all")
            range = null;
        }

        return range;
      }

      if (foldStyle === "markbegin")
        return;

      var match = line.match(this.foldingStopMarker);
      if (match) {
        var i = match.index + match[0].length;

        if (match[1])
          return this.closingBracketBlock(session, match[1], row, i);

        return session.getCommentFoldRange(row, i, -1);
      }
    };

    this.getSectionRange = function (session, row) {
      var line = session.getLine(row);
      var startIndent = line.search(/\S/);
      var startRow = row;
      var startColumn = line.length;
      row = row + 1;
      var endRow = row;
      var maxRow = session.getLength();
      while (++row < maxRow) {
        line = session.getLine(row);
        var indent = line.search(/\S/);
        if (indent === -1)
          continue;
        if (startIndent > indent)
          break;
        var subRange = this.getFoldWidgetRange(session, "all", row);

        if (subRange) {
          if (subRange.start.row <= startRow) {
            break;
          } else if (subRange.isMultiLine()) {
            row = subRange.end.row;
          } else if (startIndent == indent) {
            break;
          }
        }
        endRow = row;
      }

      return new Range(startRow, startColumn, endRow, session.getLine(endRow).length);
    };
    this.getCommentRegionBlock = function (session, line, row) {
      var startColumn = line.search(/\s*$/);
      var maxRow = session.getLength();
      var startRow = row;

      var re = /^\s*(?:\/\*|\/\/|--)#?(end)?region\b/;
      var depth = 1;
      while (++row < maxRow) {
        line = session.getLine(row);
        var m = re.exec(line);
        if (!m) continue;
        if (m[1]) depth--;
        else depth++;

        if (!depth) break;
      }

      var endRow = row;
      if (endRow > startRow) {
        return new Range(startRow, startColumn, endRow, line.length);
      }
    };

  }).call(FoldMode.prototype);

});

ace.define("ace/mode/klipper_config", [], function (require, exports, module) {
  "use strict";

  var oop = require("../lib/oop");
  var TextMode = require("./text").Mode;
  var KlipperConfigHighlightRules = require("./klipper_config_highlight_rules").KlipperConfigHighlightRules;
  var FoldMode = require("./folding/cstyle").FoldMode;

  var Mode = function () {
    this.HighlightRules = KlipperConfigHighlightRules;
    this.foldingRules = new FoldMode();
  };
  oop.inherits(Mode, TextMode);

  (function () {
    this.$id = "ace/mode/klipper_config"
  }).call(Mode.prototype);

  exports.Mode = Mode;
}); (function () {
  ace.require(["ace/mode/klipper_config"], function (m) {
    if (typeof module == "object" && typeof exports == "object" && module) {
      module.exports = m;
    }
  });
})();
