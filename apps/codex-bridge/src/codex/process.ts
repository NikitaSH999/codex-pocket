import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export class CodexAppServerProcess {
  private child: ChildProcessWithoutNullStreams | null = null;

  constructor(
    private readonly codexCommand: string,
    private readonly listenUrl: string
  ) {}

  start() {
    if (this.child) {
      return;
    }

    if (process.platform === "win32") {
      this.child = spawn(
        "cmd.exe",
        ["/d", "/s", "/c", `${this.codexCommand} app-server --listen ${this.listenUrl}`],
        { stdio: "pipe" }
      );
    } else {
      this.child = spawn(this.codexCommand, ["app-server", "--listen", this.listenUrl], {
        stdio: "pipe"
      });
    }

    this.child.stdout.on("data", (chunk) => {
      process.stdout.write(`[codex-app-server] ${chunk}`);
    });
    this.child.stderr.on("data", (chunk) => {
      process.stderr.write(`[codex-app-server] ${chunk}`);
    });
    this.child.on("exit", () => {
      this.child = null;
    });
  }

  stop() {
    this.child?.kill();
    this.child = null;
  }
}

