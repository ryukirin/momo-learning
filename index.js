/**
 * momo-learning — the DeepSeek Harness plugin entry that carries the 墨墨学习
 * learning mirror: the `momo-daily-learning` skill for the model, and the
 * resolved paths the sibling `cordis.patch.yml` row needs to launch the bundled
 * MCP server.
 *
 * The plugin imports nothing from the harness: it reads node builtins only, so
 * it loads from wherever its package directory ends up (a pnpm `link:` checkout,
 * a tarball, or a registry install) without a resolved dependency graph.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis plugin name, shown in loader diagnostics. */
export const name = 'momo-learning'

/**
 * This plugin contributes to the skill registry and reads the 墨墨 token from the
 * harness credential store; the MCP tools arrive through the separate
 * `@deepseek-ai/dsh-mcp-client` row.
 */
export const inject = ['skills', 'credentials']

/**
 * Credential name in the harness store, and the variable the MCP server reads it
 * from. The server falls back to the OS credential store when it is unset.
 */
const tokenName = 'MAIMEMO_TOKEN'

/** Absolute directory of this package, so bundled assets resolve wherever it is installed. */
const packageDir = dirname(fileURLToPath(import.meta.url))

/** Default skill directory name; the row's `config.skillName` may select another. */
const defaultSkillName = 'momo-daily-learning'

/** `---` fence plus a flat `key: value` block at the start of a skill file. */
const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/**
 * Split one `SKILL.md` into its frontmatter fields and instruction body.
 *
 * Skill files carry flat frontmatter only, so this reads the keys the registry
 * requires instead of pulling a YAML parser into a plugin that must resolve from
 * an arbitrary install location.
 * @param text - the whole file.
 * @returns the parsed fields and the body with the frontmatter removed.
 */
const parseSkillFile = (text) => {
    const match = frontmatterPattern.exec(text)
    if (match === null) return { fields: {}, content: text }
    const fields = {}
    for (const line of match[1].split(/\r?\n/)) {
        const separator = line.indexOf(':')
        if (separator > 0) fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
    }
    return { fields, content: text.slice(match[0].length).replace(/^(?:[ \t]*\r?\n)+/, '') }
}

/**
 * Read the 墨墨 token from the harness credential store.
 * @param ctx - the plugin context; `ctx.credentials` is the harness credential store.
 * @returns the environment the MCP server should receive: the token when one is
 * stored, otherwise nothing, so the server uses the OS credential store.
 */
const readTokenEnvironment = async (ctx) => {
    try {
        const hit = await ctx.credentials.resolve(tokenName)
        return typeof hit?.value === 'string' && hit.value.trim() !== '' ? { [tokenName]: hit.value } : {}
    } catch {
        // Never log the error itself: a provider's message could quote the value.
        ctx.logger.warn(`momo-learning: could not read ${tokenName} from the credential store; the MCP server will use the OS credential store`)
        return {}
    }
}

/**
 * Register the bundled skill and publish the package's own paths.
 * @param ctx - the plugin context; `ctx.skills` is the harness skill registry and
 * `ctx.credentials` the harness credential store.
 * @param config - optional row config; `skillName` selects the skill directory.
 * @throws when the selected skill file is missing or carries no description,
 * because a catalog entry without one cannot route the model to the skill.
 */
export async function apply(ctx, config = {}) {
    const skillsDir = join(packageDir, 'skills')
    const serverDir = join(packageDir, 'mcp-server')
    const serverScript = join(serverDir, 'dist', 'server.js')

    // Read by the MCP row's `!!js` config through its `inject` declaration, so
    // that row never has to guess where this package was installed. The token is
    // resolved first: the MCP row waits for this service, so it starts with it.
    // A token changed in the store reaches the server on the next restart.
    const env = await readTokenEnvironment(ctx)
    ctx.provide('momoLearningPaths', { packageDir, skillsDir, serverDir, serverScript, env })

    if (!existsSync(serverScript)) {
        ctx.logger.warn(
            `momo-learning: bundled MCP server is missing at ${serverScript}; `
            + `run "npm install && npm run build" in ${serverDir} to restore it`
        )
    }

    const skillName = config.skillName ?? defaultSkillName
    const skillDir = join(skillsDir, skillName)
    const skillFile = join(skillDir, 'SKILL.md')
    if (!existsSync(skillFile)) throw new Error(`momo-learning: skill file not found at ${skillFile}`)

    const { fields, content } = parseSkillFile(readFileSync(skillFile, 'utf8'))
    const registered = fields.name ?? skillName
    if (typeof fields.description !== 'string' || fields.description.length === 0) {
        throw new Error(`momo-learning: skill file ${skillFile} declares no description`)
    }

    // `source: 'bundled'` marks the skill as package-supplied rather than a
    // project or user file, so the catalog shows it for what it is.
    ctx.skills.register({
        name: registered,
        description: fields.description,
        content,
        source: 'bundled',
        resourceBase: { kind: 'directory', path: skillDir },
    })
    ctx.logger.info(`momo-learning: registered skill "${registered}"`)
}
