import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// tiny .env loader so we don't need any extra dependency.
// values already present in process.env always win.
const here = path.dirname(fileURLToPath(import.meta.url));

const parseFile = (file) => {
    try {
        if (!fs.existsSync(file))
            return;
        for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
            if (!line || line.trim().startsWith("#"))
                continue;
            const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
            if (!match)
                continue;
            let value = match[2].trim();
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            if (!(match[1] in process.env))
                process.env[match[1]] = value;
        }
    }
    catch {
        // a broken .env should never take the server down
    }
};

parseFile(path.join(here, ".env"));
export const env = (name, fallback = "") => process.env[name] || fallback;
