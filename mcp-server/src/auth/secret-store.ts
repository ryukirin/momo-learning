/** Where the server gets the 墨墨 token from. */
export interface SecretStore {
  get(): string | undefined;
}

/** Environment variable through which the client hands the server its token. */
export const HOST_TOKEN_VARIABLE = 'MAIMEMO_TOKEN';

/** A `${…}` reference the client left unexpanded because the value was never set. */
const unexpandedReference = /^\$\{[^}]*\}$/;

/**
 * The token the client passed at launch.
 *
 * Both clients keep the token somewhere of their own and hand it over as
 * {@link HOST_TOKEN_VARIABLE}: DeepSeek Harness reads it from its credential
 * store, Claude Code from the plugin's sensitive setting. The server stores no
 * copy, so there is nothing of its own to configure.
 */
export class HostTokenSecretStore implements SecretStore {
  private readonly token: string | undefined;

  /**
   * @param hostToken - the token the client passed, if any. Blank counts as none,
   * and so does an unexpanded `${…}` reference to a value the user never set.
   */
  constructor(hostToken: string | undefined) {
    const trimmed = hostToken?.trim();
    this.token =
      trimmed === undefined || trimmed === '' || unexpandedReference.test(trimmed)
        ? undefined
        : trimmed;
  }

  get(): string | undefined {
    return this.token;
  }
}
