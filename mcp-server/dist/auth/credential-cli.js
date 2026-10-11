import { createRequire as __bundleCreateRequire } from 'node:module'; const require = __bundleCreateRequire(import.meta.url);

// src/auth/credential-cli.ts
import { emitKeypressEvents } from "node:readline";
import { stdin, stdout } from "node:process";

// src/auth/secret-store.ts
import { createRequire } from "node:module";

// src/errors.ts
var MaimemoError = class extends Error {
  constructor(code, message, retryAfterSeconds) {
    super(message);
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.name = "MaimemoError";
  }
  code;
  retryAfterSeconds;
};

// src/config.ts
var config = {
  apiBaseUrl: "https://open.maimemo.com",
  requestTimeoutMs: 1e4,
  maxAttempts: 2,
  localPageSizeMax: 50,
  supplementBatchMax: 50,
  upstreamCollectionMax: 1e3,
  previewMax: 50,
  credentialService: "momo-learning-mcp",
  /** Service names earlier releases stored the token under; read after the current one. */
  legacyCredentialServices: ["dsh.momo-learning-mcp", "codex.maimemo-learning-mcp"],
  credentialAccount: "default",
  /** Directory under the user's local app data that holds the mirror database. */
  dataDirectoryName: "MomoLearning",
  /** Directories earlier releases kept the mirror database in. */
  legacyDataDirectoryNames: ["CodexMomoLearning"]
};

// src/auth/secret-store.ts
var openEntry = (service) => {
  const keyring = createRequire(import.meta.url)("@napi-rs/keyring");
  return new keyring.Entry(service, config.credentialAccount);
};
var readServices = () => [
  config.credentialService,
  ...config.legacyCredentialServices
];
var KeyringSecretStore = class {
  constructor(entryFactory = openEntry) {
    this.entryFactory = entryFactory;
  }
  entryFactory;
  entry(service) {
    try {
      return this.entryFactory(service);
    } catch {
      throw new MaimemoError("CREDENTIAL_STORAGE_UNAVAILABLE", "\u65E0\u6CD5\u8BBF\u95EE\u64CD\u4F5C\u7CFB\u7EDF\u5B89\u5168\u51ED\u8BC1\u5B58\u50A8\u3002");
    }
  }
  get() {
    try {
      for (const service of readServices()) {
        const token = this.entry(service).getPassword();
        if (token) return token;
      }
      return void 0;
    } catch {
      throw new MaimemoError("CREDENTIAL_STORAGE_UNAVAILABLE", "\u65E0\u6CD5\u8BFB\u53D6\u64CD\u4F5C\u7CFB\u7EDF\u5B89\u5168\u51ED\u8BC1\u5B58\u50A8\u3002");
    }
  }
  set(token) {
    if (!token.trim()) throw new MaimemoError("INVALID_ARGUMENT", "\u8BBF\u95EE\u51ED\u8BC1\u4E0D\u80FD\u4E3A\u7A7A\u3002");
    try {
      this.entry(config.credentialService).setPassword(token.trim());
    } catch {
      throw new MaimemoError("CREDENTIAL_STORAGE_UNAVAILABLE", "\u65E0\u6CD5\u5199\u5165\u64CD\u4F5C\u7CFB\u7EDF\u5B89\u5168\u51ED\u8BC1\u5B58\u50A8\u3002");
    }
  }
  /**
   * Remove the token under the current name and every legacy one, so a removed
   * token cannot come back through an entry an earlier release wrote.
   * @returns whether any entry was removed.
   */
  remove() {
    let removed = false;
    for (const service of readServices()) {
      try {
        removed = this.entry(service).deletePassword() || removed;
      } catch {
        if (service === config.credentialService) {
          throw new MaimemoError("CREDENTIAL_STORAGE_UNAVAILABLE", "\u65E0\u6CD5\u5220\u9664\u64CD\u4F5C\u7CFB\u7EDF\u5B89\u5168\u51ED\u8BC1\u3002");
        }
      }
    }
    return removed;
  }
  available() {
    try {
      this.entry(config.credentialService);
      return true;
    } catch {
      return false;
    }
  }
};

// src/auth/credential-cli.ts
var usage = "\u7528\u6CD5\uFF1Anpm run credential -- <set|status|remove>";
var readHidden = async (prompt) => {
  if (!stdin.isTTY) throw new Error("\u51ED\u8BC1\u64CD\u4F5C\u53EA\u80FD\u5728\u4EA4\u4E92\u5F0F\u7EC8\u7AEF\u4E2D\u6267\u884C\u3002");
  stdout.write(prompt);
  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  return new Promise((resolve) => {
    let value = "";
    const onKeypress = (chunk, key) => {
      if (key.name === "return" || key.name === "enter") {
        stdin.off("keypress", onKeypress);
        stdin.setRawMode(false);
        stdout.write("\n");
        resolve(value);
      } else if (key.name === "backspace") {
        value = value.slice(0, -1);
      } else if (!key.ctrl && chunk) {
        value += chunk;
      }
    };
    stdin.on("keypress", onKeypress);
  });
};
var main = async () => {
  const action = process.argv[2];
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("\u51ED\u8BC1\u64CD\u4F5C\u53EA\u80FD\u5728\u4EA4\u4E92\u5F0F\u7EC8\u7AEF\u4E2D\u6267\u884C\u3002");
  const store = new KeyringSecretStore();
  if (action === "status") {
    stdout.write(store.get() ? "\u5DF2\u914D\u7F6E\u8BBF\u95EE\u51ED\u8BC1\u3002\n" : "\u5C1A\u672A\u914D\u7F6E\u8BBF\u95EE\u51ED\u8BC1\u3002\n");
    return;
  }
  if (action === "remove") {
    store.remove();
    stdout.write("\u5DF2\u79FB\u9664\u672C\u673A\u8BBF\u95EE\u51ED\u8BC1\u3002\n");
    return;
  }
  if (action === "set") {
    const token = await readHidden("\u8BF7\u8F93\u5165\u58A8\u58A8\u53EA\u8BFB\u8BBF\u95EE\u51ED\u8BC1\uFF1A");
    store.set(token);
    stdout.write("\u8BBF\u95EE\u51ED\u8BC1\u5DF2\u4FDD\u5B58\u5230\u64CD\u4F5C\u7CFB\u7EDF\u5B89\u5168\u51ED\u8BC1\u5B58\u50A8\u3002\n");
    return;
  }
  throw new Error(usage);
};
main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "\u51ED\u8BC1\u64CD\u4F5C\u5931\u8D25\u3002"}
`);
  process.exitCode = 1;
});
