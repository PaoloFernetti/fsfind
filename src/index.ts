import fs from "fs";
import path from "path";
import os from "os";

function query(currentPath: string, target: string): string | undefined {
    let entries = fs.readdirSync(currentPath);

    for (let i = 0; i < entries.length; i++) {
        try {
            let entry = entries[i];
            let isDir = fs.lstatSync(path.join(currentPath, entry)).isDirectory();

            if (entry === target) {
                return path.join(currentPath, entry);
            } else {
                if (isDir) {
                    let dirResult = query(path.join(currentPath, entry), target);

                    if (dirResult) {
                        return dirResult;
                    }
                }
            }
        } catch (e: any) {
            if (e.code !== "EPERM" && e.code !== "EBUSY") {
                throw e;
            }
        }
    }
    return undefined;
}

export default function find(target: string) {
    let startPath;
    if (os.type() === "Linux") {
        startPath = "/";

        return ""
    }

    if (os.type() === "Windows_NT") {
        let currentDir = process.cwd();
        startPath = currentDir.split('\\')[0] + "\\";

        return query(startPath, target);
    }

    return "Unknown OS";
}