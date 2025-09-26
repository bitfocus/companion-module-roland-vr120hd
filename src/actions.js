module.exports = {
	// ##########################
	// #### Instance Actions ####
	// ##########################
	initActions: function () {
		let self = this
		let actions = {}


actions.pinp_on_off = {
  name: 'PinP On/Off',
  options: [
    // Type (forced to PinP) @ 00 xx 04
    {
      type: 'dropdown',
      label: 'Type',
      id: 'type',
      default: 0, // PinP
      choices: [{ id: 0, label: 'PinP' }],
      tooltip: 'PinP&Key Type @ 00 xx 04 (forced to PinP only)',
    },

    // PinP channel first-level selector (xx = 0x15..0x18)
    {
      type: 'dropdown',
      label: 'PinP Channel',
      id: 'pinp',
      default: 0x16, // PinP 2 as requested
      choices: [
        { id: 0x15, label: 'PinP 1' },
        { id: 0x16, label: 'PinP 2' },
        { id: 0x17, label: 'PinP 3' },
        { id: 0x18, label: 'PinP 4' },
      ],
    },

    {
      type: 'dropdown',
      label: 'PGM State',
      id: 'pgm_state',
      default: 1, // On
      choices: [
        { id: 0, label: 'Off' },
        { id: 1, label: 'On' },
      ],
    },
    {
      type: 'dropdown',
      label: 'PVW State',
      id: 'pvw_state',
      default: 0, // Off
      choices: [
        { id: 0, label: 'Off' },
        { id: 1, label: 'On' },
      ],
    },

    {
      type: 'dropdown',
      label: 'Source',
      id: 'source',
      default: 1, // HDMI 2 as requested
      // Allow HDMI 1–6, SDI 1–6, Still 1–16, Video Player/SRT In, Input 1–8
      choices: self.CHOICES_PINP_KEYS_INPUTSASSIGN.filter((src) =>
        (src.label.startsWith('HDMI') && src.id >= 0 && src.id <= 5) ||
        (src.label.startsWith('SDI')  && src.id >= 6 && src.id <= 11) ||
        (src.label.startsWith('Still') && src.id >= 12 && src.id <= 27) ||
        (src.label.startsWith('Video Player')) ||
        (src.label.startsWith('Input') && src.id >= 29 && src.id <= 36)
      ),
    },

    {
      type: 'number',
      label: 'Time (sec, 0.0–4.0)',
      id: 'time',
      min: 0, max: 4, step: 0.1, default: 1.0,
      required: true,
      tooltip: 'Transition time in seconds (0.0–4.0)',
    },
  ],

  callback: async function (action) {
    const typeVal = Number(action.options.type) & 0x03; // 0..3, we force 0
    const pinp    = Number(action.options.pinp);        // 0x15..0x18
    const source  = Number(action.options.source);
    const timeSec = Number(action.options.time);
    const pgm     = Number(action.options.pgm_state) & 0x01;
    const pvw     = Number(action.options.pvw_state) & 0x01;

    const pinpH = pinp.toString(16).padStart(2, '0').toUpperCase();
    const addr  = (low) => '00' + pinpH + low;
    const hex2  = (v) => v.toString(16).padStart(2, '0').toUpperCase();

    // 0) TYPE -> 00 xx 04
    self.sendCommand(addr('04'), hex2(typeVal));

    // 1) SOURCE -> 00 xx 03
    self.sendCommand(addr('03'), hex2(source));

    // 2) TIME -> 00 xx 00 (0..40 = 0.0..4.0s)
    let timeVal = Math.round(Math.max(0, Math.min(4, timeSec)) * 10);
    self.sendCommand(addr('00'), hex2(timeVal));

    // 3) PGM -> 00 xx 01
    self.sendCommand(addr('01'), hex2(pgm));

    // 4) PVW -> 00 xx 02
    self.sendCommand(addr('02'), hex2(pvw));

    if (self.config.verbose) {
      console.log('[PinP Setup] TYPE/SRC/TIME/PGM/PVW:',
        { typeVal, pinp: pinpH, source, timeVal, pgm, pvw });
    }
  },
};

actions.pinp_Settings = {
  name: 'PinP Settings',
  options: [
    {
      type: 'dropdown',
      label: 'PinP Channel',
      id: 'pinp',
      default: 0x16, // PinP 2 by default (matches Setup)
      choices: [
        { id: 0x15, label: 'PinP 1' },
        { id: 0x16, label: 'PinP 2' },
        { id: 0x17, label: 'PinP 3' },
        { id: 0x18, label: 'PinP 4' },
      ],
    },

    // Five independent percent values (step 0.1)
    { type: 'number', label: 'Position H (−100.0 .. +100.0 %)', id: 'pos_h',  min: -100, max: 100, step: 0.1, default: 0.0 },
    { type: 'number', label: 'Position V (−100.0 .. +100.0 %)', id: 'pos_v',  min: -100, max: 100, step: 0.1, default: 0.0 },
    { type: 'number', label: 'Size (0.0 .. 100.0 %)',            id: 'size',   min:    0, max: 100, step: 0.1, default: 100.0 },
    { type: 'number', label: 'Cropping H (0.0 .. 100.0 %)',       id: 'crop_h', min:    0, max: 100, step: 0.1, default: 100.0 },
    { type: 'number', label: 'Cropping V (0.0 .. 100.0 %)',       id: 'crop_v', min:    0, max: 100, step: 0.1, default: 100.0 },
  ],

  callback: async function (action) {
    const pinp = Number(action.options.pinp); // 0x15..0x18

    // Helpers
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    // raw 14-bit -> two 7-bit bytes
    const to14 = (raw) => {
      const v = Math.max(0, Math.min(0x3FFF, raw | 0));
      return [ (v >> 7) & 0x7F, v & 0x7F ]; // [MSB7, LSB7]
    };
    // Percent -> tenths-of-percent (UI shows tenths)
    const pctToTenths = (p) => Math.round(clamp(p, 0, 100) * 10); // 0..1000
    // Signed (±100.0%) as 14-bit two's complement around 0
    const pctSignedTo14 = (p) => {
      const mag = Math.round(clamp(Math.abs(p), 0, 100) * 10);    // 0..1000
      const raw = (p >= 0) ? mag : ((0x4000 - mag) & 0x3FFF);
      return to14(raw);
    };
    // Unsigned (0..100.0%)
    const pctUnsignedTo14 = (p) => to14(pctToTenths(p));

    const hex2  = (b) => b.toString(16).padStart(2, '0').toUpperCase();
    const pinpH = pinp.toString(16).padStart(2, '0').toUpperCase();
    const addr  = (low) => '00' + pinpH + low;

    // Send a 2-byte param starting at the first low address (device auto-increments)
    const sendPair = (startLowHex, bytes, label) => {
      const data = hex2(bytes[0]) + hex2(bytes[1]); // contiguous hex, no spaces
      self.sendCommand(addr(startLowHex), data);
      if (self.config.verbose) console.log('[PinP Adjust]', label, 'DTH:', addr(startLowHex), data);
    };

    // 1) Position H -> 05/06 (signed)
    sendPair('05', pctSignedTo14(Number(action.options.pos_h)),  'Pos H');
    // 2) Position V -> 07/08 (signed)
    sendPair('07', pctSignedTo14(Number(action.options.pos_v)),  'Pos V');
    // 3) Size -> 09/0A (unsigned)
    sendPair('09', pctUnsignedTo14(Number(action.options.size)),  'Size');
    // 4) Cropping H -> 0B/0C (unsigned)
    sendPair('0B', pctUnsignedTo14(Number(action.options.crop_h)),'Crop H');
    // 5) Cropping V -> 0D/0E (unsigned)
    sendPair('0D', pctUnsignedTo14(Number(action.options.crop_v)),'Crop V');
  },
};

actions.dsk_on_off = {
    name: 'DSK On/Off',
    options: [
        {
            type: 'dropdown',
            label: 'DSK Channel',
            id: 'dsk',
            default: 0x19, // DSK 1 by default
            choices: [
                { id: 0x19, label: 'DSK 1' },
                { id: 0x1A, label: 'DSK 2' }
            ],
        },
        {
            type: 'dropdown',
            label: 'PGM State',
            id: 'pgm_state',
            default: 1,
            choices: [
                { id: 0, label: 'Off' },
                { id: 1, label: 'On' }
            ],
        },
        {
            type: 'dropdown',
            label: 'PVW State',
            id: 'pvw_state',
            default: 0,
            choices: [
                { id: 0, label: 'Off' },
                { id: 1, label: 'On' }
            ],
        },
    ],
    callback: async function (action) {
        let dsk = Number(action.options.dsk);
        let pgm_state = Number(action.options.pgm_state);
        let pvw_state = Number(action.options.pvw_state);

        // Convert to hex
        let dskHex = dsk.toString(16).padStart(2, '0').toUpperCase();
        let pgmHex = pgm_state.toString(16).padStart(2, '0').toUpperCase();
        let pvwHex = pvw_state.toString(16).padStart(2, '0').toUpperCase();

        // Send PGM State
        let addressPGM = '00' + dskHex + '01';
        self.sendCommand(addressPGM, pgmHex);

        // Send PVW State
        let addressPVW = '00' + dskHex + '02';
        self.sendCommand(addressPVW, pvwHex);

        // Debug logging (optional)
        console.log('[DSK On/Off] Sent:', {
            dsk, pgm_state, pvw_state, addressPGM, pgmHex, addressPVW, pvwHex
        });
    },
};

actions.dsk_mode_alpha_key = {
    name: 'DSK Mode - Alpha Key',
    options: [
        {
            type: 'dropdown',
            label: 'DSK Channel',
            id: 'dsk',
            default: self.CHOICES_DSK[0].id,
            choices: self.CHOICES_DSK,
        },
        {
            type: 'dropdown',
            label: 'Mode',
            id: 'mode',
            default: 1,
            choices: [{ id: 1, label: 'Alpha Key' }],
        },
        {
            type: 'dropdown',
            label: 'Key Source',
            id: 'key',
            default: 12,
            choices: self.CHOICES_PINP_KEYS_INPUTSASSIGN.filter(src => src.label.startsWith('Still')),
        },
        {
            type: 'number',
            label: 'Time (sec, 0.0–4.0)',
            id: 'time',
            min: 0,
            max: 4,
            step: 0.1,
            default: 1,
            required: true,
        },
    ],
    callback: async function (action) {
        let { dsk, mode, key, time } = action.options;

        let dskHex = Number(dsk).toString(16).padStart(2, '0').toUpperCase();
        let modeHex = Number(mode).toString(16).padStart(2, '0').toUpperCase();
        let keyHex = Number(key).toString(16).padStart(2, '0').toUpperCase();
        let timeHex = Math.round(time * 10).toString(16).padStart(2, '0').toUpperCase();

        self.sendCommand('00' + dskHex + '03', modeHex);
        self.sendCommand('00' + dskHex + '04', keyHex);
        self.sendCommand('00' + dskHex + '00', timeHex);
    },
};

actions.dsk_mode_self_key = {
    name: 'DSK Mode - Self Key',
    options: [
        {
            type: 'dropdown',
            label: 'DSK Channel',
            id: 'dsk',
            default: self.CHOICES_DSK[0].id,
            choices: self.CHOICES_DSK,
        },
        {
            type: 'dropdown',
            label: 'Mode',
            id: 'mode',
            default: 0,
            choices: [{ id: 0, label: 'Self Key' }],
        },
        {
            type: 'dropdown',
            label: 'Fill Source',
            id: 'fill',
            default: self.CHOICES_PINP_KEYS_INPUTSASSIGN[0].id,
            choices: self.CHOICES_PINP_KEYS_INPUTSASSIGN,
        },
        {
            type: 'number',
            label: 'Time (sec, 0.0–4.0)',
            id: 'time',
            min: 0,
            max: 4,
            step: 0.1,
            default: 1,
            required: true,
        },
    ],
    callback: async function (action) {
        let { dsk, mode, fill, time } = action.options;

        let dskHex = Number(dsk).toString(16).padStart(2, '0').toUpperCase();
        let modeHex = Number(mode).toString(16).padStart(2, '0').toUpperCase();
        let fillHex = Number(fill).toString(16).padStart(2, '0').toUpperCase();
        let timeHex = Math.round(time * 10).toString(16).padStart(2, '0').toUpperCase();

        self.sendCommand('00' + dskHex + '03', modeHex);
        self.sendCommand('00' + dskHex + '05', fillHex);
        self.sendCommand('00' + dskHex + '00', timeHex);
    },
};


actions.dsk_mode_external_key = {
    name: 'DSK Mode - External Key',
    options: [
        {
            type: 'dropdown',
            label: 'DSK Channel',
            id: 'dsk',
            default: self.CHOICES_DSK[0].id,
            choices: self.CHOICES_DSK,
        },
        {
            type: 'dropdown',
            label: 'Mode',
            id: 'mode',
            default: 2,
            choices: [{ id: 2, label: 'External Key' }],
        },
        {
            type: 'dropdown',
            label: 'Fill Source',
            id: 'fill',
            default: self.CHOICES_PINP_KEYS_INPUTSASSIGN[0].id,
            choices: self.CHOICES_PINP_KEYS_INPUTSASSIGN,
        },
        {
            type: 'dropdown',
            label: 'Key Source',
            id: 'key',
            default: self.CHOICES_PINP_KEYS_INPUTSASSIGN[0].id,
            choices: self.CHOICES_PINP_KEYS_INPUTSASSIGN,
        },
        {
            type: 'number',
            label: 'Time (sec, 0.0–4.0)',
            id: 'time',
            min: 0,
            max: 4,
            step: 0.1,
            default: 1,
            required: true,
        },
    ],
    callback: async function (action) {
        let { dsk, mode, fill, key, time } = action.options;

        // Convert values to hex
        let dskHex = Number(dsk).toString(16).padStart(2, '0').toUpperCase();
        let modeHex = Number(mode).toString(16).padStart(2, '0').toUpperCase();
        let fillHex = Number(fill).toString(16).padStart(2, '0').toUpperCase();
        let keyHex = Number(key).toString(16).padStart(2, '0').toUpperCase();
        let timeVal = Math.round(time * 10);
        if (timeVal < 0) timeVal = 0;
        if (timeVal > 40) timeVal = 40;
        let timeHex = timeVal.toString(16).padStart(2, '0').toUpperCase();

        // Send commands
        self.sendCommand('00' + dskHex + '03', modeHex); // Mode
        self.sendCommand('00' + dskHex + '05', fillHex); // Fill Source
        self.sendCommand('00' + dskHex + '04', keyHex);  // Key Source
        self.sendCommand('00' + dskHex + '00', timeHex); // Transition Time
    },
};

		
		actions.run_macro = {
			name: 'Run Macro',
			options: [
				{
					type: 'number',
					label: 'Macro',
					id: 'macro',
					tooltip: '(1-100)',
					min: 1,
					max: 100,
					default: 1,
					step: 1,
					required: true,
					range: false,
				},
			],
			callback: async function (action) {
				let options = action.options
				let macro = options.macro
				let macroZero = macro - 1
				let value = macroZero.toString(16).padStart(2, '0').toUpperCase()

				let address = '500504'
				self.sendCommand(address, value)
			},
		}

		actions.input_assign = {
			name: 'Assign Input',
			options: [
				{
					type: 'dropdown',
					label: 'Input Channel',
					id: 'input',
					default: self.CHOICES_INPUTS[0].id,
					choices: self.CHOICES_INPUTS,
				},
				{
					type: 'dropdown',
					label: 'Input Type',
					id: 'assign',
					default: self.CHOICES_INPUTSASSIGN[0].id,
					choices: self.CHOICES_INPUTSASSIGN,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '00' + '00' + options.input.toString(16).padStart(2, '0').toUpperCase()
				let value = options.assign.toString(16).padStart(2, '0').toUpperCase()
				self.sendCommand(address, value)
			},
		}

		actions.output_assign = {
			name: 'Assign Output',
			options: [
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: self.CHOICES_OUTPUTS[0].id,
					choices: self.CHOICES_OUTPUTS,
				},
				{
					type: 'dropdown',
					label: 'Type',
					id: 'assign',
					default: self.CHOICES_OUTPUTSASSIGN[0].id,
					choices: self.CHOICES_OUTPUTSASSIGN,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '00'

				address += '00' + options.output.toString(16).padStart(2, '0').toUpperCase()

				let value = options.assign.toString(16).padStart(2, '0').toUpperCase()
				self.sendCommand(address, value)
			},
		}

		actions.aux_assign = {
			name: 'Assign Aux',
			options: [
				{
					type: 'dropdown',
					label: 'Aux',
					id: 'aux',
					default: self.CHOICES_AUXES[0].id,
					choices: self.CHOICES_AUXES,
				},
				{
					type: 'dropdown',
					label: 'Input Type',
					id: 'assign',
					default: self.CHOICES_INPUTSAUXASSIGN[0].id,
					choices: self.CHOICES_INPUTSAUXASSIGN,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = options.aux

				let value = options.assign.toString(16).padStart(2, '0').toUpperCase()
				self.sendCommand(address, value)
			},
		}

		actions.aux_link = {
			name: 'Aux Link to PGM',
			options: [
				{
					type: 'dropdown',
					label: 'Aux',
					id: 'aux',
					default: '02015D',
					choices: [
						{ id: '02015D', label: 'Aux 1' },
						{ id: '02015E', label: 'Aux 2' },
						{ id: '02015F', label: 'Aux 3' },
					],
				},
				{
					type: 'dropdown',
					label: 'Link',
					id: 'link',
					default: 0,
					choices: [
						{ id: 0, label: 'Off' },
						{ id: 1, label: 'On' },
					],
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = options.aux

				let value = options.link.toString(16).padStart(2, '0').toUpperCase()
				self.sendCommand(address, value)
			},
		}

		actions.pnpkey_enable = {
			name: 'PnP & Key Enable/Disable',
			options: [
				{
					type: 'dropdown',
					label: 'PnP/Key',
					id: 'pinp',
					default: self.CHOICES_PINPDSK[0].id,
					choices: self.CHOICES_PINPDSK,
				},
				{
					type: 'dropdown',
					label: 'Enable/Disable',
					id: 'enable',
					default: 1,
					choices: [
						{ id: 0, label: 'Disable' },
						{ id: 1, label: 'Enable' },
					],
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '00' + '00' + options.pinp.toString(16).padStart(2, '0').toUpperCase()

				let value = options.enable.toString(16).padStart(2, '0').toUpperCase()
				self.sendCommand(address, value)
			},
		}

		actions.aux_pnpkey_enable = {
			name: 'Aux PnP & Key Enable/Disable',
			options: [
				{
					type: 'dropdown',
					label: 'Aux',
					id: 'aux',
					default: self.CHOICES_AUXES_PINPDSK[0].id,
					choices: self.CHOICES_AUXES_PINPDSK,
				},
				{
					type: 'dropdown',
					label: 'Enable/Disable',
					id: 'enable',
					default: 1,
					choices: [
						{ id: 0, label: 'Disable' },
						{ id: 1, label: 'Enable' },
						{ id: 2, label: 'Always On' },
					],
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = options.aux

				let value = options.enable.toString(16).padStart(2, '0').toUpperCase()
				self.sendCommand(address, value)
			},
		}

		actions.set_transition_type = {
			name: 'Set Transition Type',
			options: [
				{
					type: 'dropdown',
					label: 'Transition Type',
					id: 'type',
					default: self.CHOICES_TRANSITION_TYPES[0].id,
					choices: self.CHOICES_TRANSITION_TYPES,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '00' + '14' + '00'

				let value = options.type.toString(16).padStart(2, '0').toUpperCase()
				self.sendCommand(address, value)
			},
		}

		actions.set_mix_type = {
			name: 'Set Mix Type',
			options: [
				{
					type: 'dropdown',
					label: 'Mix Type',
					id: 'type',
					default: self.CHOICES_MIX_TYPES[0].id,
					choices: self.CHOICES_MIX_TYPES,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '00' + '14' + '01'

				let value = options.type.toString(16).padStart(2, '0').toUpperCase()
				self.sendCommand(address, value)
			},
		}

		actions.set_wipe_type = {
			name: 'Set Wipe Type',
			options: [
				{
					type: 'dropdown',
					label: 'Wipe Type',
					id: 'type',
					default: self.CHOICES_WIPE_TYPES[0].id,
					choices: self.CHOICES_WIPE_TYPES,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '00' + '14' + '03'

				let value = options.type.toString(16).padStart(2, '0').toUpperCase()
				self.sendCommand(address, value)
			},
		}

		actions.set_wipe_direction = {
			name: 'Set Wipe Direction',
			options: [
				{
					type: 'dropdown',
					label: 'Wipe Direction',
					id: 'direction',
					default: self.CHOICES_WIPE_DIRECTIONS[0].id,
					choices: self.CHOICES_WIPE_DIRECTIONS,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '00' + '14' + '05'

				let value = options.direction.toString(16).padStart(2, '0').toUpperCase()
				self.sendCommand(address, value)
			},
		}

		/*actions.press_and_release_switch = {
			label: 'Press and Release Panel Switch',
			options:
			[
				{
					type: 'dropdown',
					label: 'Switch',
					id: 'switch',
					default: self.CHOICES_SWITCHES[0].id,
					choices: self.CHOICES_SWITCHES
				}
			],
			callback: async function(action) {
				let options = action.options;
				self.sendCommand(options.switch, '01');
				setTimeout(function() {
					self.sendCommand(options.switch, '00');
				}, 200);
			}
		};

		actions.press_switch = {
			label: 'Press Panel Switch (Don\'t Release)',
			options:
			[
				{
					type: 'dropdown',
					label: 'Switch',
					id: 'switch',
					default: self.CHOICES_SWITCHES[0].id,
					choices: self.CHOICES_SWITCHES
				}
			],
			callback: async function(action) {
				let options = action.options;
				self.sendCommand(options.switch, '01');
			}
		};

		actions.release_switch = {
			label: 'Release Panel Switch',
			options:
			[
				{
					type: 'dropdown',
					label: 'Switch',
					id: 'switch',
					default: self.CHOICES_SWITCHES[0].id,
					choices: self.CHOICES_SWITCHES
				}
			],
			callback: async function(action) {
				let options = action.options;
				self.sendCommand(options.switch, '00');
			}
		};*/

		actions.set_pinp_source = {
			name: 'Set PnP & Key Source',
			options: [
				{
					type: 'dropdown',
					label: 'PnP/Key',
					id: 'pinp',
					default: self.CHOICES_PINP_KEYS[0].id,
					choices: self.CHOICES_PINP_KEYS,
				},
				{
					type: 'dropdown',
					label: 'Input Type',
					id: 'assign',
					default: self.CHOICES_PINP_KEYS_INPUTSASSIGN[0].id,
					choices: self.CHOICES_PINP_KEYS_INPUTSASSIGN,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '00' + options.pinp.toString(16).padStart(2, '0').toUpperCase() + '03'
				let value = options.assign.toString(16).padStart(2, '0').toUpperCase()
				self.sendCommand(address, value)
			},
		}

		actions.set_pinp_type = {
			name: 'Set PnP & Key Type',
			options: [
				{
					type: 'dropdown',
					label: 'PnP/Key',
					id: 'pinp',
					default: self.CHOICES_PINP_KEYS[0].id,
					choices: self.CHOICES_PINP_KEYS,
				},
				{
					type: 'dropdown',
					label: 'Key Type',
					id: 'key',
					default: self.CHOICES_PINP_TYPES[0].id,
					choices: self.CHOICES_PINP_TYPES,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '00' + options.pinp.toString(16).padStart(2, '0').toUpperCase() + '04'
				let value = options.key.toString(16).padStart(2, '0').toUpperCase()
				self.sendCommand(address, value)
			},
		}
		
		actions.select_pgm = {
			name: 'Select PGM Source',
			options: [
				{
					type: 'dropdown',
					label: 'Input',
					id: 'input',
					default: self.CHOICES_PINP_KEYS_INPUTSASSIGN[0].id,
					choices: self.CHOICES_PINP_KEYS_INPUTSASSIGN,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '00' + '1B' + '00'
				let value = options.input.toString(16).padStart(2, '0').toUpperCase()
				self.sendCommand(address, value)
			},
		}

		actions.select_pvw = {
			name: 'Select PVW Source',
			options: [
				{
					type: 'dropdown',
					label: 'Input',
					id: 'input',
					default: self.CHOICES_PINP_KEYS_INPUTSASSIGN[0].id,
					choices: self.CHOICES_PINP_KEYS_INPUTSASSIGN,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '00' + '1B' + '01'
				let value = options.input.toString(16).padStart(2, '0').toUpperCase()
				self.sendCommand(address, value)
			},
		}

		actions.load_memory_trigger = {
			name: 'Load Memory Trigger',
			options: [
				{
					type: 'dropdown',
					label: 'Memory',
					id: 'memory',
					default: self.CHOICES_MEMORY[0].id,
					choices: self.CHOICES_MEMORY,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '0A' + '00' + '00'
				let value = options.memory.toString(16).padStart(2, '0').toUpperCase()
				self.sendCommand(address, value)
			},
		}

		actions.save_memory_trigger = {
			name: 'Save Memory Trigger',
			options: [
				{
					type: 'dropdown',
					label: 'Memory',
					id: 'memory',
					default: self.CHOICES_MEMORY[0].id,
					choices: self.CHOICES_MEMORY,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '0A' + '00' + '01'
				let value = options.memory.toString(16).padStart(2, '0').toUpperCase()
				self.sendCommand(address, value)
			},
		}

		actions.initialize_memory_trigger = {
			name: 'Initialize Memory Trigger',
			options: [
				{
					type: 'dropdown',
					label: 'Memory',
					id: 'memory',
					default: self.CHOICES_MEMORY[0].id,
					choices: self.CHOICES_MEMORY,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '0A' + '00' + '02'
				let value = options.memory.toString(16).padStart(2, '0').toUpperCase()
				self.sendCommand(address, value)
			},
		}

		actions.camera_control_pan = {
			name: 'Camera Control - Pan',
			options: [
				{
					type: 'dropdown',
					label: 'Camera',
					id: 'camera',
					default: self.CHOICES_CAMERAS[0].id,
					choices: self.CHOICES_CAMERAS,
				},
				{
					type: 'dropdown',
					label: 'Direction',
					id: 'direction',
					default: self.CHOICES_CAMERA_PAN[0].id,
					choices: self.CHOICES_CAMERA_PAN,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '00' + options.camera + '22'
				let value = options.direction
				self.sendCommand(address, value)
			},
		}

		actions.camera_control_tilt = {
			name: 'Camera Control - Tilt',
			options: [
				{
					type: 'dropdown',
					label: 'Camera',
					id: 'camera',
					default: self.CHOICES_CAMERAS[0].id,
					choices: self.CHOICES_CAMERAS,
				},
				{
					type: 'dropdown',
					label: 'Direction',
					id: 'direction',
					default: self.CHOICES_CAMERA_TILT[0].id,
					choices: self.CHOICES_CAMERA_TILT,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '00' + options.camera + '23'
				let value = options.direction
				self.sendCommand(address, value)
			},
		}

		actions.camera_control_pt_speed = {
			name: 'Camera Control - Pan/Tilt Speed',
			options: [
				{
					type: 'dropdown',
					label: 'Camera',
					id: 'camera',
					default: self.CHOICES_CAMERAS[0].id,
					choices: self.CHOICES_CAMERAS,
				},
				{
					type: 'dropdown',
					label: 'Speed',
					id: 'speed',
					default: self.CHOICES_CAMERA_PAN_TILT_SPEED[0].id,
					choices: self.CHOICES_CAMERA_PAN_TILT_SPEED,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '00' + options.camera + '24'
				let value = options.speed
				self.sendCommand(address, value)
			},
		}

		actions.camera_control_zoom = {
			name: 'Camera Control - Zoom',
			options: [
				{
					type: 'dropdown',
					label: 'Camera',
					id: 'camera',
					default: self.CHOICES_CAMERAS[0].id,
					choices: self.CHOICES_CAMERAS,
				},
				{
					type: 'dropdown',
					label: 'Zoom',
					id: 'zoom',
					default: self.CHOICES_CAMERA_ZOOM[0].id,
					choices: self.CHOICES_CAMERA_ZOOM,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '00' + options.camera + '25'
				let value = options.zoom
				self.sendCommand(address, value)
			},
		}

		actions.camera_control_focus = {
			name: 'Camera Control - Focus',
			options: [
				{
					type: 'dropdown',
					label: 'Camera',
					id: 'camera',
					default: self.CHOICES_CAMERAS[0].id,
					choices: self.CHOICES_CAMERAS,
				},
				{
					type: 'dropdown',
					label: 'Focus',
					id: 'focus',
					default: self.CHOICES_CAMERA_FOCUS[0].id,
					choices: self.CHOICES_CAMERA_FOCUS,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '00' + options.camera + '26'
				let value = options.focus
				self.sendCommand(address, value)
			},
		}

		actions.camera_control_autofocus = {
			name: 'Camera Control - Auto Focus',
			options: [
				{
					type: 'dropdown',
					label: 'Camera',
					id: 'camera',
					default: self.CHOICES_CAMERAS[0].id,
					choices: self.CHOICES_CAMERAS,
				},
				{
					type: 'dropdown',
					label: 'Auto Focus',
					id: 'autofocus',
					default: '00',
					choices: [
						{ id: '00', label: 'Off' },
						{ id: '01', label: 'On' },
					],
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '00' + options.camera + '27'
				let value = options.autofocus
				self.sendCommand(address, value)
			},
		}

		actions.camera_control_exposure = {
			name: 'Camera Control - Exposure',
			options: [
				{
					type: 'dropdown',
					label: 'Camera',
					id: 'camera',
					default: self.CHOICES_CAMERAS[0].id,
					choices: self.CHOICES_CAMERAS,
				},
				{
					type: 'dropdown',
					label: 'Exposure',
					id: 'exposure',
					default: self.CHOICES_CAMERA_EXPOSURE[0].id,
					choices: self.CHOICES_CAMERA_EXPOSURE,
				},
			],
			callback: async function (action) {
				let options = action.options
				let address = '00' + options.camera + '28'
				let value = options.exposure
				self.sendCommand(address, value)
			},
		}

		this.setActionDefinitions(actions)
	},
}
