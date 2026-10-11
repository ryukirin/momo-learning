import { Entry } from '@napi-rs/keyring';
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

export class KeyringSecretStore implements SecretStore {
  constructor(
    private readonly entryFactory: () => CredentialEntry = () =>
      new Entry(config.credentialService, config.credentialAccount)
  ) {}

  private entry(): CredentialEntry {
    try {
      return this.entryFactory();
    } catch {
      throw new MaimemoError('CREDENTIAL_STORAGE_UNAVAILABLE', '无法访问操作系统安全凭证存储。');
    }
  }

  get(): string | undefined {
    try {
      return this.entry().getPassword() ?? undefined;
    } catch {
      throw new MaimemoError('CREDENTIAL_STORAGE_UNAVAILABLE', '无法读取操作系统安全凭证存储。');
    }
  }

  set(token: string): void {
    if (!token.trim()) throw new MaimemoError('INVALID_ARGUMENT', '访问凭证不能为空。');
    try {
      this.entry().setPassword(token.trim());
    } catch {
      throw new MaimemoError('CREDENTIAL_STORAGE_UNAVAILABLE', '无法写入操作系统安全凭证存储。');
    }
  }

  remove(): boolean {
    try {
      return this.entry().deletePassword();
    } catch {
      throw new MaimemoError('CREDENTIAL_STORAGE_UNAVAILABLE', '无法删除操作系统安全凭证。');
    }
  }

  available(): boolean {
    try {
      this.entry();
      return true;
    } catch {
      return false;
    }
  }
}

/** Environment variable through which the host hands the server its token. */
export const HOST_TOKEN_VARIABLE = 'MAIMEMO_TOKEN';

/**
 * A token the host supplied at launch, in front of the OS credential store.
 *
 * DeepSeek Harness keeps the token in its own credential store and passes it to
 * this process as {@link HOST_TOKEN_VARIABLE}, so a desktop install works without
 * a terminal. When the host passes none, every call falls through to the OS
 * store unchanged; the OS store itself never reads the environment. Writes always
 * go to the OS store: the host's copy is the host's to manage.
 */
export class HostTokenSecretStore implements SecretStore {
  private readonly hostToken: string | undefined;

  /**
   * @param hostToken - the token the host passed, if any; blank counts as none.
   * @param fallback - the OS credential store.
   */
  constructor(
    hostToken: string | undefined,
    private readonly fallback: SecretStore
  ) {
    const trimmed = hostToken?.trim();
    this.hostToken = trimmed === undefined || trimmed === '' ? undefined : trimmed;
  }

  get(): string | undefined {
    return this.hostToken ?? this.fallback.get();
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
    return this.fallback.get() === undefined ? undefined : 'keyring';
  }
}
