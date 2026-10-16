/**
 * Anthropic server tool versions. The only place these strings live.
 * Checked against https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
 * and .../web-fetch-tool on 2026-10-16.
 *
 * Basic versions on purpose: later versions add "dynamic filtering", which runs code on
 * Anthropic's servers. Research tasks use no code execution.
 */
export const WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search' } as const
export const WEB_FETCH_TOOL = { type: 'web_fetch_20250910', name: 'web_fetch' } as const
