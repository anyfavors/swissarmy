import type { Component } from 'svelte';

/** Kind of value a tool consumes or produces, used when chaining tools together. */
export type ValueKind = 'text' | 'bytes' | 'json';

/**
 * Where a tool sends data. `false` means the tool never makes a network request.
 * When set, every host the tool contacts must be listed and also allowed in the CSP
 * (scripts/csp.js), otherwise the browser blocks the request.
 */
export type NetworkUse = false | { hosts: string[]; purpose: string };

export interface ToolMeta {
	/** URL slug, also the folder name under src/lib/tools. */
	id: string;
	/** Chapter number, see chapters.ts. */
	chapter: number;
	/** Position inside the chapter. Together with chapter this forms the manual number, e.g. FM 2-01. */
	section: number;
	title: string;
	/** One line, shown in the index and the command palette. */
	summary: string;
	keywords: string[];
	network: NetworkUse;
	/**
	 * Optional: how likely it is that a pasted value is meant for this tool, 0 to 1.
	 * Used by the intake field on the front page. Keep it cheap, it runs on every keystroke.
	 */
	detect?: (input: string) => number;
	/** Declared for future chaining. Tools that take and return a single value of a kind. */
	chain?: { in: ValueKind; out: ValueKind };
}

export interface ToolModule {
	default: Component;
}

/**
 * One step a tool offers to the chain view (/chain). Each tool that can take text and return
 * text exports `ops` from an ops.ts next to its logic. Steps throw an Error with a readable
 * message when the input does not fit.
 */
export interface ChainOp {
	/** Unique across the site, written as <tool id>.<op>, e.g. base64.decode. */
	id: string;
	label: string;
	run: (input: string) => string | Promise<string>;
}
