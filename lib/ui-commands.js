import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const COMMAND_FILE = "/ui-commands/request.json";
const RESULT_FILE = "/ui-commands/result.json";

export async function submitUiCommand(command, waitMs = 12000, sensitive = false) {
  const id = randomUUID().replaceAll("-", "");
  const dir = path.dirname(COMMAND_FILE);
  const tmp = path.join(dir, ".ui-command-" + randomUUID());
  await fs.writeFile(tmp, JSON.stringify({ id, requested_at: new Date().toISOString(), ...command }), { mode: 0o600, flag: "wx" });
  await fs.rename(tmp, COMMAND_FILE);

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    try {
      const result = JSON.parse(await fs.readFile(RESULT_FILE, "utf8"));
      if (result.id === id) {
        if (sensitive) await fs.unlink(RESULT_FILE).catch(() => {});
        return result;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return { id, ok: true, pending: true, message: "Request queued; refresh the dashboard for its status" };
}
