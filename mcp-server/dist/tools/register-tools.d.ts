import type Database from '../db/sqlite.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SecretStore } from '../auth/secret-store.js';
export declare const registerTools: (server: McpServer, db: Database, secrets: SecretStore) => void;
