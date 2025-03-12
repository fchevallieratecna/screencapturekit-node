import path from "path";
import { fileURLToPath } from "url";

export const getPackageRoot = () => {
  try {
    // Résolution via le point d'entrée du package
    const packageMainPath = require.resolve("screencapturekit");
    const finalPath = path.dirname(packageMainPath);
    return finalPath;
  } catch (e) {
    // Fallback pour le développement ES modules
    const __filename = fileURLToPath(import.meta.url);
    const finalPath = path.join(path.dirname(__filename));
    return finalPath;
  }
};

export const resolvePackagePath = (...segments: string[]) =>
  path.join(getPackageRoot(), ...segments);
