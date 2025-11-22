import fs from "fs";
import path from "path";
import os from "os";

const Searcher = new class Searcher {
    getDirectoryEntries(path: string): Array<string> {
        return fs.readdirSync(path);
    }
    getDrives(): Array<string> {
        let alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
        let results: Array<string> = [];

        for (let i = 0; i < alphabet.length; i++) {
            let letter = alphabet[i];
            let disk = `${letter.toUpperCase()}:/`;

            if (fs.existsSync(disk)) {
                if (fs.lstatSync(disk).isDirectory()) {
                    results.push(disk);
                }
            }
        }
        return results;
    }
    query(currentPath: string, target: string): string | undefined {
        let entries = this.getDirectoryEntries(currentPath);

        for (let i = 0; i < entries.length; i++) {
            try {
                let entry = entries[i];
                let isDir = fs.lstatSync(path.join(currentPath, entry)).isDirectory();

                if (entry === target) {
                    return path.join(currentPath, entry);
                } else {
                    if (isDir) {
                        let dirResult = this.query(path.join(currentPath, entry), target);

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
    find(target: string): string | undefined {
        if (os.type() === "Windows_NT") {
            let drives = this.getDrives();

            for (let i = 0; i < drives.length; i++) {
                let drive = drives[i];

                let result = this.query(drive, target);

                if (result) {
                    return result;
                }
            }

            return undefined;
        } else {
            return "Unsupported OS";
        }
    }
}

export default Searcher;