import path from "path";
import { fileURLToPath } from "url";

export const getPackageRoot = () => {
  try {
    // Résolution via le point d'entrée du package
    const packageMainPath = require.resolve("screencapturekit");
    return path.dirname(packageMainPath);
  } catch (e) {
    // Fallback pour le développement ES modules
    const __filename = fileURLToPath(import.meta.url);
    return path.join(path.dirname(__filename), "../..");
  }
};

export const resolvePackagePath = (...segments: string[]) =>
  path.join(getPackageRoot(), ...segments);
