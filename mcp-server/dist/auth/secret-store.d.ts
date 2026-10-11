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
export declare class KeyringSecretStore implements SecretStore {
    private readonly entryFactory;
    constructor(entryFactory?: () => CredentialEntry);
    private entry;
    get(): string | undefined;
    set(token: string): void;
    remove(): boolean;
    available(): boolean;
}
/** Environment variable through which the host hands the server its token. */
export declare const HOST_TOKEN_VARIABLE = "MAIMEMO_TOKEN";
/**
 * A token the host supplied at launch, in front of the OS credential store.
 *
 * DeepSeek Harness keeps the token in its own credential store and passes it to
 * this process as {@link HOST_TOKEN_VARIABLE}, so a desktop install works without
 * a terminal. When the host passes none, every call falls through to the OS
 * store unchanged; the OS store itself never reads the environment. Writes always
 * go to the OS store: the host's copy is the host's to manage.
 */
export declare class HostTokenSecretStore implements SecretStore {
    private readonly fallback;
    private readonly hostToken;
    /**
     * @param hostToken - the token the host passed, if any; blank counts as none.
     * @param fallback - the OS credential store.
     */
    constructor(hostToken: string | undefined, fallback: SecretStore);
    get(): string | undefined;
    set(token: string): void;
    remove(): boolean;
    available(): boolean;
    source(): 'host' | 'keyring' | undefined;
}
export {};
