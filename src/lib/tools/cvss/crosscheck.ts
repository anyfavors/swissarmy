/*
 * Cross-check vectors: random CVSS v3.1 vectors (half with every temporal and environmental
 * metric set) scored with Red Hat's independent "cvss" Python library, version 3.6
 * (https://github.com/RedHatProductSecurity/cvss). 20,000 such vectors were compared during
 * development with no mismatch; these 150 are kept as a regression set.
 * Columns: vector, base, temporal, environmental.
 */
export const crossCheck: [string, number, number, number][] = [
	[
		'CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:L/E:U/RL:X/RC:C/CR:X/IR:X/AR:L/MAV:L/MAC:X/MPR:N/MUI:X/MS:C/MC:N/MI:X/MA:X',
		6.1,
		5.6,
		6.9
	],
	['CVSS:3.1/AV:A/AC:L/PR:H/UI:R/S:U/C:H/I:H/A:N', 5.9, 5.9, 5.9],
	[
		'CVSS:3.1/AV:A/AC:H/PR:L/UI:N/S:U/C:N/I:L/A:N/E:H/RL:X/RC:C/CR:M/IR:X/AR:X/MAV:P/MAC:X/MPR:N/MUI:N/MS:C/MC:N/MI:L/MA:N',
		2.6,
		2.6,
		2.2
	],
	['CVSS:3.1/AV:P/AC:H/PR:L/UI:N/S:U/C:N/I:H/A:H', 5.6, 5.6, 5.6],
	[
		'CVSS:3.1/AV:L/AC:H/PR:L/UI:R/S:C/C:N/I:H/A:H/E:U/RL:T/RC:C/CR:M/IR:H/AR:L/MAV:L/MAC:X/MPR:X/MUI:R/MS:C/MC:L/MI:L/MA:L',
		7.2,
		6.3,
		4.5
	],
	['CVSS:3.1/AV:P/AC:H/PR:N/UI:N/S:C/C:L/I:N/A:N', 2.2, 2.2, 2.2],
	[
		'CVSS:3.1/AV:N/AC:L/PR:H/UI:R/S:C/C:L/I:N/A:L/E:F/RL:X/RC:U/CR:M/IR:H/AR:X/MAV:L/MAC:X/MPR:N/MUI:N/MS:X/MC:H/MI:N/MA:N',
		4.8,
		4.3,
		6.4
	],
	['CVSS:3.1/AV:P/AC:L/PR:N/UI:R/S:C/C:N/I:L/A:H', 5.9, 5.9, 5.9],
	[
		'CVSS:3.1/AV:P/AC:H/PR:H/UI:R/S:C/C:N/I:L/A:H/E:H/RL:X/RC:C/CR:H/IR:H/AR:H/MAV:X/MAC:L/MPR:N/MUI:N/MS:U/MC:X/MI:H/MA:N',
		5.4,
		5.4,
		6.4
	],
	['CVSS:3.1/AV:L/AC:H/PR:N/UI:N/S:C/C:N/I:N/A:L', 3.2, 3.2, 3.2],
	[
		'CVSS:3.1/AV:P/AC:H/PR:L/UI:N/S:C/C:N/I:L/A:H/E:H/RL:X/RC:C/CR:L/IR:H/AR:X/MAV:A/MAC:H/MPR:X/MUI:X/MS:X/MC:H/MI:X/MA:L',
		5.6,
		5.6,
		6.3
	],
	['CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:L/A:L', 5.4, 5.4, 5.4],
	[
		'CVSS:3.1/AV:L/AC:H/PR:N/UI:N/S:C/C:L/I:L/A:L/E:F/RL:X/RC:C/CR:X/IR:M/AR:M/MAV:L/MAC:H/MPR:N/MUI:R/MS:X/MC:H/MI:L/MA:H',
		5.6,
		5.5,
		7.4
	],
	['CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:C/C:N/I:L/A:H', 6.6, 6.6, 6.6],
	[
		'CVSS:3.1/AV:L/AC:L/PR:H/UI:R/S:U/C:N/I:H/A:H/E:P/RL:U/RC:C/CR:L/IR:M/AR:X/MAV:X/MAC:L/MPR:H/MUI:N/MS:X/MC:L/MI:N/MA:L',
		5.8,
		5.5,
		2.7
	],
	['CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:U/C:L/I:H/A:L', 7.3, 7.3, 7.3],
	[
		'CVSS:3.1/AV:A/AC:H/PR:H/UI:N/S:C/C:N/I:L/A:N/E:X/RL:X/RC:U/CR:H/IR:L/AR:H/MAV:L/MAC:H/MPR:L/MUI:X/MS:C/MC:N/MI:N/MA:N',
		2.6,
		2.4,
		0.0
	],
	['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:L', 8.2, 8.2, 8.2],
	[
		'CVSS:3.1/AV:A/AC:H/PR:H/UI:R/S:U/C:N/I:N/A:H/E:X/RL:X/RC:X/CR:H/IR:L/AR:H/MAV:N/MAC:X/MPR:L/MUI:X/MS:U/MC:H/MI:L/MA:L',
		4.0,
		4.0,
		7.0
	],
	['CVSS:3.1/AV:P/AC:L/PR:N/UI:R/S:C/C:N/I:N/A:N', 0.0, 0.0, 0.0],
	[
		'CVSS:3.1/AV:P/AC:L/PR:H/UI:N/S:U/C:L/I:H/A:N/E:X/RL:U/RC:C/CR:H/IR:L/AR:X/MAV:P/MAC:X/MPR:L/MUI:R/MS:C/MC:N/MI:X/MA:X',
		4.6,
		4.6,
		2.7
	],
	['CVSS:3.1/AV:A/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:N', 3.5, 3.5, 3.5],
	[
		'CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:U/C:N/I:L/A:L/E:U/RL:O/RC:U/CR:H/IR:M/AR:H/MAV:L/MAC:X/MPR:H/MUI:X/MS:U/MC:N/MI:L/MA:X',
		4.6,
		3.7,
		3.0
	],
	['CVSS:3.1/AV:A/AC:H/PR:N/UI:N/S:C/C:H/I:H/A:N', 8.0, 8.0, 8.0],
	[
		'CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:C/C:H/I:N/A:H/E:P/RL:T/RC:C/CR:H/IR:H/AR:L/MAV:P/MAC:L/MPR:L/MUI:N/MS:X/MC:L/MI:L/MA:X',
		8.4,
		7.6,
		5.6
	],
	['CVSS:3.1/AV:L/AC:L/PR:L/UI:R/S:C/C:N/I:H/A:L', 6.7, 6.7, 6.7],
	[
		'CVSS:3.1/AV:L/AC:H/PR:H/UI:N/S:U/C:H/I:H/A:H/E:F/RL:W/RC:X/CR:H/IR:M/AR:H/MAV:L/MAC:H/MPR:L/MUI:N/MS:X/MC:N/MI:L/MA:X',
		6.4,
		6.1,
		6.4
	],
	['CVSS:3.1/AV:L/AC:L/PR:H/UI:N/S:C/C:H/I:L/A:H', 8.1, 8.1, 8.1],
	[
		'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:H/A:L/E:X/RL:W/RC:U/CR:M/IR:H/AR:X/MAV:P/MAC:H/MPR:N/MUI:X/MS:X/MC:L/MI:X/MA:H',
		7.0,
		6.3,
		5.8
	],
	['CVSS:3.1/AV:A/AC:H/PR:H/UI:R/S:U/C:L/I:L/A:N', 2.9, 2.9, 2.9],
	[
		'CVSS:3.1/AV:A/AC:H/PR:L/UI:N/S:C/C:H/I:H/A:H/E:U/RL:O/RC:C/CR:L/IR:H/AR:L/MAV:X/MAC:H/MPR:H/MUI:R/MS:U/MC:N/MI:L/MA:H',
		8.0,
		7.0,
		3.2
	],
	['CVSS:3.1/AV:A/AC:H/PR:N/UI:N/S:C/C:L/I:H/A:H', 8.2, 8.2, 8.2],
	[
		'CVSS:3.1/AV:N/AC:L/PR:H/UI:R/S:C/C:H/I:H/A:H/E:P/RL:O/RC:R/CR:H/IR:M/AR:X/MAV:L/MAC:X/MPR:N/MUI:N/MS:U/MC:X/MI:L/MA:L',
		8.4,
		7.3,
		7.3
	],
	['CVSS:3.1/AV:L/AC:H/PR:N/UI:N/S:C/C:H/I:L/A:H', 8.1, 8.1, 8.0],
	[
		'CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:C/C:L/I:N/A:N/E:H/RL:U/RC:X/CR:X/IR:M/AR:X/MAV:N/MAC:L/MPR:X/MUI:N/MS:X/MC:L/MI:L/MA:H',
		3.5,
		3.5,
		9.1
	],
	['CVSS:3.1/AV:N/AC:L/PR:H/UI:R/S:C/C:N/I:L/A:H', 6.9, 6.9, 6.9],
	[
		'CVSS:3.1/AV:L/AC:L/PR:N/UI:R/S:U/C:N/I:N/A:N/E:X/RL:O/RC:C/CR:X/IR:X/AR:X/MAV:N/MAC:H/MPR:L/MUI:X/MS:U/MC:N/MI:X/MA:X',
		0.0,
		0.0,
		0.0
	],
	['CVSS:3.1/AV:A/AC:H/PR:L/UI:N/S:C/C:H/I:N/A:N', 5.8, 5.8, 5.8],
	[
		'CVSS:3.1/AV:N/AC:L/PR:H/UI:R/S:C/C:H/I:L/A:H/E:H/RL:U/RC:U/CR:L/IR:L/AR:X/MAV:L/MAC:H/MPR:L/MUI:X/MS:C/MC:H/MI:X/MA:H',
		8.3,
		7.7,
		6.0
	],
	['CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:U/C:H/I:L/A:H', 5.8, 5.8, 5.8],
	[
		'CVSS:3.1/AV:P/AC:H/PR:H/UI:N/S:U/C:N/I:L/A:L/E:U/RL:W/RC:U/CR:L/IR:L/AR:X/MAV:P/MAC:X/MPR:L/MUI:X/MS:U/MC:X/MI:L/MA:N',
		2.7,
		2.2,
		0.9
	],
	['CVSS:3.1/AV:N/AC:H/PR:L/UI:R/S:U/C:H/I:H/A:N', 6.4, 6.4, 6.4],
	[
		'CVSS:3.1/AV:N/AC:L/PR:H/UI:R/S:C/C:H/I:N/A:N/E:U/RL:W/RC:X/CR:M/IR:H/AR:L/MAV:L/MAC:L/MPR:X/MUI:X/MS:X/MC:N/MI:N/MA:N',
		6.2,
		5.5,
		0.0
	],
	['CVSS:3.1/AV:L/AC:L/PR:L/UI:R/S:C/C:L/I:H/A:L', 7.3, 7.3, 7.3],
	[
		'CVSS:3.1/AV:N/AC:H/PR:L/UI:R/S:U/C:H/I:N/A:H/E:F/RL:W/RC:R/CR:X/IR:L/AR:L/MAV:P/MAC:X/MPR:L/MUI:N/MS:U/MC:X/MI:L/MA:X',
		6.4,
		5.8,
		4.6
	],
	['CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:U/C:L/I:L/A:N', 3.3, 3.3, 3.3],
	[
		'CVSS:3.1/AV:L/AC:L/PR:L/UI:R/S:U/C:N/I:L/A:N/E:U/RL:U/RC:X/CR:X/IR:L/AR:L/MAV:P/MAC:X/MPR:L/MUI:N/MS:X/MC:H/MI:H/MA:N',
		2.8,
		2.6,
		4.7
	],
	['CVSS:3.1/AV:P/AC:H/PR:L/UI:R/S:C/C:N/I:N/A:N', 0.0, 0.0, 0.0],
	[
		'CVSS:3.1/AV:L/AC:H/PR:H/UI:N/S:C/C:L/I:N/A:N/E:P/RL:X/RC:C/CR:H/IR:X/AR:H/MAV:P/MAC:L/MPR:N/MUI:N/MS:U/MC:N/MI:N/MA:H',
		2.5,
		2.4,
		6.1
	],
	['CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:C/C:N/I:H/A:L', 8.2, 8.2, 8.2],
	[
		'CVSS:3.1/AV:A/AC:H/PR:L/UI:N/S:U/C:N/I:L/A:L/E:P/RL:O/RC:C/CR:L/IR:M/AR:M/MAV:X/MAC:L/MPR:L/MUI:R/MS:U/MC:H/MI:H/MA:X',
		3.7,
		3.4,
		5.8
	],
	['CVSS:3.1/AV:L/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:H', 7.3, 7.3, 7.3],
	[
		'CVSS:3.1/AV:A/AC:L/PR:L/UI:R/S:C/C:H/I:H/A:L/E:U/RL:T/RC:U/CR:H/IR:X/AR:H/MAV:N/MAC:X/MPR:X/MUI:R/MS:C/MC:N/MI:X/MA:X',
		8.3,
		6.7,
		6.5
	],
	['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:N/A:L', 9.3, 9.3, 9.3],
	[
		'CVSS:3.1/AV:P/AC:L/PR:N/UI:N/S:C/C:N/I:N/A:H/E:P/RL:W/RC:C/CR:X/IR:X/AR:M/MAV:L/MAC:L/MPR:L/MUI:R/MS:X/MC:N/MI:H/MA:H',
		5.3,
		4.9,
		7.2
	],
	['CVSS:3.1/AV:N/AC:H/PR:H/UI:R/S:U/C:H/I:H/A:L', 6.0, 6.0, 6.0],
	[
		'CVSS:3.1/AV:P/AC:L/PR:L/UI:N/S:C/C:L/I:H/A:L/E:X/RL:W/RC:U/CR:M/IR:L/AR:H/MAV:X/MAC:L/MPR:X/MUI:X/MS:U/MC:H/MI:L/MA:H',
		6.5,
		5.9,
		5.9
	],
	['CVSS:3.1/AV:A/AC:H/PR:N/UI:R/S:C/C:H/I:N/A:L', 6.4, 6.4, 6.4],
	[
		'CVSS:3.1/AV:A/AC:L/PR:L/UI:R/S:U/C:N/I:H/A:L/E:X/RL:U/RC:X/CR:H/IR:L/AR:X/MAV:X/MAC:X/MPR:H/MUI:N/MS:C/MC:L/MI:X/MA:X',
		5.8,
		5.8,
		6.7
	],
	['CVSS:3.1/AV:A/AC:H/PR:N/UI:N/S:C/C:H/I:L/A:N', 6.9, 6.9, 6.9],
	[
		'CVSS:3.1/AV:P/AC:H/PR:L/UI:R/S:U/C:H/I:H/A:H/E:F/RL:X/RC:R/CR:L/IR:X/AR:H/MAV:L/MAC:L/MPR:L/MUI:N/MS:X/MC:X/MI:N/MA:H',
		6.2,
		5.8,
		7.1
	],
	['CVSS:3.1/AV:L/AC:H/PR:N/UI:R/S:C/C:N/I:L/A:H', 6.3, 6.3, 6.3],
	[
		'CVSS:3.1/AV:P/AC:L/PR:H/UI:R/S:U/C:L/I:H/A:L/E:X/RL:X/RC:R/CR:H/IR:X/AR:M/MAV:A/MAC:L/MPR:L/MUI:R/MS:X/MC:L/MI:L/MA:L',
		5.0,
		4.8,
		5.2
	],
	['CVSS:3.1/AV:L/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:L', 6.3, 6.3, 6.3],
	[
		'CVSS:3.1/AV:P/AC:H/PR:L/UI:R/S:C/C:H/I:L/A:H/E:X/RL:W/RC:C/CR:H/IR:M/AR:M/MAV:L/MAC:L/MPR:X/MUI:R/MS:X/MC:N/MI:H/MA:H',
		6.8,
		6.6,
		7.6
	],
	['CVSS:3.1/AV:P/AC:L/PR:H/UI:N/S:C/C:N/I:N/A:L', 2.2, 2.2, 2.2],
	[
		'CVSS:3.1/AV:A/AC:H/PR:N/UI:N/S:C/C:N/I:H/A:H/E:X/RL:T/RC:U/CR:L/IR:H/AR:H/MAV:N/MAC:L/MPR:H/MUI:R/MS:C/MC:H/MI:X/MA:L',
		8.0,
		7.1,
		7.6
	],
	['CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:C/C:L/I:N/A:L', 3.7, 3.7, 3.7],
	[
		'CVSS:3.1/AV:A/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:L/E:U/RL:U/RC:R/CR:X/IR:L/AR:M/MAV:N/MAC:H/MPR:N/MUI:R/MS:X/MC:N/MI:X/MA:X',
		7.1,
		6.3,
		4.0
	],
	['CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:C/C:H/I:L/A:H', 8.2, 8.2, 8.2],
	[
		'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:H/E:P/RL:O/RC:R/CR:X/IR:X/AR:M/MAV:N/MAC:X/MPR:L/MUI:N/MS:X/MC:X/MI:H/MA:L',
		8.2,
		7.1,
		6.6
	],
	['CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:N/I:L/A:H', 8.2, 8.2, 8.2],
	[
		'CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:C/C:N/I:L/A:H/E:P/RL:X/RC:U/CR:H/IR:X/AR:H/MAV:L/MAC:H/MPR:L/MUI:N/MS:U/MC:L/MI:N/MA:X',
		7.9,
		6.9,
		5.9
	],
	['CVSS:3.1/AV:L/AC:H/PR:L/UI:R/S:U/C:L/I:N/A:H', 5.0, 5.0, 5.0],
	[
		'CVSS:3.1/AV:P/AC:H/PR:N/UI:N/S:C/C:H/I:L/A:H/E:X/RL:T/RC:R/CR:L/IR:H/AR:H/MAV:X/MAC:X/MPR:N/MUI:R/MS:U/MC:X/MI:L/MA:H',
		7.1,
		6.6,
		5.9
	],
	['CVSS:3.1/AV:A/AC:H/PR:L/UI:N/S:U/C:H/I:H/A:L', 6.7, 6.7, 6.7],
	[
		'CVSS:3.1/AV:P/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:H/E:U/RL:T/RC:X/CR:H/IR:H/AR:L/MAV:P/MAC:X/MPR:H/MUI:X/MS:C/MC:H/MI:X/MA:N',
		5.4,
		4.8,
		6.3
	],
	['CVSS:3.1/AV:A/AC:H/PR:L/UI:N/S:U/C:H/I:N/A:H', 6.4, 6.4, 6.4],
	[
		'CVSS:3.1/AV:N/AC:L/PR:H/UI:R/S:U/C:L/I:N/A:L/E:U/RL:W/RC:U/CR:M/IR:H/AR:L/MAV:L/MAC:H/MPR:L/MUI:N/MS:C/MC:N/MI:H/MA:X',
		3.5,
		2.9,
		6.4
	],
	['CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:C/C:N/I:L/A:H', 7.1, 7.1, 7.1],
	[
		'CVSS:3.1/AV:P/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:L/E:X/RL:T/RC:X/CR:X/IR:H/AR:X/MAV:A/MAC:H/MPR:X/MUI:X/MS:C/MC:N/MI:H/MA:X',
		3.9,
		3.8,
		8.1
	],
	['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:L/I:H/A:N', 9.3, 9.3, 9.3],
	[
		'CVSS:3.1/AV:A/AC:L/PR:L/UI:R/S:U/C:L/I:N/A:L/E:P/RL:U/RC:R/CR:L/IR:H/AR:M/MAV:P/MAC:H/MPR:N/MUI:N/MS:U/MC:X/MI:H/MA:H',
		4.1,
		3.7,
		5.8
	],
	['CVSS:3.1/AV:P/AC:L/PR:H/UI:R/S:C/C:L/I:H/A:L', 6.2, 6.2, 6.2],
	[
		'CVSS:3.1/AV:N/AC:L/PR:H/UI:R/S:C/C:N/I:N/A:N/E:X/RL:W/RC:U/CR:M/IR:M/AR:L/MAV:A/MAC:H/MPR:N/MUI:N/MS:U/MC:X/MI:N/MA:H',
		0.0,
		0.0,
		3.2
	],
	['CVSS:3.1/AV:A/AC:L/PR:L/UI:R/S:C/C:N/I:N/A:N', 0.0, 0.0, 0.0],
	[
		'CVSS:3.1/AV:L/AC:L/PR:H/UI:N/S:U/C:H/I:L/A:N/E:P/RL:T/RC:R/CR:X/IR:H/AR:L/MAV:N/MAC:H/MPR:X/MUI:X/MS:X/MC:X/MI:L/MA:L',
		5.1,
		4.5,
		4.8
	],
	['CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:C/C:N/I:L/A:N', 3.0, 3.0, 3.0],
	[
		'CVSS:3.1/AV:A/AC:L/PR:L/UI:R/S:U/C:H/I:H/A:H/E:H/RL:T/RC:X/CR:X/IR:H/AR:M/MAV:L/MAC:L/MPR:X/MUI:X/MS:C/MC:L/MI:N/MA:N',
		7.4,
		7.2,
		3.1
	],
	['CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:L', 7.1, 7.1, 7.1],
	[
		'CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N/E:H/RL:U/RC:U/CR:H/IR:L/AR:H/MAV:P/MAC:L/MPR:X/MUI:N/MS:C/MC:X/MI:N/MA:X',
		6.5,
		6.0,
		6.9
	],
	['CVSS:3.1/AV:P/AC:H/PR:H/UI:R/S:U/C:N/I:N/A:L', 1.6, 1.6, 1.6],
	[
		'CVSS:3.1/AV:A/AC:L/PR:N/UI:R/S:U/C:N/I:H/A:H/E:F/RL:W/RC:X/CR:M/IR:L/AR:M/MAV:A/MAC:H/MPR:N/MUI:X/MS:C/MC:X/MI:H/MA:L',
		7.3,
		6.9,
		4.5
	],
	['CVSS:3.1/AV:A/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N', 4.6, 4.6, 4.6],
	[
		'CVSS:3.1/AV:A/AC:H/PR:H/UI:R/S:C/C:N/I:N/A:H/E:X/RL:T/RC:C/CR:M/IR:H/AR:L/MAV:P/MAC:H/MPR:X/MUI:R/MS:X/MC:H/MI:X/MA:X',
		5.1,
		4.9,
		5.4
	],
	['CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:N/A:H', 8.7, 8.7, 8.7],
	[
		'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H/E:U/RL:W/RC:C/CR:X/IR:L/AR:X/MAV:N/MAC:X/MPR:N/MUI:X/MS:X/MC:X/MI:X/MA:L',
		9.1,
		8.1,
		6.1
	],
	['CVSS:3.1/AV:P/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:L', 4.3, 4.3, 4.3],
	[
		'CVSS:3.1/AV:P/AC:H/PR:N/UI:R/S:C/C:L/I:H/A:N/E:F/RL:W/RC:U/CR:M/IR:X/AR:L/MAV:X/MAC:L/MPR:X/MUI:N/MS:U/MC:X/MI:H/MA:X',
		5.6,
		4.9,
		4.6
	],
	['CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:L/I:H/A:H', 7.3, 7.3, 7.3],
	[
		'CVSS:3.1/AV:L/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:L/E:U/RL:W/RC:C/CR:M/IR:H/AR:H/MAV:L/MAC:X/MPR:X/MUI:R/MS:X/MC:N/MI:X/MA:L',
		3.6,
		3.2,
		2.9
	],
	['CVSS:3.1/AV:L/AC:L/PR:L/UI:R/S:U/C:L/I:N/A:H', 5.6, 5.6, 5.6],
	[
		'CVSS:3.1/AV:L/AC:L/PR:L/UI:R/S:C/C:N/I:N/A:H/E:P/RL:U/RC:U/CR:H/IR:X/AR:M/MAV:P/MAC:L/MPR:N/MUI:N/MS:C/MC:L/MI:H/MA:N',
		5.9,
		5.2,
		5.7
	],
	['CVSS:3.1/AV:P/AC:H/PR:H/UI:N/S:U/C:L/I:L/A:N', 2.7, 2.7, 2.7],
	[
		'CVSS:3.1/AV:A/AC:L/PR:L/UI:R/S:U/C:N/I:H/A:H/E:F/RL:O/RC:R/CR:H/IR:H/AR:M/MAV:N/MAC:L/MPR:X/MUI:X/MS:C/MC:X/MI:H/MA:N',
		6.7,
		6.0,
		7.9
	],
	['CVSS:3.1/AV:A/AC:L/PR:L/UI:R/S:C/C:L/I:H/A:H', 8.3, 8.3, 8.3],
	[
		'CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:C/C:H/I:H/A:L/E:P/RL:U/RC:R/CR:L/IR:X/AR:H/MAV:A/MAC:H/MPR:H/MUI:X/MS:C/MC:H/MI:N/MA:N',
		8.2,
		7.4,
		2.6
	],
	['CVSS:3.1/AV:A/AC:L/PR:H/UI:N/S:U/C:L/I:L/A:L', 4.3, 4.3, 4.3],
	[
		'CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:C/C:N/I:N/A:N/E:H/RL:W/RC:U/CR:L/IR:L/AR:X/MAV:P/MAC:L/MPR:N/MUI:R/MS:U/MC:X/MI:N/MA:N',
		0.0,
		0.0,
		0.0
	],
	['CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N', 6.5, 6.5, 6.5],
	[
		'CVSS:3.1/AV:L/AC:L/PR:H/UI:R/S:U/C:N/I:L/A:N/E:X/RL:W/RC:R/CR:L/IR:L/AR:H/MAV:N/MAC:L/MPR:X/MUI:R/MS:C/MC:L/MI:X/MA:L',
		2.0,
		1.9,
		5.1
	],
	['CVSS:3.1/AV:L/AC:H/PR:L/UI:N/S:U/C:H/I:L/A:L', 5.8, 5.8, 5.8],
	[
		'CVSS:3.1/AV:L/AC:H/PR:N/UI:N/S:C/C:N/I:L/A:N/E:H/RL:T/RC:U/CR:H/IR:H/AR:H/MAV:X/MAC:H/MPR:N/MUI:N/MS:C/MC:H/MI:H/MA:L',
		3.2,
		2.9,
		7.3
	],
	['CVSS:3.1/AV:P/AC:H/PR:L/UI:N/S:C/C:L/I:H/A:L', 6.2, 6.2, 6.2],
	[
		'CVSS:3.1/AV:P/AC:H/PR:L/UI:N/S:C/C:H/I:N/A:L/E:F/RL:U/RC:R/CR:M/IR:L/AR:L/MAV:L/MAC:H/MPR:X/MUI:R/MS:U/MC:H/MI:L/MA:N',
		5.6,
		5.3,
		4.4
	],
	['CVSS:3.1/AV:N/AC:L/PR:H/UI:R/S:U/C:N/I:L/A:N', 2.4, 2.4, 2.4],
	[
		'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:L/I:N/A:H/E:U/RL:U/RC:C/CR:H/IR:L/AR:M/MAV:N/MAC:X/MPR:H/MUI:R/MS:X/MC:X/MI:L/MA:H',
		9.3,
		8.5,
		7.0
	],
	['CVSS:3.1/AV:P/AC:L/PR:H/UI:N/S:C/C:N/I:H/A:N', 4.9, 4.9, 4.9],
	[
		'CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:L/A:N/E:X/RL:T/RC:U/CR:H/IR:L/AR:H/MAV:L/MAC:X/MPR:X/MUI:X/MS:U/MC:N/MI:N/MA:L',
		4.2,
		3.8,
		2.9
	],
	['CVSS:3.1/AV:P/AC:H/PR:L/UI:R/S:U/C:H/I:N/A:L', 4.5, 4.5, 4.5],
	[
		'CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:N/A:L/E:P/RL:U/RC:X/CR:H/IR:L/AR:H/MAV:A/MAC:X/MPR:L/MUI:N/MS:U/MC:H/MI:L/MA:N',
		7.6,
		7.2,
		7.2
	],
	['CVSS:3.1/AV:L/AC:H/PR:L/UI:N/S:C/C:L/I:L/A:L', 5.3, 5.3, 5.3],
	[
		'CVSS:3.1/AV:P/AC:H/PR:H/UI:R/S:C/C:H/I:N/A:L/E:X/RL:W/RC:C/CR:M/IR:M/AR:H/MAV:P/MAC:H/MPR:X/MUI:X/MS:U/MC:N/MI:X/MA:N',
		5.4,
		5.3,
		0.0
	],
	['CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N', 4.0, 4.0, 4.0],
	[
		'CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:U/C:H/I:H/A:N/E:P/RL:U/RC:X/CR:H/IR:X/AR:L/MAV:X/MAC:H/MPR:X/MUI:N/MS:X/MC:L/MI:L/MA:L',
		5.9,
		5.6,
		4.0
	],
	['CVSS:3.1/AV:A/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N', 2.6, 2.6, 2.6],
	[
		'CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:U/C:L/I:N/A:N/E:P/RL:T/RC:X/CR:X/IR:L/AR:H/MAV:L/MAC:L/MPR:X/MUI:X/MS:C/MC:N/MI:H/MA:H',
		2.2,
		2.0,
		7.4
	],
	['CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H', 8.1, 8.1, 8.1],
	[
		'CVSS:3.1/AV:A/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N/E:H/RL:X/RC:R/CR:H/IR:X/AR:M/MAV:P/MAC:H/MPR:H/MUI:N/MS:C/MC:L/MI:X/MA:X',
		2.6,
		2.5,
		2.7
	],
	['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:L/I:L/A:N', 7.2, 7.2, 7.2],
	[
		'CVSS:3.1/AV:A/AC:H/PR:H/UI:N/S:C/C:L/I:N/A:N/E:P/RL:T/RC:C/CR:H/IR:X/AR:M/MAV:N/MAC:H/MPR:H/MUI:N/MS:U/MC:N/MI:L/MA:L',
		2.6,
		2.4,
		3.0
	],
	['CVSS:3.1/AV:L/AC:H/PR:N/UI:R/S:U/C:H/I:N/A:L', 5.3, 5.3, 5.3],
	[
		'CVSS:3.1/AV:P/AC:L/PR:L/UI:R/S:C/C:N/I:H/A:L/E:F/RL:X/RC:R/CR:M/IR:M/AR:L/MAV:N/MAC:H/MPR:X/MUI:N/MS:X/MC:H/MI:L/MA:N',
		5.7,
		5.4,
		6.7
	],
	['CVSS:3.1/AV:L/AC:L/PR:H/UI:R/S:C/C:H/I:N/A:H', 7.4, 7.4, 7.4],
	[
		'CVSS:3.1/AV:L/AC:L/PR:H/UI:R/S:C/C:N/I:H/A:L/E:U/RL:X/RC:U/CR:L/IR:X/AR:M/MAV:X/MAC:X/MPR:H/MUI:R/MS:C/MC:L/MI:L/MA:N',
		6.3,
		5.3,
		3.0
	],
	['CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:L', 7.1, 7.1, 7.1],
	[
		'CVSS:3.1/AV:L/AC:H/PR:L/UI:N/S:U/C:H/I:L/A:L/E:X/RL:W/RC:U/CR:X/IR:H/AR:M/MAV:P/MAC:X/MPR:L/MUI:N/MS:C/MC:X/MI:X/MA:X',
		5.8,
		5.2,
		5.9
	],
	['CVSS:3.1/AV:A/AC:H/PR:H/UI:N/S:C/C:L/I:L/A:H', 6.8, 6.8, 6.8],
	[
		'CVSS:3.1/AV:P/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:L/E:X/RL:X/RC:X/CR:X/IR:M/AR:L/MAV:L/MAC:X/MPR:H/MUI:X/MS:C/MC:X/MI:L/MA:L',
		7.3,
		7.3,
		7.0
	],
	['CVSS:3.1/AV:A/AC:L/PR:H/UI:R/S:U/C:L/I:H/A:L', 5.4, 5.4, 5.4],
	[
		'CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:C/C:L/I:H/A:N/E:X/RL:X/RC:R/CR:L/IR:X/AR:X/MAV:N/MAC:L/MPR:X/MUI:X/MS:C/MC:L/MI:N/MA:X',
		8.2,
		7.9,
		4.8
	],
	['CVSS:3.1/AV:P/AC:H/PR:L/UI:R/S:C/C:H/I:L/A:L', 6.1, 6.1, 6.1],
	[
		'CVSS:3.1/AV:P/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:L/E:H/RL:X/RC:C/CR:H/IR:X/AR:M/MAV:N/MAC:L/MPR:X/MUI:N/MS:X/MC:X/MI:N/MA:L',
		4.9,
		4.9,
		4.3
	],
	['CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:C/C:H/I:L/A:H', 8.7, 8.7, 8.7],
	[
		'CVSS:3.1/AV:N/AC:L/PR:H/UI:R/S:U/C:L/I:H/A:L/E:P/RL:T/RC:C/CR:H/IR:X/AR:M/MAV:P/MAC:L/MPR:L/MUI:X/MS:U/MC:N/MI:X/MA:L',
		5.7,
		5.2,
		4.4
	],
	['CVSS:3.1/AV:P/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:H', 4.2, 4.2, 4.2],
	[
		'CVSS:3.1/AV:P/AC:H/PR:N/UI:R/S:U/C:L/I:L/A:L/E:H/RL:U/RC:X/CR:L/IR:M/AR:L/MAV:N/MAC:X/MPR:L/MUI:X/MS:C/MC:X/MI:N/MA:L',
		3.8,
		3.8,
		2.9
	],
	['CVSS:3.1/AV:A/AC:H/PR:N/UI:R/S:U/C:L/I:L/A:H', 5.9, 5.9, 5.9],
	[
		'CVSS:3.1/AV:P/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:H/E:H/RL:U/RC:X/CR:X/IR:L/AR:M/MAV:N/MAC:X/MPR:N/MUI:R/MS:C/MC:H/MI:L/MA:H',
		5.9,
		5.9,
		9.4
	],
	['CVSS:3.1/AV:N/AC:L/PR:H/UI:R/S:U/C:N/I:L/A:L', 3.5, 3.5, 3.5]
];
