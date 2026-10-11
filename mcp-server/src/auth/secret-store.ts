import { createRequire } from 'node:module';
import { config } from '../config.js';
import { MaimemoError } from '../errors.js';

export interface SecretStore {
  get(): string | undefined;
  set(token: string): void;
  remove(): boolean;
  available(): boolean;
  /** Where the current token comes from, when the store can tell. */
  source?(): 'host' | 'keyring' | undefined;
}

interface CredentialEntry {
  getPassword(): string | null;
  setPassword(token: string): void;
  deletePassword(): boolean;
}

interface KeyringModule {
  Entry: new (service: string, account: string) => CredentialEntry;
}

/**
 * Open one OS credential entry.
 *
 * `@napi-rs/keyring` is loaded on first use instead of imported: the bundled
 * server ships without it, and a server whose host passes the token never needs
 * it. When it cannot be loaded, this throws like an unavailable store.
 * @param service - the credential service name.
 * @returns the entry for this project's account under that service.
 */
const openEntry = (service: string): CredentialEntry => {
  const keyring = createRequire(import.meta.url)('@napi-rs/keyring') as KeyringModule;
  return new keyring.Entry(service, config.credentialAccount);
};

/** Service names to read, current first; earlier releases stored the token under the others. */
const readServices = (): readonly string[] => [
  config.credentialService,
  ...config.legacyCredentialServices
];

export class KeyringSecretStore implements SecretStore {
  constructor(private readonly entryFactory: (service: string) => CredentialEntry = openEntry) {}

  private entry(service: string): CredentialEntry {
    try {
      return this.entryFactory(service);
    } catch {
      throw new MaimemoError('CREDENTIAL_STORAGE_UNAVAILABLE', '无法访问操作系统安全凭证存储。');
    }
  }

  get(): string | undefined {
    try {
      for (const service of readServices()) {
        const token = this.entry(service).getPassword();
        if (token) return token;
      }
      return undefined;
    } catch {
      throw new MaimemoError('CREDENTIAL_STORAGE_UNAVAILABLE', '无法读取操作系统安全凭证存储。');
    }
  }

  set(token: string): void {
    if (!token.trim()) throw new MaimemoError('INVALID_ARGUMENT', '访问凭证不能为空。');
    try {
      this.entry(config.credentialService).setPassword(token.trim());
    } catch {
      throw new MaimemoError('CREDENTIAL_STORAGE_UNAVAILABLE', '无法写入操作系统安全凭证存储。');
    }
  }

  /**
   * Remove the token under the current name and every legacy one, so a removed
   * token cannot come back through an entry an earlier release wrote.
   * @returns whether any entry was removed.
   */
  remove(): boolean {
    let removed = false;
    for (const service of readServices()) {
      try {
        removed = this.entry(service).deletePassword() || removed;
      } catch {
        // A legacy entry that was never written is not an error; the current
        // name failing means the store itself is unusable.
        if (service === config.credentialService) {
          throw new MaimemoError('CREDENTIAL_STORAGE_UNAVAILABLE', '无法删除操作系统安全凭证。');
        }
      }
    }
    return removed;
  }

  available(): boolean {
    try {
      this.entry(config.credentialService);
      return true;
    } catch {
      return false;
    }
  }
}

/** Environment variable through which the host hands the server its token. */
export const HOST_TOKEN_VARIABLE = 'MAIMEMO_TOKEN';

/** A `${…}` reference the host left unexpanded because the value was never set. */
const unexpandedReference = /^\$\{[^}]*\}$/;

/**
 * A token the host supplied at launch, in front of the OS credential store.
 *
 * The host passes the token as {@link HOST_TOKEN_VARIABLE}: DeepSeek Harness
 * reads it from its own credential store, Claude Code from the plugin's
 * `userConfig`. Either way the user never needs a terminal. When the host passes
 * nothing usable, every call falls through to the OS store unchanged; the OS
 * store itself never reads the environment. Writes always go to the OS store:
 * the host's copy is the host's to manage.
 */
export class HostTokenSecretStore implements SecretStore {
  private readonly hostToken: string | undefined;

  /**
   * @param hostToken - the token the host passed, if any. Blank counts as none,
   * and so does an unexpanded `${…}` reference to a value the user never set.
   * @param fallback - the OS credential store.
   */
  constructor(
    hostToken: string | undefined,
    private readonly fallback: SecretStore
  ) {
    const trimmed = hostToken?.trim();
    this.hostToken =
      trimmed === undefined || trimmed === '' || unexpandedReference.test(trimmed)
        ? undefined
        : trimmed;
  }

  /**
   * The host's token, else the OS store's.
   *
   * An OS store that cannot be used counts as holding no token here: a plugin
   * install may ship without the keyring module at all, and the useful answer
   * then is "not configured", which points the user at the host's settings.
   * `available()` still reports the store as unusable.
   * @returns the token, or `undefined` when neither source has one.
   */
  get(): string | undefined {
    if (this.hostToken !== undefined) return this.hostToken;
    try {
      return this.fallback.get();
    } catch (error) {
      if (error instanceof MaimemoError && error.code === 'CREDENTIAL_STORAGE_UNAVAILABLE') {
        return undefined;
      }
      throw error;
    }
  }

  set(token: string): void {
    this.fallback.set(token);
  }

  remove(): boolean {
    return this.fallback.remove();
  }

  available(): boolean {
    return this.hostToken !== undefined || this.fallback.available();
  }

  source(): 'host' | 'keyring' | undefined {
    if (this.hostToken !== undefined) return 'host';
    return this.get() === undefined ? undefined : 'keyring';
  }
}
