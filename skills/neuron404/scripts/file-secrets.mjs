import { readFileSync } from 'node:fs';
import process from 'node:process';

function isFileSecret(name) {
    return (
        /^[A-Z][A-Z0-9_]*_(?:TOKEN|API_KEY|SECRET|PASSWORD)_FILE$/.test(name) ||
        name === 'CF_ACCESS_CLIENT_ID_FILE'
    );
}

export function loadFileSecrets(env = process.env) {
    for (const [fileName, filePath] of Object.entries(env)) {
        if (!isFileSecret(fileName) || !filePath) {
            continue;
        }
        const name = fileName.slice(0, -5);
        if (env[name]) {
            throw new Error(`Set only one of ${name} and ${fileName}.`);
        }
        let value;
        try {
            value = readFileSync(filePath, 'utf8').replace(/[\r\n]+$/, '');
        } catch {
            throw new Error(`Cannot read secret file configured by ${fileName}.`);
        }
        if (!value) {
            throw new Error(`Secret file configured by ${fileName} is empty.`);
        }
        env[name] = value;
        delete env[fileName];
    }
}
